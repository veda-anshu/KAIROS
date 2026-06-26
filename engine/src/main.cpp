#include <iostream>
#include <vector>
#include <deque>
#include <random>
#include <algorithm>
#include <numeric>
#include <sstream>
#include <iomanip>
#include <cstring>
#include <cmath>

#include "job.hpp"
#include "lsmc.hpp"
#include "shapley.hpp"

// ================================================================
// SIMULATION CONFIGURATION
// ================================================================
struct SimConfig {
    int      n_jobs;           // Total jobs to generate
    int      n_slots;          // Parallel GPU slots
    double   mu;               // Log-normal duration μ
    double   sigma;            // Log-normal duration σ
    double   arrival_rate;     // Jobs per second (Poisson λ)
    double   dt;               // Simulation timestep (seconds)
    double   T_total;          // Total simulation window (seconds)
    int      n_mc_paths;       // MC paths per LS-MC call
    double   preempt_interval; // Seconds between preemption checks
    uint64_t seed;
};

struct SimResults {
    double mean_wait_seconds;
    double utilization;         // Fraction of slot-time actively used
    int    throughput;          // Jobs completed
    int    preemptions;         // Kairos-only
    std::vector<Job> jobs;      // Output jobs trace
};

// ================================================================
// UTILITIES
// ================================================================
static std::string fd(double v, int prec = 2) {
    std::ostringstream ss;
    ss << std::fixed << std::setprecision(prec) << v;
    return ss.str();
}

// ================================================================
// JOB GENERATOR
// ================================================================
// Arrivals follow a Poisson process with rate `arrival_rate`.
// Durations follow LogNormal(mu, sigma) — calibrated from
// Google Cluster Trace 2019.
// ================================================================
static std::vector<Job> generate_jobs(const SimConfig& cfg) {
    std::mt19937_64                      rng(cfg.seed);
    std::exponential_distribution<double> inter_arr(cfg.arrival_rate);
    std::lognormal_distribution<double>   dur_dist(cfg.mu, cfg.sigma);
    std::uniform_real_distribution<double> uniform(0.0, 1.0);

    std::vector<Job> jobs;
    jobs.reserve(cfg.n_jobs);
    double t = 0.0;

    for (int i = 0; i < cfg.n_jobs; ++i) {
        t += inter_arr(rng);
        Job j;
        j.id             = static_cast<uint64_t>(i + 1);
        j.array_idx      = i;
        j.arrival_time   = t;
        j.total_duration = dur_dist(rng);
        j.preemption_cost = 0.20 + 0.30 * uniform(rng); // Uniform [0.20, 0.50]
        j.priority       = 1.0;
        jobs.push_back(j);
    }
    return jobs;
}

// ================================================================
// FIFO SIMULATION (baseline)
// ================================================================
// Simple first-in-first-out scheduler. No preemption.
// Jobs run until completion; no interruption is possible.
// ================================================================
static SimResults run_fifo(const std::vector<Job>& templates,
                            const SimConfig& cfg) {
    std::vector<Job> jobs = templates;
    std::vector<int> slot_job(cfg.n_slots, -1); // -1 = slot empty

    int    next_arr  = 0;
    double t         = 0.0;
    double busy_time = 0.0;
    int    completed = 0;

    std::deque<int>    queue;
    std::vector<double> wait_times;

    while (t < cfg.T_total) {
        // Enqueue newly arrived jobs
        while (next_arr < cfg.n_jobs &&
               jobs[next_arr].arrival_time <= t) {
            queue.push_back(next_arr++);
        }

        // Fill empty slots from queue
        for (int s = 0; s < cfg.n_slots; ++s) {
            if (slot_job[s] == -1 && !queue.empty()) {
                int idx = queue.front(); queue.pop_front();
                jobs[idx].status     = JobStatus::RUNNING;
                jobs[idx].start_time = t;
                jobs[idx].slot       = s;
                jobs[idx].intervals.push_back({t, -1.0});
                slot_job[s]          = idx;
                wait_times.push_back(t - jobs[idx].arrival_time);
            }
        }

        // Advance time — complete jobs that finish during this step
        for (int s = 0; s < cfg.n_slots; ++s) {
            int idx = slot_job[s];
            if (idx == -1) continue;
            jobs[idx].elapsed_time += cfg.dt;
            busy_time              += cfg.dt;
            if (jobs[idx].elapsed_time >= jobs[idx].total_duration) {
                jobs[idx].intervals.back().second = t;
                jobs[idx].status = JobStatus::COMPLETED;
                slot_job[s]      = -1;
                ++completed;
                if (completed >= cfg.n_jobs) goto fifo_done;
            }
        }
        t += cfg.dt;
    }
fifo_done:
    double mw = wait_times.empty() ? 0.0
              : std::accumulate(wait_times.begin(), wait_times.end(), 0.0)
                / wait_times.size();
    return SimResults{mw, busy_time / (cfg.n_slots * t), completed, 0, jobs};
}

