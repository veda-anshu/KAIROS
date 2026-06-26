// MetricCards.jsx
// Minimalist, professional metric cards.

function Card({ label, fifoVal, kairosVal, unit = "", higherIsBetter = false, suffix = "" }) {
  const better = higherIsBetter
    ? kairosVal > fifoVal
    : kairosVal < fifoVal;

  const pct = fifoVal > 0
    ? Math.abs((kairosVal - fifoVal) / fifoVal * 100).toFixed(1)
    : "—";

  const arrow = better ? "↓" : "↑"; // We'll adapt arrow per context, or just show text
  const indicator = better ? (higherIsBetter ? "↗" : "↘") : (higherIsBetter ? "↘" : "↗");

  return (
    <div className="card" style={{ padding: '20px 24px' }}>
      <span className="label" style={{ color: 'var(--text-muted)' }}>{label}</span>

      <div style={{ display:"flex", justifyContent: 'space-between', alignItems:"flex-end", marginTop: 16 }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-subtle)', marginBottom: 4, fontFamily: 'JetBrains Mono' }}>FIFO BASELINE</div>
          <div style={{ fontSize: 24, fontWeight: 500, color: "var(--text-muted)", fontFamily: 'JetBrains Mono' }}>
            {fifoVal}{unit}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 11, color: 'var(--text-main)', marginBottom: 4, fontFamily: 'JetBrains Mono' }}>KAIROS ENGINE</div>
          <div style={{ fontSize: 32, fontWeight: 600, color: "var(--text-main)", fontFamily: 'JetBrains Mono' }}>
            {kairosVal}{unit}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border-color)', fontSize: 12, fontFamily: 'Inter', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between' }}>
        <span>Relative Change</span>
        <span style={{ color: better ? 'var(--text-main)' : 'var(--text-muted)', fontFamily: 'JetBrains Mono' }}>
          {indicator} {pct}% {suffix}
        </span>
      </div>
    </div>
  );
}

function ImprovementBanner({ data }) {
  const { wait_reduction_pct, utilization_gain_pct } = data.improvement || {};
  return (
    <div className="card" style={{
      gridColumn: "1 / -1",
      border: '1px solid var(--border-highlight)',
      background: 'rgba(255,255,255,0.02)'
    }}>
      <div style={{ display:"flex", justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <span className="label" style={{ color: "var(--text-main)" }}>KAIROS VS FIFO: AGGREGATE GAINS</span>
          <p className="subtitle" style={{ maxWidth: 600, marginTop: 4, fontSize: 13 }}>
            Simulation results proving the effectiveness of the Longstaff-Schwartz Monte Carlo scheduling policy.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 48, textAlign: 'right' }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, fontFamily: 'JetBrains Mono' }}>WAIT TIME REDUCTION</div>
            <div style={{ fontSize: 36, fontWeight: 600, color: 'var(--text-main)', fontFamily: 'JetBrains Mono', lineHeight: 1 }}>
              {wait_reduction_pct?.toFixed(1)}%
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, fontFamily: 'JetBrains Mono' }}>UTILIZATION GAIN</div>
            <div style={{ fontSize: 36, fontWeight: 600, color: 'var(--text-main)', fontFamily: 'JetBrains Mono', lineHeight: 1 }}>
              {utilization_gain_pct?.toFixed(1)}%
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function MetricCards({ data }) {
  if (!data?.fifo || !data?.kairos) return null;
  const { fifo, kairos } = data;

  return (
    <div className="grid-3" style={{ marginBottom: 24 }}>
      <ImprovementBanner data={data} />
      <Card
        label="Mean Wait Time"
        fifoVal={(fifo.mean_wait_hours   || 0).toFixed(2)}
        kairosVal={(kairos.mean_wait_hours || 0).toFixed(2)}
        unit="h"
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
  );
}
