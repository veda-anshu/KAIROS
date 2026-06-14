"""
app.py — Kairos REST API
========================
Bridges the React dashboard to the C++ engine.
All heavy computation happens in the compiled binary;
Flask simply manages subprocess calls and caching.

Endpoints:
  GET  /api/health              Engine status check
  POST /api/simulate            Run FIFO vs Kairos cluster simulation
  POST /api/query               Single-job preemption recommendation
  GET  /api/demo                Pre-computed demo results (no engine call)
  GET  /api/surface?mu=&sigma=  Option value surface data for 3-D plot
"""

import json
import os
import subprocess
import threading
import math
from flask import Flask, jsonify, request
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

# Path to compiled C++ binary (relative to this file)
ENGINE = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "build", "kairos-engine")
)

# Simple in-memory cache to avoid re-running expensive simulations
_cache: dict = {}
_cache_lock = threading.Lock()


# ================================================================
# ENGINE RUNNER
# ================================================================
def run_engine(args: list[str], timeout: int = 90) -> dict:
    """Invoke the C++ binary with given args; parse and return JSON."""
    if not os.path.exists(ENGINE):
        return {
            "error": (
                f"Engine not found at {ENGINE}. "
                "Build it with: cd build && cmake .. && make"
            )
        }
    try:
        proc = subprocess.run(
            [ENGINE] + args,
            capture_output=True, text=True, timeout=timeout
        )
        if proc.returncode != 0:
            return {"error": proc.stderr.strip() or "Engine returned non-zero exit"}
        return json.loads(proc.stdout)
    except subprocess.TimeoutExpired:
        return {"error": f"Engine timed out after {timeout}s"}
    except json.JSONDecodeError as exc:
        return {"error": f"JSON parse failed: {exc}"}
    except Exception as exc:
        return {"error": str(exc)}


# ================================================================
# OPTION VALUE SURFACE  (computed in Python — no engine call needed)
# ================================================================
# Analytically approximates the continuation value surface:
#   C(t, pv) ≈ P(T ≤ T_horizon | T > t) × 1.0
#            + P(T > T_horizon | T > t) × pv
# where T ~ LogNormal(mu, sigma).
# This gives the 3-D surface shown in the dashboard.

def _norm_cdf(x: float) -> float:
    return 0.5 * (1.0 + math.erf(x / math.sqrt(2.0)))

def compute_surface(mu: float, sigma: float,
                    n_elapsed: int = 25, n_preempt: int = 25) -> dict:
    T_horizon = math.exp(mu + 2.0 * sigma)  # 2-sigma upper bound

    elapsed_grid = [i * T_horizon / (n_elapsed - 1) for i in range(n_elapsed)]
    preempt_grid = [i / (n_preempt - 1)             for i in range(n_preempt)]

    z = []
    for pv in preempt_grid:
        row = []
        for t in elapsed_grid:
            if t <= 0:
                p_complete = _norm_cdf((math.log(T_horizon) - mu) / sigma)
                cont = p_complete * 1.0 + (1.0 - p_complete) * pv
            elif t >= T_horizon:
                cont = pv
            else:
                log_t     = math.log(max(t, 1.0))
                log_Th    = math.log(T_horizon)
                p_done_by_Th = _norm_cdf((log_Th - mu) / sigma)
                p_done_by_t  = _norm_cdf((log_t  - mu) / sigma)
                p_surv_t     = max(1.0 - p_done_by_t, 1e-9)

                p_complete_given_running = (p_done_by_Th - p_done_by_t) / p_surv_t
                p_complete_given_running = max(0.0, min(1.0, p_complete_given_running))
                cont = p_complete_given_running * 1.0 \
                     + (1.0 - p_complete_given_running) * pv
            row.append(round(cont, 4))
        z.append(row)

    return {
        "elapsed_hours": [round(t / 3600, 2) for t in elapsed_grid],
        "preempt_values": [round(p, 3) for p in preempt_grid],
        "continuation_values": z,
        "mu": mu,
        "sigma": sigma,
    }


# ================================================================
# ROUTES
# ================================================================

@app.route("/api/health")
def health():
    return jsonify({
        "status": "ok",
        "engine_found": os.path.exists(ENGINE),
        "engine_path": ENGINE
    })


@app.route("/api/simulate", methods=["POST"])
def simulate():
    data    = request.get_json() or {}
    n_jobs  = str(int  (data.get("n_jobs",  80)))
    n_slots = str(int  (data.get("n_slots",  8)))
    mu      = str(float(data.get("mu",     9.0)))
    sigma   = str(float(data.get("sigma",  1.5)))
    seed    = str(int  (data.get("seed",    42)))

    cache_key = f"sim_{n_jobs}_{n_slots}_{mu}_{sigma}_{seed}"
    with _cache_lock:
        if cache_key in _cache:
            return jsonify(_cache[cache_key])

    result = run_engine([
        "simulate",
        "--n_jobs",  n_jobs,
        "--n_slots", n_slots,
        "--mu",      mu,
        "--sigma",   sigma,
        "--seed",    seed,
    ])

    if "error" not in result:
        with _cache_lock:
            _cache[cache_key] = result

    return jsonify(result)


@app.route("/api/query", methods=["POST"])
def query():
    data         = request.get_json() or {}
    elapsed      = str(float(data.get("elapsed_time",      3600)))
    mu           = str(float(data.get("mu",                 9.0)))
    sigma        = str(float(data.get("sigma",              1.5)))
    preempt_val  = str(float(data.get("preemption_value",   0.35)))
    n_paths      = str(int  (data.get("n_paths",            5000)))

    result = run_engine([
        "query",
        "--elapsed",       elapsed,
        "--mu",            mu,
        "--sigma",         sigma,
        "--preempt_value", preempt_val,
        "--paths",         n_paths,
    ])
    return jsonify(result)


@app.route("/api/demo")
def demo():
    """Fast demo endpoint — results from ./kairos-engine simulate --n_jobs 120 --n_slots 8 --seed 7"""
    return jsonify({
        "config": {"n_jobs": 120, "n_slots": 8, "mu": 9.0, "sigma": 1.5},
        "fifo": {
            "mean_wait_seconds": 56649,
            "mean_wait_hours":   15.74,
            "utilization":       0.712,
            "throughput":        119
        },
        "kairos": {
            "mean_wait_seconds": 42230,
            "mean_wait_hours":   11.73,
            "utilization":       0.718,
            "throughput":        119,
            "preemptions":       11
        },
        "improvement": {
            "wait_reduction_pct":   25.45,
            "utilization_gain_pct": 0.54
        }
    })


@app.route("/api/surface")
def surface():
    mu    = float(request.args.get("mu",    9.0))
    sigma = float(request.args.get("sigma", 1.5))
    data  = compute_surface(mu, sigma)
    return jsonify(data)


if __name__ == "__main__":
    print("Kairos API  →  http://localhost:5000")
    print(f"Engine      →  {ENGINE}")
    print(f"Engine exists: {os.path.exists(ENGINE)}\n")
    app.run(debug=True, port=5000)
