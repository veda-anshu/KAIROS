#include "lsmc.hpp"
#include "path_allocator.hpp"

#include <cmath>
#include <random>
#include <thread>
#include <vector>
#include <numeric>
#include <algorithm>
#include <array>
#include <cassert>

// ================================================================
// MATHEMATICAL OVERVIEW
// ================================================================
// The Longstaff-Schwartz algorithm (LS-MC) solves the optimal
// stopping problem via simulation + least-squares regression.
//
// STANDARD AMERICAN OPTION SETTING:
//   At each time t, the holder chooses:
//     Exercise now  →  receive payoff h(S(t))  immediately
//     Wait          →  receive E[discounted future payoff | S(t)]
//   Optimal policy: exercise iff h(S(t)) ≥ E[continuation | S(t)]
//
// KAIROS MAPPING (job preemption):
//   "Exercise now"   → preempt job, free GPU slot   → value = preemption_value
//   "Wait"           → let job run to completion    → value = completion_reward
//   State S(t)       → job progress P(t) = t / T_total
//   LS regression    → estimates E[continuation | P(t)]
//   Exercise boundary→ preemption boundary P*(t)
//
// ALGORITHM STEPS:
//   1. Simulate N paths of job total duration T ~ LogNormal(μ, σ)
//      conditional on T > t_elapsed (job is still running now).
//   2. At terminal time T_max: set cash flow = completion_reward if
//      job completes, else = preemption_value (forced preemption).
//   3. Backward induction from T_max to t_elapsed:
//      a. Identify "in-the-money" paths (job still running).
//      b. Regress discounted future cash flows on Laguerre basis
//         functions of current progress x = t / T_path.
//      c. If immediate preemption_value > fitted continuation:
//         update cash flow to preemption_value (optimal preempt).
//   4. Continuation value = mean discounted cash flow over all paths.
//   5. Decision: preempt iff preemption_value > continuation_value.
// ================================================================


// ----------------------------------------------------------------
// BASIS FUNCTIONS  (Laguerre polynomials, as in LS 2001 §2)
// ----------------------------------------------------------------
// These are the standard regression basis used in the original paper.
// Laguerre polynomials are well-conditioned for values in [0,1].
static inline double L0(double x) {
    return std::exp(-x * 0.5);
}
static inline double L1(double x) {
    return std::exp(-x * 0.5) * (1.0 - x);
}
static inline double L2(double x) {
    return std::exp(-x * 0.5) * (1.0 - 2.0*x + 0.5*x*x);
}


// ----------------------------------------------------------------
// GAUSSIAN ELIMINATION  (3×3 OLS normal equations)
// ----------------------------------------------------------------
// Solve the normal equations for the 3-parameter OLS regression:
//   (Φᵀ Φ) α = Φᵀ y
// where Φ is the (M × 3) design matrix of Laguerre basis values
// and y is the M-vector of discounted continuation values.
//
// Uses partial pivoting for numerical stability.
// Returns false if the system is singular (< 3 in-the-money paths).
static bool solve_3x3(
    std::array<std::array<double,3>,3> A,   // Passed by value — modified in place
    std::array<double,3>               b,
    std::array<double,3>&              x
) {
    for (int col = 0; col < 3; ++col) {
        // --- Partial pivot ---
        int pivot = col;
        for (int row = col + 1; row < 3; ++row) {
            if (std::abs(A[row][col]) > std::abs(A[pivot][col]))
                pivot = row;
        }
        if (std::abs(A[pivot][col]) < 1e-14) {
            x = {0.0, 0.0, 0.0};
            return false;
        }
        std::swap(A[col], A[pivot]);
        std::swap(b[col], b[pivot]);

        // --- Eliminate below diagonal ---
        for (int row = col + 1; row < 3; ++row) {
            double f = A[row][col] / A[col][col];
            for (int k = col; k < 3; ++k) A[row][k] -= f * A[col][k];
            b[row] -= f * b[col];
        }
    }

    // --- Back substitution ---
    for (int row = 2; row >= 0; --row) {
        x[row] = b[row];
        for (int k = row + 1; k < 3; ++k) x[row] -= A[row][k] * x[k];
        x[row] /= A[row][row];
    }
    return true;
}


