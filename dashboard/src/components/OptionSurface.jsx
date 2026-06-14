// OptionSurface.jsx
// Renders the "option value surface" — the core visualisation of Kairos.
// Shows continuation value C(elapsed_time, preemption_value) as a 2-D
// colour heatmap. The bright-to-dark boundary is the preemption frontier:
// cells above it = CONTINUE, cells below = PREEMPT.
//
// This is the visual that makes judges (and quant interviewers) lean in.

const S = {
  card:   { background:"#1e2535", border:"1px solid #2d3748",
            borderRadius:12, padding:"20px 24px", marginTop:24 },
  title:  { fontSize:13, color:"#94a3b8", fontWeight:600,
            marginBottom:4, textTransform:"uppercase", letterSpacing:"0.05em" },
  sub:    { fontSize:12, color:"#475569", marginBottom:16 },
  wrap:   { overflowX:"auto" },
  legend: { display:"flex", alignItems:"center", gap:8,
            marginTop:14, fontSize:11, color:"#64748b" },
  grad:   { width:120, height:12, borderRadius:4,
            background:"linear-gradient(90deg,#1e3a5f,#2563eb,#22c55e,#fbbf24,#ef4444)" },
}

// Colour ramp: blue (low continuation → PREEMPT) → green → amber → red (high → CONTINUE)
function valueToColor(v) {
  // v in [0, 1]
  if (v < 0.25) {
    // dark blue → blue
    const t = v / 0.25
    const r = Math.round(30  + t * (37  - 30))
    const g = Math.round(58  + t * (99  - 58))
    const b = Math.round(95  + t * (235 - 95))
    return `rgb(${r},${g},${b})`
  } else if (v < 0.5) {
    const t = (v - 0.25) / 0.25
    const r = Math.round(37  + t * (34  - 37))
    const g = Math.round(99  + t * (197 - 99))
    const b = Math.round(235 + t * (94  - 235))
    return `rgb(${r},${g},${b})`
  } else if (v < 0.75) {
    const t = (v - 0.5) / 0.25
    const r = Math.round(34  + t * (251 - 34))
    const g = Math.round(197 + t * (191 - 197))
    const b = Math.round(94  + t * (36  - 94))
    return `rgb(${r},${g},${b})`
  } else {
    const t = (v - 0.75) / 0.25
    const r = Math.round(251 + t * (239 - 251))
    const g = Math.round(191 + t * (68  - 191))
    const b = Math.round(36  + t * (68  - 36))
    return `rgb(${r},${g},${b})`
  }
}

export default function OptionSurface({ data }) {
  if (!data || !data.continuation_values) return null

  const { elapsed_hours, preempt_values, continuation_values } = data
  // continuation_values[preempt_idx][elapsed_idx]
  const nP = preempt_values.length
  const nE = elapsed_hours.length

  // Cell size — scale to fill ~700px wide
  const cellW = Math.max(20, Math.floor(660 / nE))
  const cellH = Math.max(18, Math.floor(360 / nP))

  return (
    <div style={S.card}>
      <p style={S.title}>Option Value Surface — Preemption Exercise Boundary</p>
      <p style={S.sub}>
        C(elapsed_time, preemption_value) — continuation value estimated via LS-MC.
        &nbsp;The boundary separates CONTINUE (bright) from PREEMPT (dark).
      </p>

      <div style={S.wrap}>
        <div style={{ display:"flex", gap:0 }}>
          {/* Y-axis label */}
          <div style={{
            writingMode:"vertical-rl", transform:"rotate(180deg)",
            fontSize:11, color:"#475569", textAlign:"center",
            marginRight:6, alignSelf:"center"
          }}>
            preemption value →
          </div>

          <div>
            {/* Heatmap grid */}
            {[...continuation_values].reverse().map((row, pi_rev) => {
              const pi = nP - 1 - pi_rev
              return (
                <div key={pi} style={{ display:"flex", alignItems:"center" }}>
                  <div style={{
                    width:30, fontSize:10, color:"#475569",
                    textAlign:"right", paddingRight:5, flexShrink:0
                  }}>
                    {preempt_values[pi]?.toFixed(2)}
                  </div>
                  {row.map((val, ei) => (
                    <div
                      key={ei}
                      title={`t=${elapsed_hours[ei]}h  pv=${preempt_values[pi]}  C=${val}`}
                      style={{
                        width:  cellW,
                        height: cellH,
                        background: valueToColor(val),
                        cursor: "crosshair",
                        transition: "opacity .1s",
                        opacity: 0.9,
                      }}
                      onMouseEnter={e => e.currentTarget.style.opacity = "1"}
                      onMouseLeave={e => e.currentTarget.style.opacity = "0.9"}
                    />
                  ))}
                </div>
              )
            })}

            {/* X-axis labels */}
            <div style={{ display:"flex", paddingLeft:35 }}>
              {elapsed_hours.filter((_, i) => i % Math.ceil(nE/8) === 0).map((h, i) => (
                <div key={i} style={{
                  width: cellW * Math.ceil(nE/8),
                  fontSize:10, color:"#475569", paddingTop:4
                }}>
                  {h}h
                </div>
              ))}
            </div>
            <div style={{ fontSize:11, color:"#475569", paddingLeft:35, marginTop:2 }}>
              elapsed time →
            </div>
          </div>
        </div>

        {/* Legend */}
        <div style={S.legend}>
          <span>PREEMPT</span>
          <div style={S.grad} />
          <span>CONTINUE</span>
          <span style={{ marginLeft:16, color:"#475569" }}>
            Hover cells for exact values
          </span>
        </div>
      </div>
    </div>
  )
}
