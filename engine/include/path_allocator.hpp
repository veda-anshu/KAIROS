#pragma once
#include <cstddef>
#include <memory>
#include <cassert>

// ================================================================
// PathAllocator: Fixed-size memory pool for Monte Carlo paths.
//
// In the LS-MC algorithm we simulate N paths, each a sequence of
// T_steps doubles. Allocating N separate heap vectors causes
// fragmentation and GC pressure in tight simulation loops.
//
// This allocator pre-allocates one flat array of N * T_steps doubles
// ("slabs"), then hands out pointers to individual slabs in O(1).
// Deallocation is also O(1) amortised — just marks the slab free.
//
// This is the slab allocator pattern used in OS kernels (Linux slab)
// and high-frequency trading memory managers.
// ================================================================

class PathAllocator {
    std::unique_ptr<double[]> pool_;       // Flat backing store
    std::unique_ptr<bool[]>   in_use_;     // Per-slab occupancy flags
    size_t n_slabs_;
    size_t path_length_;
    size_t next_hint_;                     // Amortises allocation scan

public:
    PathAllocator(size_t n_slabs, size_t path_length)
        : pool_    (new double[n_slabs * path_length]()),
          in_use_  (new bool  [n_slabs]()),
          n_slabs_ (n_slabs),
          path_length_(path_length),
          next_hint_(0)
    {}

    // Allocate one path slab. Returns nullptr if pool is exhausted.
    double* allocate() {
        // Search from hint forward, then wrap
        for (size_t pass = 0; pass < 2; ++pass) {
            size_t start = (pass == 0) ? next_hint_ : 0;
            size_t end   = (pass == 0) ? n_slabs_   : next_hint_;
            for (size_t i = start; i < end; ++i) {
                if (!in_use_[i]) {
                    in_use_[i] = true;
                    next_hint_ = (i + 1) % n_slabs_;
                    return pool_.get() + i * path_length_;
                }
            }
        }
        return nullptr; // Pool full
    }

    // Free a previously allocated slab.
    void deallocate(double* ptr) {
        ptrdiff_t offset = ptr - pool_.get();
        assert(offset >= 0 && static_cast<size_t>(offset) % path_length_ == 0);
        size_t idx = static_cast<size_t>(offset) / path_length_;
        assert(idx < n_slabs_);
        in_use_[idx] = false;
        if (idx < next_hint_) next_hint_ = idx;
    }

    size_t capacity()    const { return n_slabs_; }
    size_t path_length() const { return path_length_; }
};
