import React, { useMemo } from 'react';

export default function JobTimeline({ fifoJobs, kairosJobs, playbackTime, maxTime }) {
  const mappedJobs = useMemo(() => {
    if (!fifoJobs || !kairosJobs || fifoJobs.length === 0) return [];
    const combined = fifoJobs.map((fJob, i) => {
      const kJob = kairosJobs[i];
      return { id: fJob.id, arr: fJob.arr, fifo: fJob.intervals, kairos: kJob.intervals };
    });
    combined.sort((a, b) => a.arr - b.arr);
    return combined;
  }, [fifoJobs, kairosJobs]);

  if (mappedJobs.length === 0 || !maxTime) return null;

  // Render a single track respecting playbackTime
  const renderTrack = (job, intervals, isFifo) => {
    return (
      <div style={{ position: 'relative', height: 16, width: '100%', background: 'rgba(255,255,255,0.03)', borderRadius: 8, overflow: 'hidden' }}>
        {/* Arrival Dot */}
        {job.arr <= playbackTime && (
          <div style={{
            position: 'absolute', left: `${(job.arr / maxTime) * 100}%`, top: 3,
            width: 10, height: 10, borderRadius: '50%',
            background: 'var(--text-muted)',
            boxShadow: '0 0 10px var(--text-muted)'
          }} title={`Arrived at ${(job.arr / 3600).toFixed(1)}h`} />
        )}
        
        {/* Execution Intervals */}
        {intervals.map((inv, idx) => {
          if (inv[0] > playbackTime) return null; // hasn't started yet

          const start = inv[0];
          let end = inv[1] === -1 ? maxTime : inv[1]; 
          
          // Clip end to playback time for animation
          end = Math.min(end, playbackTime);
          
          const left = (start / maxTime) * 100;
          const width = ((end - start) / maxTime) * 100;
          
          // Gradients
          const bgFifo = 'linear-gradient(90deg, #1E3A8A, #3B82F6)';
          const bgKairosPrimary = 'linear-gradient(90deg, #00F0FF, #0284C7)';
          const bgKairosResume = 'linear-gradient(90deg, #8A2BE2, #C026D3)';
          
          return (
            <div key={idx} style={{
              position: 'absolute',
              left: `${left}%`,
              width: `${Math.max(width, 0.2)}%`,
              height: '100%',
              background: isFifo ? bgFifo : (idx === 0 ? bgKairosPrimary : bgKairosResume),
              borderRadius: 8,
              boxShadow: `0 0 10px ${isFifo ? 'rgba(59, 130, 246, 0.4)' : (idx === 0 ? 'rgba(0, 240, 255, 0.4)' : 'rgba(138, 43, 226, 0.4)')}`,
              transition: 'width 0.1s linear'
            }} />
          );
        })}
      </div>
    );
  };

  const hours = maxTime / 3600;
  const ticks = [];
  for (let h = 0; h <= hours; h += Math.max(1, Math.floor(hours / 10))) ticks.push(h);

  return (
    <div className="card" style={{ marginTop: 24 }}>
      <span className="label">Timeline (Live Playback)</span>
      
      <div style={{ overflowX: 'auto' }}>
        <div style={{ minWidth: 800 }}>
          {/* Header */}
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', paddingBottom: 8, marginBottom: 16 }}>
            <div style={{ width: 60, fontSize: 11, color: 'var(--text-subtle)', fontFamily: 'Outfit', fontWeight: 600 }}>JOB ID</div>
            <div style={{ flexGrow: 1, position: 'relative', height: 16 }}>
              {ticks.map(h => (
                <div key={h} style={{
                  position: 'absolute', left: `${(h * 3600 / maxTime) * 100}%`,
                  fontSize: 12, color: 'var(--text-subtle)', fontFamily: 'JetBrains Mono', transform: 'translateX(-50%)'
                }}>
                  {h}h
                </div>
              ))}
            </div>
          </div>

          {/* Body */}
          <div style={{ maxHeight: 600, overflowY: 'auto', paddingRight: 8 }}>
            {mappedJobs.map((job) => (
              <div key={job.id} style={{ display: 'flex', marginBottom: 16, alignItems: 'center' }}>
                <div style={{ width: 60, fontSize: 12, color: 'var(--text-muted)', fontFamily: 'JetBrains Mono' }}>
                  #{job.id}
                </div>
                <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {renderTrack(job, job.fifo, true)}
                  {renderTrack(job, job.kairos, false)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      
      {/* Legend */}
      <div style={{ display: 'flex', gap: 24, marginTop: 24, borderTop: '1px solid var(--border-color)', paddingTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-muted)', fontFamily: 'Outfit' }}>
          <div style={{ width: 16, height: 16, background: 'linear-gradient(90deg, #1E3A8A, #3B82F6)', borderRadius: 4 }} /> 
          FIFO 
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-muted)', fontFamily: 'Outfit' }}>
          <div style={{ width: 16, height: 16, background: 'linear-gradient(90deg, #00F0FF, #0284C7)', borderRadius: 4 }} /> 
          KAIROS (INITIAL)
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-muted)', fontFamily: 'Outfit' }}>
          <div style={{ width: 16, height: 16, background: 'linear-gradient(90deg, #8A2BE2, #C026D3)', borderRadius: 4 }} /> 
          KAIROS (RESUMED)
        </div>
      </div>
    </div>
  );
}
