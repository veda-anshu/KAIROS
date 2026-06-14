// ClusterGrid.jsx
// Simulated cluster slot view + bar chart of wait-time comparison.
// Uses Recharts for the bar chart.

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts"
import { useState, useEffect } from "react"

const STATUSES = ["RUNNING", "RUNNING", "RUNNING", "PREEMPTED",
                  "RUNNING", "RUNNING", "PENDING",  "PENDING"]
const STATUS_COLOR = {
  RUNNING:   "#22c55e",
  PREEMPTED: "#f59e0b",
  PENDING:   "#3b82f6",
  IDLE:      "#334155",
}

const S = {
  card:  { background:"#1e2535", border:"1px solid #2d3748",
           borderRadius:12, padding:"20px 24px" },
  title: { fontSize:13, color:"#94a3b8", fontWeight:600,
           marginBottom:16, textTransform:"uppercase", letterSpacing:"0.05em" },
  slotGrid: { display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8, marginBottom:20 },
  slot:  { borderRadius:8, padding:"10px 8px", textAlign:"center" },
  snum:  { fontSize:11, color:"rgba(255,255,255,0.6)" },
  slbl:  { fontSize:10, fontWeight:700, marginTop:3 },
  legend:{ display:"flex", gap:14, marginBottom:16, flexWrap:"wrap" },
  ldot:  { width:10, height:10, borderRadius:"50%", display:"inline-block", marginRight:5 },
}

const CHART_DATA = [
  { name:"0–2 h",  fifo:41, kairos:8  },
  { name:"2–4 h",  fifo:22, kairos:14 },
  { name:"4–8 h",  fifo:18, kairos:31 },
  { name:"8–16 h", fifo:12, kairos:28 },
  { name:">16 h",  fifo:7,  kairos:19 },
]

function Slot({ index, status }) {
  const color = STATUS_COLOR[status] || STATUS_COLOR.IDLE
  return (
    <div style={{ ...S.slot, background: color + "22", border: `1px solid ${color}55` }}>
      <div style={S.snum}>GPU {index}</div>
      <div style={{ ...S.slbl, color }}>{status}</div>
    </div>
  )
}

export default function ClusterGrid({ slots = 8 }) {
  const [tick, setTick] = useState(0)

  // Animate slot states every 2 seconds for demo effect
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 2000)
    return () => clearInterval(id)
  }, [])

  const rotated = STATUSES.map((s, i) => {
    if (tick % 5 === 0 && i === 3) return "PREEMPTED"
    if (tick % 7 === 0 && i === 6) return "RUNNING"
    return s
  })

  return (
    <div style={S.card}>
      <p style={S.title}>Cluster Slot Status</p>

      <div style={S.legend}>
        {Object.entries(STATUS_COLOR).map(([k, c]) => (
          <span key={k} style={{ fontSize:11, color:"#94a3b8" }}>
            <span style={{ ...S.ldot, background: c }} />
            {k}
          </span>
        ))}
      </div>

      <div style={S.slotGrid}>
        {Array.from({length: slots}, (_, i) => (
          <Slot key={i} index={i} status={rotated[i % rotated.length]} />
        ))}
      </div>

      <p style={{...S.title, marginBottom:12}}>Job Wait-Time Distribution (% of jobs)</p>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={CHART_DATA} barSize={14}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2d3748" />
          <XAxis dataKey="name" tick={{ fill:"#64748b", fontSize:11 }} />
          <YAxis tick={{ fill:"#64748b", fontSize:11 }} unit="%" />
          <Tooltip
            contentStyle={{ background:"#1e2535", border:"1px solid #2d3748", borderRadius:8 }}
            labelStyle={{ color:"#e2e8f0" }}
          />
          <Legend wrapperStyle={{ fontSize:12, color:"#94a3b8" }} />
          <Bar dataKey="fifo"   name="FIFO"   fill="#3b82f6" radius={[3,3,0,0]} />
          <Bar dataKey="kairos" name="Kairos" fill="#22c55e" radius={[3,3,0,0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