// ----------------------------------------------------------------
// CONDITIONAL LOG-NORMAL SAMPLING
// ----------------------------------------------------------------
// Sample T ~ LogNormal(mu, sigma)  given  T > t_elapsed.
//
// We use simple rejection sampling, which is efficient when
// t_elapsed is close to the distribution's left tail. For jobs
// far into their runtime, the acceptance probability remains
// reasonable because the log-normal has a heavy right tail.
static double sample_cond_lognormal(
    double mu, double sigma, double t_elapsed,
    std::mt19937_64& rng
) {
    std::lognormal_distribution<double> dist(mu, sigma);
    for (int attempt = 0; attempt < 50000; ++attempt) {
        double T = dist(rng);
        if (T > t_elapsed) return T;
    }
    // Fallback: extend duration by 3× — only reached for extreme t_elapsed
    return t_elapsed * 3.0;
}


// ----------------------------------------------------------------
// THREAD WORKER: simulate a range of paths independently
// ----------------------------------------------------------------
// Each thread gets a unique seed offset so their RNG streams are
// independent. This is the standard approach for parallel MC.
static void simulate_paths_worker(
    int    start,
    int    end,
    double mu,
    double sigma,
    double t_elapsed,
    uint64_t seed,
    std::vector<double>& path_durations   // shared output buffer
) {
    std::mt19937_64 rng(seed);
    for (int i = start; i < end; ++i) {
        path_durations[i] = sample_cond_lognormal(mu, sigma, t_elapsed, rng);
    }
}


