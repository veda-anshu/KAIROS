import React, { useMemo } from 'react';

export default function QueryVisualizer({ queryResult }) {
  if (!queryResult || queryResult.error) return null;

  const { 
    elapsed_time, 
    preemption_value, 
    should_preempt, 
    sample_paths = [], 
    continuation_value 
  } = queryResult;

  // Generate SVG Paths for the "Plume" of possible futures
  const { paths, maxT } = useMemo(() => {
    if (!sample_paths.length) return { paths: [], maxT: 1 };
    
    // Sort paths so they fan out nicely
    const sorted = [...sample_paths].sort((a,b) => a - b);
    const m = Math.max(...sorted, elapsed_time * 1.5);
    
    const svgPaths = sorted.map((T, i) => {
      // Normalize X to [0, 1000] width
      const x0 = 0;
      const xCur = (elapsed_time / m) * 1000;
      const xEnd = (T / m) * 1000;
      
      // Y spreads from 50 to 250 (Height is 300)
      const yMid = 150;
      const yEnd = 50 + (i / sorted.length) * 200;
      
      // Bezier curve branching point
      const deltaX = (xEnd - xCur) * 0.5;
      
      const d = `M ${x0} ${yMid} L ${xCur} ${yMid} C ${xCur + deltaX} ${yMid}, ${xEnd - deltaX} ${yEnd}, ${xEnd} ${yEnd}`;
      return d;
    });

    return { paths: svgPaths, maxT: m };
  }, [sample_paths, elapsed_time]);

  return (
    <div className="card" style={{ marginTop: 24, overflow: 'visible' }}>
      <span className="label">Monte Carlo Predictive Plume</span>
      <p className="subtitle" style={{ marginBottom: 32 }}>
        Visualization of the 5,000 stochastic paths (down-sampled) predicting the job's future lifespan.
      </p>

      {/* SVG Canvas */}
      <div style={{ position: 'relative', width: '100%', height: 320, background: 'rgba(0,0,0,0.4)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.05)' }}>
        <svg viewBox="0 0 1000 300" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
          
          {/* Grid lines */}
          <line x1="0" y1="150" x2="1000" y2="150" stroke="rgba(255,255,255,0.1)" strokeWidth="1" strokeDasharray="4 4" />
          
          {/* Plume Paths */}
          {paths.map((d, i) => (
            <path 
              key={i} 
              d={d} 
              fill="none" 
              stroke="url(#plumeGradient)" 
              strokeWidth="1.5"
              strokeLinecap="round"
              opacity={0.3}
              style={{ transition: 'all 0.5s ease-out' }}
            />
          ))}

          {/* Current Time Marker */}
          <line 
            x1={(elapsed_time / maxT) * 1000} 
            y1="20" 
            x2={(elapsed_time / maxT) * 1000} 
            y2="280" 
            stroke="var(--text-main)" 
            strokeWidth="2" 
          />
          <circle 
            cx={(elapsed_time / maxT) * 1000} 
            cy="150" 
            r="6" 
            fill="var(--bg-dark)" 
            stroke="var(--text-main)" 
            strokeWidth="3" 
          />

          <defs>
            <linearGradient id="plumeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="rgba(0, 240, 255, 0.1)" />
              <stop offset="50%" stopColor="rgba(138, 43, 226, 0.5)" />
              <stop offset="100%" stopColor="rgba(255, 0, 85, 0.8)" />
            </linearGradient>
          </defs>
        </svg>

        {/* Labels overlay */}
        <div style={{ position: 'absolute', top: -20, left: `calc(${(elapsed_time / maxT) * 100}% - 40px)`, color: 'var(--text-main)', fontSize: 11, fontFamily: 'JetBrains Mono', background: 'var(--bg-dark)', padding: '2px 8px', borderRadius: 4, border: '1px solid var(--border-color)' }}>
          t = {(elapsed_time/3600).toFixed(1)}h
        </div>
      </div>

      {/* Decision Summary */}
      <div className="grid-2" style={{ marginTop: 32 }}>
        <div style={{ padding: 20, background: 'rgba(255,255,255,0.03)', borderRadius: 12 }}>
          <div className="subtitle" style={{ fontSize: 12, marginBottom: 8 }}>EXPECTED CONTINUATION (Avg of Plume)</div>
          <div style={{ fontSize: 36, fontFamily: 'JetBrains Mono', color: 'var(--text-main)' }}>
            {continuation_value?.toFixed(4)}
          </div>
        </div>
        
        <div style={{ padding: 20, background: 'rgba(255,255,255,0.03)', borderRadius: 12 }}>
          <div className="subtitle" style={{ fontSize: 12, marginBottom: 8 }}>PREEMPTION THRESHOLD</div>
          <div style={{ fontSize: 36, fontFamily: 'JetBrains Mono', color: 'var(--text-muted)' }}>
            {preemption_value.toFixed(4)}
          </div>
        </div>
      </div>

      <div style={{ 
        marginTop: 16,
        padding: 16, 
        background: should_preempt ? 'rgba(255, 0, 85, 0.1)' : 'rgba(0, 240, 255, 0.1)', 
        border: `1px solid ${should_preempt ? 'rgba(255, 0, 85, 0.3)' : 'rgba(0, 240, 255, 0.3)'}`,
        borderRadius: 12,
        textAlign: 'center'
      }}>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>ENGINE DECISION</div>
        <div style={{ 
          fontSize: 24, 
          fontFamily: 'Outfit', 
          fontWeight: 700, 
          color: should_preempt ? 'var(--accent-magenta)' : 'var(--accent-cyan)' 
        }}>
          {should_preempt ? 'PREEMPT (THRESHOLD CROSSED)' : 'CONTINUE (WAITING)'}
        </div>
      </div>
    </div>
  );
}
