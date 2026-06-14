// MetricCards.jsx
// Shows the headline FIFO vs Kairos comparison numbers.
// This is the "demo moment" — the numbers that win the competition.

const S = {
  grid:  { display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(210px,1fr))",
           gap:16, marginBottom:24 },
  card:  { background:"#1e2535", border:"1px solid #2d3748",
           borderRadius:12, padding:"18px 20px" },
  badge: { display:"inline-block", padding:"2px 9px", borderRadius:20,
           fontSize:11, fontWeight:600, marginBottom:10 },
  val:   { fontSize:28, fontWeight:700, color:"#e2e8f0", lineHeight:1 },
  lbl:   { fontSize:12, color:"#64748b", marginTop:4 },
  imp:   { fontSize:13, fontWeight:600, marginTop:8 },
}

function Card({ label, fifoVal, kairosVal, unit = "", higherIsBetter = false, suffix = "" }) {
  const better = higherIsBetter
    ? kairosVal > fifoVal
    : kairosVal < fifoVal

  const pct = fifoVal > 0
    ? Math.abs((kairosVal - fifoVal) / fifoVal * 100).toFixed(1)
    : "—"

  const arrow = better ? "↑" : "↓"
  const color = better ? "#22c55e" : "#f87171"

  return (
    <div style={S.card}>
      <p style={{ fontSize:12, color:"#94a3b8", marginBottom:10 }}>{label}</p>

      <div style={{ display:"flex", gap:20, alignItems:"flex-end" }}>
        <div>
          <span style={{...S.badge, background:"#1e3a5f", color:"#60a5fa"}}>FIFO</span>
          <div style={S.val}>{fifoVal}{unit}</div>
        </div>
        <div>
          <span style={{...S.badge, background:"#14532d", color:"#4ade80"}}>KAIROS</span>
          <div style={{...S.val, color:"#4ade80"}}>{kairosVal}{unit}</div>
        </div>
      </div>

      <p style={{...S.imp, color}}>
        {arrow} {pct}% {better ? "improvement" : "change"}{suffix}
      </p>
    </div>
  )
}

function ImprovementBanner({ data }) {
  const { wait_reduction_pct, utilization_gain_pct } = data.improvement || {}
  return (
    <div style={{
      ...S.card,
      background:"linear-gradient(135deg,#0f2d1a 0%,#0a2340 100%)",
      border:"1px solid #22c55e", gridColumn:"1 / -1"
    }}>
      <p style={{ fontSize:12, color:"#4ade80", fontWeight:600, marginBottom:6 }}>
        KAIROS vs FIFO — OVERALL IMPROVEMENT
      </p>
      <div style={{ display:"flex", gap:32, flexWrap:"wrap" }}>
        <div>
          <div style={{ fontSize:36, fontWeight:800, color:"#4ade80" }}>
            {wait_reduction_pct?.toFixed(1)}%
          </div>
          <div style={{ fontSize:13, color:"#86efac" }}>reduction in mean wait time</div>
        </div>
        <div>
          <div style={{ fontSize:36, fontWeight:800, color:"#60a5fa" }}>
            {utilization_gain_pct?.toFixed(1)}%
          </div>
          <div style={{ fontSize:13, color:"#93c5fd" }}>gain in cluster utilisation</div>
        </div>
        <div>
          <div style={{ fontSize:36, fontWeight:800, color:"#a78bfa" }}>
            {data.kairos?.preemptions ?? "—"}
          </div>
          <div style={{ fontSize:13, color:"#c4b5fd" }}>LS-MC–guided preemptions</div>
        </div>
      </div>
    </div>
  )
}

export default function MetricCards({ data }) {
  if (!data?.fifo || !data?.kairos) return null
  const { fifo, kairos } = data

  return (
    <div style={S.grid}>
      <ImprovementBanner data={data} />
      <Card
        label="Mean Wait Time"
        fifoVal={(fifo.mean_wait_hours   || 0).toFixed(2)}
        kairosVal={(kairos.mean_wait_hours || 0).toFixed(2)}
        unit=" h"
        higherIsBetter={false}
      />
      <Card
        label="Cluster Utilisation"
        fifoVal={((fifo.utilization   || 0) * 100).toFixed(1)}
        kairosVal={((kairos.utilization || 0) * 100).toFixed(1)}
        unit="%"
        higherIsBetter={true}
      />
      <Card
        label="Jobs Completed"
        fifoVal={fifo.throughput   || 0}
        kairosVal={kairos.throughput || 0}
        higherIsBetter={true}
      />
    </div>
  )
}