// ----------------------------------------------------------------
// MAIN LS-MC COMPUTATION
// ----------------------------------------------------------------
PreemptionResult LSMC::compute_preemption_policy(
    const Job&        job,
    const LSMCParams& params
) {
    const int    N    = params.n_paths;
    const int    S    = params.n_time_steps;
    const double t0   = job.elapsed_time;
    const double Tmax = t0 + params.T_horizon;
    const double dt   = params.T_horizon / static_cast<double>(S);

    // ============================================================
    // PHASE 1: PARALLEL PATH SIMULATION
    // ============================================================
    // Distribute N paths across all hardware threads.
    // Each thread uses a distinct RNG seed to ensure independence.
    std::vector<double> path_durations(N);

    unsigned int n_threads     = std::max(1u, std::thread::hardware_concurrency());
    int          paths_per_thr = N / static_cast<int>(n_threads);

    std::vector<std::thread> workers;
    workers.reserve(n_threads);

    for (unsigned int t = 0; t < n_threads; ++t) {
        int start = static_cast<int>(t) * paths_per_thr;
        int end   = (t == n_threads - 1) ? N : (start + paths_per_thr);

        // Prime-based seed offset guarantees non-overlapping sequences
        uint64_t thread_seed = params.seed + static_cast<uint64_t>(t) * 999983ULL;

        workers.emplace_back(
            simulate_paths_worker,
            start, end,
            params.mu, params.sigma, t0,
            thread_seed,
            std::ref(path_durations)
        );
    }
    for (auto& w : workers) w.join();

    // ============================================================
    // PHASE 2: TERMINAL CASH FLOWS
    // ============================================================
    // At the horizon T_max:
    //   - Job completed (T_i ≤ T_max) → cash flow = completion_reward
    //   - Job still running            → forced preemption = preemption_value
    std::vector<double> cash_flows(N);
    for (int i = 0; i < N; ++i) {
        cash_flows[i] = (path_durations[i] <= Tmax)
                      ?  params.completion_reward
                      :  params.preemption_value;
    }

    // ============================================================
    // PHASE 3: LONGSTAFF-SCHWARTZ BACKWARD INDUCTION
    // ============================================================
    // Step backwards from time step S-1 down to step 0.
    // At each step:
    //   (a) Find paths where job is still running ("in-the-money").
    //   (b) Regress discounted future CF on Laguerre(progress).
    //   (c) Update CF where immediate exercise is optimal.
    // ============================================================

    std::vector<std::pair<double,double>> boundary_points;
    boundary_points.reserve(S);

    // Per-step discount factor: e^{-r × dt}
    // With r = log(2)/T_horizon, value halves over the full horizon.
    const double discount = std::exp(-params.risk_free_rate * dt);

    for (int s = S - 1; s >= 0; --s) {
        double t_s = t0 + static_cast<double>(s) * dt;

        // --- (a) Identify in-the-money paths ---
        std::vector<int> itm;
        itm.reserve(N / 2);

        for (int i = 0; i < N; ++i) {
            if (path_durations[i] > t_s) {
                itm.push_back(i);
            } else {
                // Job completed before this step on path i.
                // Lock in the completion reward.
                cash_flows[i] = params.completion_reward;
            }
        }

        // Need at least 3 paths for a 3-parameter regression.
        if (static_cast<int>(itm.size()) < 5) continue;

        // --- (b) Build normal equations ---
        // Σ Lⱼ(xᵢ)Lₖ(xᵢ) α = Σ Lⱼ(xᵢ) yᵢ
        // where xᵢ = progress at t_s, yᵢ = discounted continuation
        std::array<std::array<double,3>,3> A = {{{0,0,0},{0,0,0},{0,0,0}}};
        std::array<double,3>               b = {0.0, 0.0, 0.0};

        for (int i : itm) {
            double x   = t_s / path_durations[i];   // Progress ∈ (0, 1)
            double y   = discount * cash_flows[i];   // Discounted continuation (LS 2001 §2)

            double phi[3] = { L0(x), L1(x), L2(x) };

            for (int j = 0; j < 3; ++j) {
                b[j] += y * phi[j];
                for (int k = 0; k < 3; ++k)
                    A[j][k] += phi[j] * phi[k];
            }
        }

        std::array<double,3> alpha = {0.0, 0.0, 0.0};
        if (!solve_3x3(A, b, alpha)) continue;

        // --- (c) Update exercise policy ---
        // For each in-the-money path: if preempting now is better
        // than the expected continuation, update the cash flow.
        double step_boundary = -1.0;

        for (int i : itm) {
            double x = t_s / path_durations[i];
            double continuation = alpha[0]*L0(x) + alpha[1]*L1(x) + alpha[2]*L2(x);

            if (params.preemption_value > continuation) {
                cash_flows[i] = params.preemption_value;
                // Track the highest progress at which preemption is optimal
                if (x > step_boundary) step_boundary = x;
            }
        }

        if (step_boundary >= 0.0) {
            boundary_points.emplace_back(t_s, step_boundary);
        }
    }

    // ============================================================
    // PHASE 4: RESULT AGGREGATION
    // ============================================================
    double mean_cf = std::accumulate(cash_flows.begin(), cash_flows.end(), 0.0) / N;

    // Standard error of the mean → used to compute confidence
    double variance = 0.0;
    for (double cf : cash_flows) variance += (cf - mean_cf) * (cf - mean_cf);
    variance /= (N - 1);
    double std_error = std::sqrt(variance / static_cast<double>(N));

    // Confidence: how many standard errors separate us from the boundary?
    // High confidence = the decision margin >> std error of MC estimate.
    double margin     = std::abs(mean_cf - params.preemption_value);
    double confidence = (std_error < 1e-10)
                      ? 1.0
                      : std::min(1.0, margin / (margin + 2.0 * std_error));

    bool should_preempt = (params.preemption_value > mean_cf);

    return PreemptionResult{
        mean_cf,
        params.preemption_value,
        should_preempt,
        confidence,
        boundary_points
    };
}