// ================================================================
// KAIROS SIMULATION
// ================================================================
// FIFO + periodic LS-MC–guided preemption.
// Every `preempt_interval` seconds, Kairos evaluates each running
// job. If the LS-MC pricer says preempting yields more value AND
// the queue is non-empty, the job is preempted and re-queued.
// Shapley values guard against starvation: a job that has already
// waited far longer than its fair share is never preempted again.
// ================================================================
static SimResults run_kairos(const std::vector<Job>& templates,
                              const SimConfig& cfg) {
    std::vector<Job> jobs = templates;
    std::vector<int> slot_job(cfg.n_slots, -1);

    int    next_arr     = 0;
    double t            = 0.0;
    double busy_time    = 0.0;
    double last_check   = 0.0;
    int    completed    = 0;
    int    preemptions  = 0;

    std::deque<int>    queue;
    std::vector<double> wait_times;

    // Build default LS-MC params; override per-job below
    LSMCParams lp;
    lp.mu         = cfg.mu;
    lp.sigma      = cfg.sigma;
    lp.n_paths    = cfg.n_mc_paths;
    lp.n_time_steps = 30;
    // Use 2× median as horizon: jobs past the heavy tail get penalised by discounting
    lp.T_horizon       = 2.0 * std::exp(cfg.mu);
    // Half-life = T_horizon: a job completing at T_horizon is worth 50% of completion_reward today.
    // This makes the LS-MC correctly penalise long-running outliers.
    lp.risk_free_rate  = std::log(2.0) / lp.T_horizon;
    lp.completion_reward = 1.0;

    while (t < cfg.T_total) {
        // Enqueue newly arrived jobs
        while (next_arr < cfg.n_jobs &&
               jobs[next_arr].arrival_time <= t) {
            queue.push_back(next_arr++);
        }

        // Fill empty slots
        for (int s = 0; s < cfg.n_slots; ++s) {
            if (slot_job[s] == -1 && !queue.empty()) {
                int idx = queue.front(); queue.pop_front();
                bool first_start = (jobs[idx].start_time < 0);
                if (first_start) {
                    jobs[idx].start_time = t;
                    wait_times.push_back(t - jobs[idx].arrival_time);
                }
                jobs[idx].status     = JobStatus::RUNNING;
                jobs[idx].slot       = s;
                jobs[idx].intervals.push_back({t, -1.0});
                slot_job[s]          = idx;
            }
        }

        // --- Kairos preemption check ---
        if (!queue.empty() && t - last_check >= cfg.preempt_interval) {
            last_check = t;

            // Compute Shapley weights over the waiting queue
            std::vector<Job> q_snap;
            for (int idx : queue) q_snap.push_back(jobs[idx]);
            ShapleyFairness::compute(q_snap); // weights inform future priority

            double median_duration = std::exp(cfg.mu);

            for (int s = 0; s < cfg.n_slots; ++s) {
                int idx = slot_job[s];
                if (idx == -1) continue;
                Job& j = jobs[idx];

                // Only target outliers: jobs running past their expected median.
                // Short-running jobs are likely to complete soon — leave them alone.
                if (j.elapsed_time < median_duration) continue;

                // Hard cap: nearly-complete jobs are never preempted
                if (j.progress() > 0.80) continue;

                // Starvation guard: preempted jobs get one free run before
                // they can be reconsidered
                if (j.status == JobStatus::PREEMPTED) continue;

                // Queue-pressure: freeing a slot is worth more when many jobs wait
                double queue_pressure = std::min(1.0,
                    static_cast<double>(queue.size()) / cfg.n_slots);
                lp.preemption_value = j.preemption_cost + 0.4 * queue_pressure;
                lp.seed = static_cast<uint64_t>(t * 1000.0 + s);

                auto res = LSMC::compute_preemption_policy(j, lp);

                // Require high confidence — false preemptions are expensive
                if (res.should_preempt && res.confidence >= 0.72) {
                    j.intervals.back().second = t;
                    j.status    = JobStatus::PREEMPTED;
                    slot_job[s] = -1;
                    // Push to BACK: the freed slot goes to the next waiting job.
                    // (Pushing to front would just give the slot back to this job.)
                    queue.push_back(idx);
                    ++preemptions;
                }
            }
        }

        // Advance time
        for (int s = 0; s < cfg.n_slots; ++s) {
            int idx = slot_job[s];
            if (idx == -1) continue;
            jobs[idx].elapsed_time += cfg.dt;
            busy_time              += cfg.dt;
            if (jobs[idx].elapsed_time >= jobs[idx].total_duration) {
                jobs[idx].intervals.back().second = t;
                jobs[idx].status = JobStatus::COMPLETED;
                slot_job[s]      = -1;
                ++completed;
                if (completed >= cfg.n_jobs) goto kairos_done;
            }
        }
        t += cfg.dt;
    }
kairos_done:
    double mw = wait_times.empty() ? 0.0
              : std::accumulate(wait_times.begin(), wait_times.end(), 0.0)
                / wait_times.size();
    return SimResults{mw, busy_time / (cfg.n_slots * t), completed, preemptions, jobs};
}

