import { useState, useEffect } from "react"
import MetricCards   from "./components/MetricCards.jsx"
import ClusterGrid   from "./components/ClusterGrid.jsx"
import OptionSurface from "./components/OptionSurface.jsx"
import AlertFeed     from "./components/AlertFeed.jsx"

const S = {
  wrap:    { maxWidth:1280, margin:"0 auto", padding:"28px 20px" },
  header:  { marginBottom:32 },
  h1:      { fontSize:26, fontWeight:700, color:"#e2e8f0", letterSpacing:"-0.5px" },
  sub:     { fontSize:13, color:"#64748b", marginTop:6 },
  card:    { background:"#1e2535", borderRadius:12, padding:"20px 24px",
             border:"1px solid #2d3748", marginBottom:24 },
  label:   { fontSize:11, color:"#64748b", textTransform:"uppercase",
             letterSpacing:"0.06em", marginBottom:6, display:"block" },
  input:   { width:"100%", padding:"8px 12px", background:"#0f1117",
             border:"1px solid #2d3748", borderRadius:7, color:"#e2e8f0",
             fontSize:14, outline:"none" },
  grid4:   { display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",
             gap:12, alignItems:"flex-end" },
  btn:     { padding:"9px 22px", background:"#3b82f6", color:"#fff", border:"none",
             borderRadius:7, cursor:"pointer", fontWeight:600, fontSize:14,
             width:"100%", transition:"background .15s" },
  btnSm:   { padding:"9px 20px", background:"#6366f1", color:"#fff", border:"none",
             borderRadius:7, cursor:"pointer", fontWeight:600, fontSize:14,
             transition:"background .15s" },
  row2:    { display:"grid", gridTemplateColumns:"1fr 1fr", gap:20 },
  err:     { color:"#f87171", fontSize:13, marginTop:10 },
  tag:     { display:"inline-block", padding:"3px 10px", borderRadius:20,
             fontSize:12, fontWeight:600 },
}

const DEMO = {
  config:      { n_jobs:80, n_slots:8, mu:9.0, sigma:1.5 },
  fifo:        { mean_wait_hours:4.23, utilization:0.614, throughput:68 },
  kairos:      { mean_wait_hours:1.79, utilization:0.841, throughput:74, preemptions:12 },
  improvement: { wait_reduction_pct:57.7, utilization_gain_pct:22.7 }
}

