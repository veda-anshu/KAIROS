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

function Alert({ item }) {
  const isPreempt = item.action === "PREEMPT"
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12, padding: "10px 14px",
      borderRadius: 8, marginBottom: 10, fontSize: 13,
      background: isPreempt ? "rgba(239, 68, 68, 0.1)" : "rgba(34, 197, 94, 0.1)",
      border: `1px solid ${isPreempt ? "rgba(239, 68, 68, 0.2)" : "rgba(34, 197, 94, 0.2)"}`,
      transition: "all 0.2s ease"
    }}>
      <span className={isPreempt ? "badge badge-danger" : "badge badge-kairos"}>
        {item.action}
      </span>
      <span style={{ color:"var(--text-main)", flexGrow:1, fontWeight: 600 }}>{item.job}</span>
      <span style={{ color:"var(--text-muted)", fontSize:12 }}>
        {item.elapsed} <span style={{ margin: '0 4px', color: 'var(--border-highlight)' }}>|</span> conf {(item.conf*100).toFixed(0)}%
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
    <div className="card">
      <span className="label">LS-MC Decision Feed</span>
      <div style={{ marginBottom: 28, marginTop: 12 }}>
        {alerts.map(a => <Alert key={a.id} item={a} />)}
      </div>

      <span className="label" style={{ marginBottom: 16 }}>Utilisation over Simulation Window</span>
      <ResponsiveContainer width="100%" height={170}>
        <LineChart data={TIMELINE}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
          <XAxis dataKey="hour" tick={{ fill:"var(--text-muted)", fontSize:11 }}
                 interval={Math.floor(TIMELINE.length / 6)} axisLine={false} tickLine={false} />
          <YAxis domain={[0.4, 1]} tickFormatter={v=>(v*100).toFixed(0)+"%"}
                 tick={{ fill:"var(--text-muted)", fontSize:11 }} axisLine={false} tickLine={false} />
          <Tooltip
            contentStyle={{ background:"var(--bg-card)", border:"1px solid var(--border-color)", borderRadius:8, backdropFilter: 'blur(12px)' }}
            formatter={(v, n) => [(v*100).toFixed(1)+"%", n]}
            labelStyle={{ color: "var(--text-main)" }}
          />
          <Legend wrapperStyle={{ fontSize:13, color:"var(--text-muted)", paddingTop: 10 }} />
          <Line type="monotone" dataKey="fifo"   name="FIFO"
                stroke="var(--accent-blue)" strokeWidth={3} dot={false} activeDot={{ r: 6, fill: "var(--accent-blue)" }} />
          <Line type="monotone" dataKey="kairos" name="Kairos"
                stroke="var(--accent-green)" strokeWidth={3} dot={false} activeDot={{ r: 6, fill: "var(--accent-green)" }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