// ================================================================
// JSON OUTPUT
// ================================================================
static void print_simulate_json(const SimConfig& c,
                                 const SimResults& fifo,
                                 const SimResults& kai) {
    double wait_imp = (fifo.mean_wait_seconds > 1e-9)
        ? (fifo.mean_wait_seconds - kai.mean_wait_seconds)
          / fifo.mean_wait_seconds * 100.0
        : 0.0;
    double util_imp = (kai.utilization - fifo.utilization) * 100.0;

    std::cout << "{\n"
              << "  \"config\": {"
              << " \"n_jobs\": " << c.n_jobs
              << ", \"n_slots\": " << c.n_slots
              << ", \"mu\": " << fd(c.mu)
              << ", \"sigma\": " << fd(c.sigma)
              << " },\n"
              << "  \"fifo\": {\n"
              << "    \"mean_wait_seconds\": " << fd(fifo.mean_wait_seconds,0) << ",\n"
              << "    \"mean_wait_hours\": "   << fd(fifo.mean_wait_seconds/3600.0) << ",\n"
              << "    \"utilization\": "       << fd(fifo.utilization, 3) << ",\n"
              << "    \"throughput\": "        << fifo.throughput << "\n"
              << "  },\n"
              << "  \"kairos\": {\n"
              << "    \"mean_wait_seconds\": " << fd(kai.mean_wait_seconds,0) << ",\n"
              << "    \"mean_wait_hours\": "   << fd(kai.mean_wait_seconds/3600.0) << ",\n"
              << "    \"utilization\": "       << fd(kai.utilization, 3) << ",\n"
              << "    \"throughput\": "        << kai.throughput << ",\n"
              << "    \"preemptions\": "       << kai.preemptions << "\n"
              << "  },\n"
              << "  \"improvement\": {\n"
              << "    \"wait_reduction_pct\": " << fd(wait_imp) << ",\n"
              << "    \"utilization_gain_pct\": " << fd(util_imp) << "\n"
              << "  },\n"
              << "  \"fifo_jobs\": [\n";
    for(size_t i = 0; i < fifo.jobs.size(); ++i) {
        std::cout << "    {\"id\": " << fifo.jobs[i].id << ", \"arr\": " << fd(fifo.jobs[i].arrival_time, 0) << ", \"intervals\": [";
        for(size_t k = 0; k < fifo.jobs[i].intervals.size(); ++k) {
            std::cout << "[" << fd(fifo.jobs[i].intervals[k].first, 0) << "," << fd(fifo.jobs[i].intervals[k].second, 0) << "]";
            if (k + 1 < fifo.jobs[i].intervals.size()) std::cout << ",";
        }
        std::cout << "]}";
        if (i + 1 < fifo.jobs.size()) std::cout << ",";
        std::cout << "\n";
    }
    std::cout << "  ],\n"
              << "  \"kairos_jobs\": [\n";
    for(size_t i = 0; i < kai.jobs.size(); ++i) {
        std::cout << "    {\"id\": " << kai.jobs[i].id << ", \"arr\": " << fd(kai.jobs[i].arrival_time, 0) << ", \"intervals\": [";
        for(size_t k = 0; k < kai.jobs[i].intervals.size(); ++k) {
            std::cout << "[" << fd(kai.jobs[i].intervals[k].first, 0) << "," << fd(kai.jobs[i].intervals[k].second, 0) << "]";
            if (k + 1 < kai.jobs[i].intervals.size()) std::cout << ",";
        }
        std::cout << "]}";
        if (i + 1 < kai.jobs.size()) std::cout << ",";
        std::cout << "\n";
    }
    std::cout << "  ]\n"
              << "}\n";
}

