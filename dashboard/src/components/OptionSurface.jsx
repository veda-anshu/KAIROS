import React from 'react';

// Custom scientific color ramp (Dark -> Deep Purple -> Violet -> Cyan)
function valueToColor(v) {
  if (v < 0.33) {
    const t = v / 0.33;
    const r = Math.round(10 + t * (59 - 10));
    const g = Math.round(10 + t * (0 - 10));
    const b = Math.round(10 + t * (138 - 10));
    return `rgb(${r},${g},${b})`;
  } else if (v < 0.66) {
    const t = (v - 0.33) / 0.33;
    const r = Math.round(59 + t * (138 - 59));
    const g = Math.round(0 + t * (43 - 0));
    const b = Math.round(138 + t * (226 - 138));
    return `rgb(${r},${g},${b})`;
  } else {
    const t = (v - 0.66) / 0.34;
    const r = Math.round(138 + t * (0 - 138));
    const g = Math.round(43 + t * (240 - 43));
    const b = Math.round(226 + t * (255 - 226));
    return `rgb(${r},${g},${b})`;
  }
}

export default function OptionSurface({ data }) {
  if (!data || !data.continuation_values) return null;

  const { elapsed_hours, preempt_values, continuation_values } = data;
  const nP = preempt_values.length;
  const nE = elapsed_hours.length;

  const cellW = Math.max(16, Math.floor(660 / nE));
  const cellH = Math.max(16, Math.floor(360 / nP));

  return (
    <div className="card">
      <span className="label">OPTION VALUE SURFACE</span>
      <p className="subtitle" style={{ marginBottom: 24 }}>
        The multi-dimensional Preemption Boundary. Dark areas indicate immediate Preemption. 
        Bright Cyan areas indicate strong Continuation.
      </p>

      <div style={{ overflowX: "auto" }}>
        <div style={{ display:"flex", gap:0 }}>
          {/* Y-axis */}
          <div style={{
            writingMode:"vertical-rl", transform:"rotate(180deg)",
            fontSize:12, color:"var(--text-muted)", textAlign:"center",
            marginRight:16, alignSelf:"center", fontFamily: 'Outfit', letterSpacing: '0.1em'
          }}>
            PREEMPTION VALUE
          </div>

          <div>
            {/* Grid */}
            {[...continuation_values].reverse().map((row, pi_rev) => {
              const pi = nP - 1 - pi_rev;
              return (
                <div key={pi} style={{ display:"flex", alignItems:"center" }}>
                  <div style={{
                    width:35, fontSize:11, color:"var(--text-muted)",
                    textAlign:"right", paddingRight:12, flexShrink:0,
                    fontFamily: 'JetBrains Mono'
                  }}>
                    {preempt_values[pi]?.toFixed(2)}
                  </div>
                  {row.map((val, ei) => (
                    <div
                      key={ei}
                      title={`Time: ${elapsed_hours[ei]}h | Value: ${preempt_values[pi]} | C=${val.toFixed(4)}`}
                      style={{
                        width:  cellW,
                        height: cellH,
                        background: valueToColor(val),
                        cursor: "crosshair",
                        transition: "transform 0.1s, opacity 0.1s",
                        opacity: 0.9,
                        borderRadius: 2,
                        margin: 1
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.opacity = "1";
                        e.currentTarget.style.transform = "scale(1.2)";
                        e.currentTarget.style.zIndex = "10";
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.opacity = "0.9";
                        e.currentTarget.style.transform = "scale(1)";
                        e.currentTarget.style.zIndex = "1";
                      }}
                    />
                  ))}
                </div>
              );
            })}

            {/* X-axis */}
            <div style={{ display:"flex", paddingLeft:47, marginTop: 8 }}>
              {elapsed_hours.filter((_, i) => i % Math.ceil(nE/8) === 0).map((h, i) => (
                <div key={i} style={{
                  width: (cellW + 2) * Math.ceil(nE/8),
                  fontSize:11, color:"var(--text-muted)",
                  fontFamily: 'JetBrains Mono'
                }}>
                  {h}h
                </div>
              ))}
            </div>
            <div style={{ fontSize:12, color:"var(--text-muted)", paddingLeft:47, marginTop:8, fontFamily: 'Outfit', letterSpacing: '0.1em' }}>
              ELAPSED TIME (HOURS)
            </div>
          </div>
        </div>

        {/* Legend */}
        <div style={{
          display:"flex", alignItems:"center", gap:16,
          marginTop:32, fontSize:12, color:"var(--text-muted)",
          borderTop: '1px solid var(--border-color)',
          paddingTop: 16, fontFamily: 'Outfit'
        }}>
          <span>PREEMPT (DARK)</span>
          <div style={{
            width: 200, height: 8, borderRadius: 4,
            background: "linear-gradient(90deg, #0A0A0A, #3B008A, #8A2BE2, #00F0FF)"
          }} />
          <span style={{ color: 'var(--accent-cyan)' }}>CONTINUE (CYAN)</span>
        </div>
      </div>
    </div>
  );
}
