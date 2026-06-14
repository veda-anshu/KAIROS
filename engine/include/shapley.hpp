#pragma once
#include "job.hpp"
#include <vector>

// ================================================================
// ShapleyFairness: Cooperative game-theoretic fairness layer.
//
// The Shapley value φᵢ of agent i in a cooperative game with
// characteristic function v(S) is:
//
//   φᵢ = Σ_{S ⊆ N\{i}} [|S|!(|N|-|S|-1)! / |N|!] × [v(S∪{i}) − v(S)]
//
// This is the UNIQUE value satisfying four axioms: efficiency,
// symmetry, null-player, and additivity (Shapley, 1953).
//
// In Kairos, the Shapley value measures each job's FAIR SHARE of
// cluster throughput. When a job has received far less than its
// Shapley-fair allocation, Kairos raises its effective priority
// to prevent resource starvation — even when LS-MC says wait.
//
// For queues with n ≤ 12 jobs: exact O(2^n) computation.
// For n > 12: Monte Carlo approximation (Castro et al., 2009).
// ================================================================
class ShapleyFairness {
public:
    // Returns normalised Shapley weights (sums to 1.0).
    static std::vector<double> compute(const std::vector<Job>& jobs);

    // Write shapley_weight into each Job struct.
    static void apply_correction(
        std::vector<Job>&          jobs,
        const std::vector<double>& weights
    );
};