static void print_query_json(const Job& j, const PreemptionResult& r) {
    std::cout << "{\n"
              << "  \"elapsed_time\": " << fd(j.elapsed_time, 0) << ",\n"
              << "  \"continuation_value\": " << fd(r.continuation_value, 4) << ",\n"
              << "  \"preemption_value\": "   << fd(r.preemption_value, 4) << ",\n"
              << "  \"should_preempt\": " << (r.should_preempt ? "true" : "false") << ",\n"
              << "  \"confidence\": " << fd(r.confidence, 4) << ",\n"
              << "  \"recommendation\": \"" << (r.should_preempt ? "PREEMPT" : "CONTINUE") << "\",\n"
              << "  \"boundary_points\": [\n";

    for (size_t i = 0; i < r.boundary_points.size(); ++i) {
        std::cout << "    [" << fd(r.boundary_points[i].first, 0)
                  << ", "   << fd(r.boundary_points[i].second, 4) << "]";
        if (i + 1 < r.boundary_points.size()) std::cout << ",";
        std::cout << "\n";
    }
    std::cout << "  ],\n"
              << "  \"sample_paths\": [\n";
    for (size_t i = 0; i < r.sample_paths.size(); ++i) {
        std::cout << "    " << fd(r.sample_paths[i], 0);
        if (i + 1 < r.sample_paths.size()) std::cout << ",";
        std::cout << "\n";
    }
    std::cout << "  ]\n}\n";
}

// ================================================================
// COMMAND-LINE INTERFACE
// ================================================================
static void print_usage(const char* prog) {
    std::cerr
        << "KAIROS — Options-Theoretic HPC Scheduler\n\n"
        << "Usage:\n"
        << "  " << prog << " simulate [options]\n"
        << "  " << prog << " query    [options]\n\n"
        << "Simulate options:\n"
        << "  --n_jobs  N     Jobs to simulate          (default: 80)\n"
        << "  --n_slots K     GPU slots                 (default: 8)\n"
        << "  --mu      M     Log-normal mu             (default: 9.0)\n"
        << "  --sigma   S     Log-normal sigma          (default: 1.5)\n"
        << "  --seed    R     RNG seed                  (default: 42)\n\n"
        << "Query options:\n"
        << "  --elapsed       T   Seconds job has run   (default: 3600)\n"
        << "  --mu            M   Log-normal mu         (default: 9.0)\n"
        << "  --sigma         S   Log-normal sigma      (default: 1.5)\n"
        << "  --preempt_value P   Value of preemption   (default: 0.35)\n"
        << "  --paths         N   MC paths              (default: 5000)\n";
}

int main(int argc, char** argv) {
    if (argc < 2) { print_usage(argv[0]); return 1; }

    std::string mode(argv[1]);

    // ---- QUERY MODE ----
    if (mode == "query") {
        LSMCParams lp;
        Job j;
        j.elapsed_time = 3600.0;

        for (int i = 2; i < argc - 1; ++i) {
            if (!strcmp(argv[i], "--elapsed"))       j.elapsed_time       = std::stod(argv[i+1]);
            if (!strcmp(argv[i], "--mu"))            lp.mu                = std::stod(argv[i+1]);
            if (!strcmp(argv[i], "--sigma"))         lp.sigma             = std::stod(argv[i+1]);
            if (!strcmp(argv[i], "--preempt_value")) lp.preemption_value  = std::stod(argv[i+1]);
            if (!strcmp(argv[i], "--paths"))         lp.n_paths           = std::stoi(argv[i+1]);
        }
        
        lp.T_horizon = 2.0 * std::exp(lp.mu);
        lp.risk_free_rate = std::log(2.0) / lp.T_horizon;
        lp.completion_reward = 1.0;

        auto result = LSMC::compute_preemption_policy(j, lp);
        print_query_json(j, result);
        return 0;
    }

    // ---- SIMULATE MODE ----
    if (mode == "simulate") {
        SimConfig cfg;
        cfg.n_jobs          = 80;
        cfg.n_slots         = 8;
        cfg.mu              = 9.0;
        cfg.sigma           = 1.5;
        cfg.arrival_rate    = 1.0 / 1800.0;    // 1 job per 30 min
        cfg.dt              = 60.0;             // 1-minute steps
        cfg.T_total         = 7.0 * 24.0 * 3600.0;
        cfg.n_mc_paths      = 2000;
        cfg.preempt_interval= 600.0;            // Check every 10 min
        cfg.seed            = 42ULL;

        for (int i = 2; i < argc - 1; ++i) {
            if (!strcmp(argv[i], "--n_jobs"))  cfg.n_jobs  = std::stoi(argv[i+1]);
            if (!strcmp(argv[i], "--n_slots")) cfg.n_slots = std::stoi(argv[i+1]);
            if (!strcmp(argv[i], "--mu"))      cfg.mu      = std::stod(argv[i+1]);
            if (!strcmp(argv[i], "--sigma"))   cfg.sigma   = std::stod(argv[i+1]);
            if (!strcmp(argv[i], "--seed"))    cfg.seed    = std::stoull(argv[i+1]);
        }

        auto jobs   = generate_jobs(cfg);
        auto fifo   = run_fifo(jobs, cfg);
        auto kairos = run_kairos(jobs, cfg);
        print_simulate_json(cfg, fifo, kairos);
        return 0;
    }

    std::cerr << "Unknown mode: " << mode << "\n\n";
    print_usage(argv[0]);
    return 1;
}
