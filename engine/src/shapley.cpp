#include "shapley.hpp"
#include <algorithm>
#include <numeric>
#include <cmath>
#include <random>

// ================================================================
// CHARACTERISTIC FUNCTION
// ================================================================
// v(S) = total priority-weighted value delivered by running only
// the jobs in coalition S.  For an additive game each job
// contributes independently, so v(S) = Σ_{j∈S} priority_j.
// This simplification makes marginal contributions easy to compute
// while still producing meaningful fairness corrections.
// ================================================================
static double coalition_value(
    const std::vector<Job>& jobs,
    const std::vector<int>& members
) {
    double v = 0.0;
    for (int idx : members) v += jobs[idx].priority;
    return v;
}

// log(n!) using log-Gamma to avoid integer overflow for n > 20
static double log_factorial(int n) {
    if (n <= 1) return 0.0;
    double result = 0.0;
    for (int k = 2; k <= n; ++k) result += std::log(static_cast<double>(k));
    return result;
}

// ================================================================
// EXACT SHAPLEY  (n ≤ 12)
// ================================================================
// Iterate over all 2^n subsets S not containing player i.
// Shapley value φᵢ = Σ_S weight(S) × [v(S∪{i}) − v(S)]
// where weight(S) = |S|!(n−|S|−1)! / n!
// ================================================================
static std::vector<double> shapley_exact(const std::vector<Job>& jobs) {
    int n = static_cast<int>(jobs.size());
    std::vector<double> phi(n, 0.0);
    double log_n_fact = log_factorial(n);

    for (int i = 0; i < n; ++i) {
        double phi_i = 0.0;

        for (int mask = 0; mask < (1 << n); ++mask) {
            if (mask & (1 << i)) continue;   // i already in S, skip

            // Build coalition S from bitmask
            std::vector<int> S, S_union_i;
            for (int j = 0; j < n; ++j) {
                if (mask & (1 << j)) {
                    S.push_back(j);
                    S_union_i.push_back(j);
                }
            }
            S_union_i.push_back(i);

            int s_size = static_cast<int>(S.size());

            // weight = |S|! × (n − |S| − 1)! / n!
            double log_w = log_factorial(s_size)
                         + log_factorial(n - s_size - 1)
                         - log_n_fact;
            double weight = std::exp(log_w);

            phi_i += weight * (coalition_value(jobs, S_union_i)
                             - coalition_value(jobs, S));
        }

        phi[i] = phi_i;
    }
    return phi;
}

// ================================================================
// MONTE CARLO SHAPLEY  (n > 12)
// ================================================================
// Sample random permutations; each job's Shapley value ≈ its
// average marginal contribution across sampled orderings.
// Reference: Castro et al. (2009), "Polynomial calculation of the
// Shapley value based on sampling", Computers & OR.
// ================================================================
static std::vector<double> shapley_mc(
    const std::vector<Job>& jobs,
    int n_samples = 2000
) {
    int n = static_cast<int>(jobs.size());
    std::vector<double> phi(n, 0.0);
    std::mt19937 rng(0x5AFEBEEF);

    std::vector<int> perm(n);
    std::iota(perm.begin(), perm.end(), 0);

    for (int sample = 0; sample < n_samples; ++sample) {
        std::shuffle(perm.begin(), perm.end(), rng);
        std::vector<int> prefix;
        prefix.reserve(n);
        double prev_v = 0.0;

        for (int k = 0; k < n; ++k) {
            int i = perm[k];
            prefix.push_back(i);
            double new_v = coalition_value(jobs, prefix);
            phi[i] += (new_v - prev_v);
            prev_v = new_v;
        }
    }

    for (double& p : phi) p /= static_cast<double>(n_samples);
    return phi;
}

// ================================================================
// PUBLIC API
// ================================================================
std::vector<double> ShapleyFairness::compute(const std::vector<Job>& jobs) {
    if (jobs.empty())  return {};
    if (jobs.size() == 1) return {1.0};

    std::vector<double> phi = (jobs.size() <= 12)
                            ? shapley_exact(jobs)
                            : shapley_mc(jobs);

    // Normalise so weights sum to 1.0
    double total = std::accumulate(phi.begin(), phi.end(), 0.0);
    if (total > 1e-12) {
        for (double& p : phi) p /= total;
    } else {
        std::fill(phi.begin(), phi.end(), 1.0 / jobs.size());
    }

    return phi;
}

void ShapleyFairness::apply_correction(
    std::vector<Job>&          jobs,
    const std::vector<double>& weights
) {
    if (jobs.size() != weights.size()) return;
    for (size_t i = 0; i < jobs.size(); ++i)
        jobs[i].shapley_weight = weights[i];
}
