#pragma once
#include <cstdint>
#include <string>
#include <algorithm>

enum class JobStatus {
    PENDING,     // Waiting in queue
    RUNNING,     // Currently executing on a GPU slot
    PREEMPTED,   // Interrupted by Kairos, re-queued
    COMPLETED    // Finished successfully
};

struct Job {
    uint64_t id;
    int      array_idx;         // Index in the jobs[] vector
    double   arrival_time;      // When job entered the queue (seconds)
    double   start_time;        // When job first began executing (-1 if not started)
    double   elapsed_time;      // Total wall-clock time this job has been running
    double   total_duration;    // True total runtime (ground truth, hidden from scheduler)
    double   preemption_cost;   // Normalized value of freeing this job's slot [0, 1]
    double   priority;          // Base scheduling priority (higher = more urgent)
    double   shapley_weight;    // Fairness weight from cooperative game theory
    JobStatus status;
    int       slot;             // GPU slot index (-1 if not running)

    Job()
        : id(0), array_idx(0),
          arrival_time(0), start_time(-1),
          elapsed_time(0), total_duration(0),
          preemption_cost(0.35), priority(1.0),
          shapley_weight(1.0),
          status(JobStatus::PENDING), slot(-1) {}

    // Fraction of total work completed [0, 1)
    double progress() const {
        if (total_duration <= 0 || elapsed_time <= 0) return 0.0;
        return std::min(1.0, elapsed_time / total_duration);
    }

    // Expected remaining runtime (seconds)
    double remaining_time() const {
        return std::max(0.0, total_duration - elapsed_time);
    }

    std::string status_str() const {
        switch (status) {
            case JobStatus::PENDING:   return "PENDING";
            case JobStatus::RUNNING:   return "RUNNING";
            case JobStatus::PREEMPTED: return "PREEMPTED";
            case JobStatus::COMPLETED: return "COMPLETED";
            default:                   return "UNKNOWN";
        }
    }
};
