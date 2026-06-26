#pragma once
#include "job.hpp"
#include <vector>
#include <utility>
#include <cstdint>

// ================================================================
// LSMCParams: Configuration for the Longstaff-Schwartz pricer.
// ================================================================
struct LSMCParams {
    // --- Log-normal job duration model ---
    double mu;              // Location parameter (log-scale mean)
    double sigma;           // Scale parameter  (log-scale std dev)

    // --- Option payoff equivalents ---
    double completion_reward;   // Value awarded when job finishes (≡ option expiry payoff)
    double preemption_value;    // Value of freeing the slot now  (≡ early exercise payoff)

    // --- Simulation settings ---
    double   T_horizon;         // Max time horizon for paths (seconds)
    double   risk_free_rate;    // Continuous discount rate (use 0 for pure scheduling)
    int      n_paths;           // Number of Monte Carlo paths
    int      n_time_steps;      // Backward-induction time grid size
    uint64_t seed;              // RNG seed (for reproducibility)

    LSMCParams()
        : mu(9.0), sigma(1.5),
          completion_reward(1.0),
          preemption_value(0.35),
          T_horizon(7.0 * 24.0 * 3600.0),  // 7-day horizon
          risk_free_rate(0.0),
          n_paths(10000),
          n_time_steps(50),
          seed(42ULL)
    {}
};

// ================================================================
// PreemptionResult: Output of one LS-MC call.
// ================================================================
struct PreemptionResult {
    double continuation_value;  // E[discounted reward | don't preempt now]
    double preemption_value;    // Immediate reward from preemption
    bool   should_preempt;      // True iff preemption_value > continuation_value
    double confidence;          // Statistical confidence in the decision [0, 1]

    // Preemption exercise boundary: (time_seconds, progress_threshold)
    // A job with progress < threshold at that time should be preempted.
    std::vector<std::pair<double,double>> boundary_points;
    
    // Sample of the simulated MC paths for frontend visualization
    std::vector<double> sample_paths;
};

// ================================================================
// LSMC: The Longstaff-Schwartz Monte Carlo Pricer.
//
// Original paper: Longstaff & Schwartz (2001), "Valuing American
// Options by Simulation: A Simple Least-Squares Approach",
// Review of Financial Studies, 14(1), pp. 113-147.
//
// KAIROS CONTRIBUTION: Applies LS-MC to HPC job preemption by
// establishing the formal isomorphism:
//
//   American put option       ↔   Job preemption decision
//   ─────────────────────────────────────────────────────
//   Spot price S(t)           ↔   Job progress P(t)
//   Strike price K            ↔   Preemption cost C
//   Time to expiry T−t        ↔   Expected remaining time
//   Hold vs early exercise    ↔   Continue vs preempt
//   Exercise boundary S*(t)   ↔   Preemption policy P*(t)
//
// The SAME algorithm, with IDENTICAL mathematical structure,
// solves both problems.
// ================================================================
class LSMC {
public:
    static PreemptionResult compute_preemption_policy(
        const Job&        job,
        const LSMCParams& params
    );
};
