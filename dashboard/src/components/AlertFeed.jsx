// AlertFeed.jsx
// Shows live LS-MC preemption recommendations and a utilisation
// line chart comparing FIFO vs Kairos over simulated time.

import { useState, useEffect } from "react"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts"

// Synthetic utilisation timeline for demo
function genTimeline(n = 24) {
  const data = []
  let fifo = 0.58, kai = 0.58
  for (let h = 0; h < n; h++) {
    fifo = Math.min(0.72, Math.max(0.52, fifo + (Math.random()-0.5)*0.04))
    kai  = Math.min(0.95, Math.max(0.68, kai  + (Math.random()-0.4)*0.03))
    data.push({ hour:`${h}h`, fifo: +fifo.toFixed(3), kairos: +kai.toFixed(3) })
  }
  return data
}

const TIMELINE = genTimeline()

// Demo alerts that cycle through to show the system is "live"
const DEMO_ALERTS = [
  { id:1, job:"job_047", action:"PREEMPT",  conf:0.91, elapsed:"6.2 h",  pv:0.40 },
  { id:2, job:"job_031", action:"CONTINUE", conf:0.87, elapsed:"0.8 h",  pv:0.35 },
  { id:3, job:"job_059", action:"PREEMPT",  conf:0.78, elapsed:"14.1 h", pv:0.45 },
  { id:4, job:"job_012", action:"CONTINUE", conf:0.94, elapsed:"1.4 h",  pv:0.30 },
  { id:5, job:"job_073", action:"PREEMPT",  conf:0.83, elapsed:"9.7 h",  pv:0.42 },
]

const S = {
  card:   { background:"#1e2535", border:"1px solid #2d3748",
            borderRadius:12, padding:"20px 24px" },
  title:  { fontSize:13, color:"#94a3b8", fontWeight:600, marginBottom:12,
            textTransform:"uppercase", letterSpacing:"0.05em" },
  alert:  { display:"flex", alignItems:"center", gap:10, padding:"9px 12px",
            borderRadius:7, marginBottom:8, fontSize:13 },
  tag:    { padding:"2px 9px", borderRadius:20, fontSize:11, fontWeight:700,
            flexShrink:0 },
}

function Alert({ item }) {
  const isPreempt = item.action === "PREEMPT"
  return (
    <div style={{
      ...S.alert,
      background: isPreempt ? "#2d1515" : "#0f2d1a",
      border: `1px solid ${isPreempt ? "#7f1d1d" : "#14532d"}`
    }}>
      <span style={{
        ...S.tag,
        background: isPreempt ? "#ef4444" : "#22c55e",
        color: "#fff"
      }}>
        {item.action}
      </span>
      <span style={{ color:"#94a3b8", flexGrow:1 }}>{item.job}</span>
      <span style={{ color:"#475569", fontSize:11 }}>
        {item.elapsed} · conf {(item.conf*100).toFixed(0)}%
      </span>
    </div>
  )
}

export default function AlertFeed({ queryResult }) {
  const [alerts, setAlerts] = useState(DEMO_ALERTS.slice(0, 3))
  const [tick, setTick] = useState(0)

  // Rotate demo alerts every 3 seconds
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 3000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (tick > 0) {
      const next = DEMO_ALERTS[tick % DEMO_ALERTS.length]
      setAlerts(prev => [next, ...prev].slice(0, 4))
    }
  }, [tick])

  // Inject real query result when available
  useEffect(() => {
    if (queryResult && !queryResult.error) {
      const live = {
        id:      Date.now(),
        job:     "job_query",
        action:  queryResult.should_preempt ? "PREEMPT" : "CONTINUE",
        conf:    queryResult.confidence || 0,
        elapsed: ((queryResult.elapsed_time || 0) / 3600).toFixed(1) + " h",
        pv:      queryResult.preemption_value || 0,
      }
      setAlerts(prev => [live, ...prev].slice(0, 4))
    }
  }, [queryResult])

  return (
    <div style={S.card}>
      <p style={S.title}>LS-MC Decision Feed</p>
      <div style={{ marginBottom:16 }}>
        {alerts.map(a => <Alert key={a.id} item={a} />)}
      </div>

      <p style={{...S.title, marginTop:20}}>Utilisation over Simulation Window</p>
      <ResponsiveContainer width="100%" height={170}>
        <LineChart data={TIMELINE}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2d3748" />
          <XAxis dataKey="hour" tick={{ fill:"#64748b", fontSize:10 }}
                 interval={Math.floor(TIMELINE.length / 6)} />
          <YAxis domain={[0.4, 1]} tickFormatter={v=>(v*100).toFixed(0)+"%"}
                 tick={{ fill:"#64748b", fontSize:10 }} />
          <Tooltip
            contentStyle={{ background:"#1e2535", border:"1px solid #2d3748", borderRadius:8 }}
            formatter={(v, n) => [(v*100).toFixed(1)+"%", n]}
          />
          <Legend wrapperStyle={{ fontSize:12, color:"#94a3b8" }} />
          <Line type="monotone" dataKey="fifo"   name="FIFO"
                stroke="#3b82f6" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="kairos" name="Kairos"
                stroke="#22c55e" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