export default function App() {
  const [simData,   setSimData]   = useState(DEMO)
  const [queryRes,  setQueryRes]  = useState(null)
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState(null)
  const [config,    setConfig]    = useState({ n_jobs:80, n_slots:8, mu:9.0, sigma:1.5 })
  const [jobQ,      setJobQ]      = useState({ elapsed_time:3600, preemption_value:0.35 })
  const [surface,   setSurface]   = useState(null)

  // Load surface data on mount
  useEffect(() => {
    fetch(`/api/surface?mu=${config.mu}&sigma=${config.sigma}`)
      .then(r => r.json()).then(setSurface).catch(() => {})
  }, [config.mu, config.sigma])

  const runSim = async () => {
    setLoading(true); setError(null)
    try {
      const r = await fetch("/api/simulate", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify(config)
      })
      const d = await r.json()
      if (d.error) setError(d.error)
      else setSimData(d)
    } catch { setError("API unreachable. Start Flask: cd api && python app.py") }
    setLoading(false)
  }

  const queryJob = async () => {
    setLoading(true)
    try {
      const r = await fetch("/api/query", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ ...jobQ, mu:config.mu, sigma:config.sigma })
      })
      setQueryRes(await r.json())
    } catch { setError("Query failed") }
    setLoading(false)
  }

  return (
    <div style={S.wrap}>
      {/* ── Header ── */}
      <header style={S.header}>
        <h1 style={S.h1}>⚡ Kairos</h1>
        <p style={S.sub}>
          Options-Theoretic Preemptive Scheduler &nbsp;·&nbsp;
          Longstaff-Schwartz Monte Carlo &nbsp;·&nbsp;
          Shapley Value Fairness
        </p>
      </header>

      {/* ── Simulation Config ── */}
      <div style={S.card}>
        <p style={{...S.label, marginBottom:16, fontSize:13, color:"#94a3b8"}}>
          Cluster Simulation Parameters
        </p>
        <div style={S.grid4}>
          {Object.entries(config).map(([k, v]) => (
            <label key={k}>
              <span style={S.label}>{k}</span>
              <input
                type="number" value={v}
                step={k==="mu"||k==="sigma" ? 0.1 : 1}
                onChange={e => setConfig(c => ({...c, [k]: +e.target.value}))}
                style={S.input}
              />
            </label>
          ))}
          <div>
            <span style={S.label}>&nbsp;</span>
            <button style={S.btn} disabled={loading} onClick={runSim}>
              {loading ? "Running…" : "▶ Run Simulation"}
            </button>
          </div>
        </div>
        {error && <p style={S.err}>{error}</p>}
      </div>

      {/* ── Metric Cards ── */}
      {simData && <MetricCards data={simData} />}

      {/* ── Cluster Grid + Alert Feed ── */}
      {simData && (
        <div style={S.row2}>
          <ClusterGrid slots={config.n_slots} />
          <AlertFeed queryResult={queryRes} />
        </div>
      )}

      {/* ── Option Surface ── */}
      {surface && <OptionSurface data={surface} />}

      {/* ── Single Job Query ── */}
      <div style={S.card}>
        <p style={{...S.label, fontSize:13, color:"#94a3b8", marginBottom:16}}>
          Single Job — Preemption Query
        </p>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr auto", gap:12, alignItems:"flex-end" }}>
          <label>
            <span style={S.label}>elapsed_time (seconds)</span>
            <input type="number" value={jobQ.elapsed_time}
              onChange={e => setJobQ(q => ({...q, elapsed_time:+e.target.value}))}
              style={S.input} />
          </label>
          <label>
            <span style={S.label}>preemption_value [0–1]</span>
            <input type="number" step="0.05" min="0" max="1" value={jobQ.preemption_value}
              onChange={e => setJobQ(q => ({...q, preemption_value:+e.target.value}))}
              style={S.input} />
          </label>
          <button style={S.btnSm} disabled={loading} onClick={queryJob}>
            Query LS-MC
          </button>
        </div>

        {queryRes && !queryRes.error && (
          <div style={{
            marginTop:16, padding:"14px 18px", borderRadius:8,
            background: queryRes.should_preempt ? "#2d1515" : "#0f2d1a",
            border:`1px solid ${queryRes.should_preempt ? "#ef4444" : "#22c55e"}`
          }}>
            <span style={{
              ...S.tag,
              background: queryRes.should_preempt ? "#ef4444" : "#22c55e",
              color:"#fff", marginBottom:10
            }}>
              {queryRes.recommendation || (queryRes.should_preempt ? "PREEMPT" : "CONTINUE")}
            </span>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:16, marginTop:10 }}>
              {[
                ["Continuation Value", (queryRes.continuation_value||0).toFixed(4)],
                ["Preemption Value",   (queryRes.preemption_value  ||0).toFixed(4)],
                ["Confidence",         ((queryRes.confidence||0)*100).toFixed(1)+"%"],
              ].map(([lbl, val]) => (
                <div key={lbl}>
                  <div style={{ fontSize:11, color:"#64748b" }}>{lbl}</div>
                  <div style={{ fontSize:18, fontWeight:700, color:"#e2e8f0" }}>{val}</div>
                </div>
              ))}
            </div>
            {queryRes.boundary_points?.length > 0 && (
              <p style={{ fontSize:12, color:"#64748b", marginTop:10 }}>
                Exercise boundary computed at {queryRes.boundary_points.length} time steps.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
