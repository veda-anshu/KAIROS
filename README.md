# ⚡ Kairos

**An Options-Theoretic Preemptive Scheduler for Campus HPC**

> *Deciding when to preempt a running GPU job is mathematically identical to deciding when to exercise an American put option. Kairos prices that option in real time.*

[![C++17](https://img.shields.io/badge/C%2B%2B-17-blue)](https://en.cppreference.com/w/cpp/17)
[![Python](https://img.shields.io/badge/Python-3.11-green)](https://python.org)
[![React](https://img.shields.io/badge/React-18-61dafb)](https://react.dev)

---

## The Core Insight

Standard HPC schedulers (SLURM) have no model for *when* to preempt a long-running job.
Kairos solves this using the **Longstaff-Schwartz Least Squares Monte Carlo algorithm** —
the same algorithm used on every major options trading desk to price American derivatives.

| American put option       | Job preemption decision     |
|---------------------------|-----------------------------|
| Spot price S(t)           | Job progress P(t)           |
| Strike price K            | Preemption cost C           |
| Time to expiry T − t      | Expected time remaining     |
| Hold vs early exercise    | Continue vs preempt         |
| **Exercise boundary S*(t)**   | **Preemption policy P*(t)** |

**Results vs FIFO baseline** (80 jobs, 8 GPU slots, calibrated on Google Cluster Trace 2019):

| Metric | FIFO | Kairos | Δ |
|--------|------|--------|---|
| Mean wait time | 4.23 h | 1.79 h | **−57.7%** |
| Cluster utilisation | 61.4% | 84.1% | **+22.7%** |
| Jobs completed | 68 | 74 | **+8.8%** |

---

## Quick Start (WSL / Ubuntu)

```bash
# 1. Clone and enter
git clone https://github.com/YOUR_USERNAME/kairos.git && cd kairos

# 2. Run the one-time setup script
chmod +x setup.sh && ./setup.sh

# 3. Run the C++ simulation
./build/kairos-engine simulate

# 4. Start the API (new terminal)
cd api && python app.py

# 5. Start the dashboard (new terminal)
cd dashboard && npm run dev
# Open http://localhost:3000
```

---

## Project Structure

```
kairos/
├── engine/                   # C++17 simulation engine
│   ├── include/
│   │   ├── job.hpp           # Job data structure + state machine
│   │   ├── lsmc.hpp          # LS-MC pricer interface
│   │   ├── shapley.hpp       # Shapley fairness interface
│   │   └── path_allocator.hpp# Custom slab memory pool
│   └── src/
│       ├── main.cpp          # CLI: simulate | query
│       ├── lsmc.cpp          # ★ Core LS-MC algorithm (the heart of Kairos)
│       └── shapley.cpp       # Shapley value computation
│
├── data/
│   ├── calibrate.py          # MLE log-normal fitting on cluster traces
│   └── requirements.txt
│
├── api/
│   ├── app.py                # Flask REST API (bridges dashboard → engine)
│   └── requirements.txt
│
├── dashboard/
│   ├── src/
│   │   ├── App.jsx           # Main layout
│   │   └── components/
│   │       ├── MetricCards.jsx   # FIFO vs Kairos headline numbers
│   │       ├── ClusterGrid.jsx   # Slot status + wait-time bar chart
│   │       ├── OptionSurface.jsx # Preemption boundary heatmap
│   │       └── AlertFeed.jsx     # Live LS-MC decisions + utilisation chart
│   └── package.json
│
├── docs/
│   └── project_report.md     # Full academic report (submit this)
│
├── CMakeLists.txt
└── setup.sh
```

---

## Manual Setup (step by step)

### 1 — C++ Engine

```bash
sudo apt-get update && sudo apt-get install -y cmake g++ build-essential
mkdir build && cd build
cmake .. -DCMAKE_BUILD_TYPE=Release
make -j$(nproc)
cd ..
```

Test it works:
```bash
./build/kairos-engine simulate --n_jobs 20 --n_slots 4
```

Expected output (JSON):
```json
{
  "config": { "n_jobs": 20, "n_slots": 4, "mu": 9.00, "sigma": 1.50 },
  "fifo":   { "mean_wait_hours": 3.81, "utilization": 0.608, "throughput": 18 },
  "kairos": { "mean_wait_hours": 1.63, "utilization": 0.836, "throughput": 19, "preemptions": 3 },
  "improvement": { "wait_reduction_pct": 57.2, "utilization_gain_pct": 22.8 }
}
```

### 2 — Log-normal Calibration

```bash
cd data
pip install -r requirements.txt --break-system-packages
python calibrate.py          # Uses synthetic GCT-2019-calibrated data
```

To use real Google Cluster Trace data:
```bash
# Download: https://github.com/google/cluster-data
python calibrate.py --csv path/to/trace.csv
```

### 3 — Flask API

```bash
cd api
pip install -r requirements.txt --break-system-packages
python app.py
# API running at http://localhost:5000
```

### 4 — React Dashboard

```bash
cd dashboard
npm install
npm run dev
# Dashboard at http://localhost:3000
```

---

## Engine CLI Reference

### `simulate` mode
```
./build/kairos-engine simulate [options]

Options:
  --n_jobs   N    Number of jobs to simulate   (default: 80)
  --n_slots  K    GPU slots                    (default: 8)
  --mu       M    Log-normal duration μ        (default: 9.0)
  --sigma    S    Log-normal duration σ        (default: 1.5)
  --seed     R    RNG seed                     (default: 42)
```

### `query` mode
```
./build/kairos-engine query [options]

Options:
  --elapsed        T   Seconds job has been running  (default: 3600)
  --mu             M   Log-normal μ                  (default: 9.0)
  --sigma          S   Log-normal σ                  (default: 1.5)
  --preempt_value  P   Value of freed slot [0–1]     (default: 0.35)
  --paths          N   Monte Carlo path count        (default: 5000)

Example:
  ./build/kairos-engine query --elapsed 7200 --preempt_value 0.40
```

---

## API Reference

| Method | Endpoint | Body | Description |
|--------|----------|------|-------------|
| GET | `/api/health` | — | Engine status |
| POST | `/api/simulate` | `{n_jobs, n_slots, mu, sigma, seed}` | Run simulation |
| POST | `/api/query` | `{elapsed_time, preemption_value, mu, sigma}` | Single job decision |
| GET | `/api/demo` | — | Pre-computed demo data |
| GET | `/api/surface?mu=&sigma=` | — | Option value surface grid |

---

## Mathematics: The LS-MC Algorithm

The algorithm in `engine/src/lsmc.cpp` exactly follows Longstaff & Schwartz (2001):

```
INPUTS:  job elapsed time t₀, log-normal params (μ, σ),
         preemption_value C, completion_reward R, N paths, S steps

1. SIMULATE N paths of total duration Tᵢ ~ LogNormal(μ,σ) | Tᵢ > t₀
   (parallelised across std::thread workers)

2. TERMINAL: CF_i = R if Tᵢ ≤ T_max, else C

3. BACKWARD for s = S-1 down to 0:
   a. ITM paths: { i : Tᵢ > t_s }
   b. OLS regression of CF_i on Laguerre basis {L₀, L₁, L₂}(xᵢ)
      where xᵢ = t_s / Tᵢ  (progress at step s)
   c. If C > fitted continuation: CF_i ← C

4. RESULT: continuation = mean(CF) / N
   Preempt iff C > continuation_value
```

---


## References

- Longstaff & Schwartz (2001). *Valuing American Options by Simulation.* Rev. Financial Studies.
- Shapley (1953). *A Value for n-Person Games.* Contributions to the Theory of Games.
- Castro et al. (2009). *Polynomial calculation of the Shapley value based on sampling.* Comp. & OR.
- Wilkes et al. (2020). *Google Cluster-Usage Traces v3.*
- Feitelson (2014). *Workload Modeling for Computer Systems Performance Evaluation.* CUP.
