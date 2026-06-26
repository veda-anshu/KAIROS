import React from 'react';

export default function ClusterGrid({ slots, kairosJobs = [], playbackTime = Number.MAX_SAFE_INTEGER }) {
  // Determine which job is in which slot at `playbackTime`
  const activeSlots = new Array(slots).fill(null);

  if (kairosJobs.length > 0) {
    kairosJobs.forEach(job => {
      job.intervals.forEach((inv, idx) => {
        // inv is [start, end]
        const start = inv[0];
        // If end is -1 (meaning it ran to the end of the simulation)
        // or if we are actively playing back.
        const end = inv[1] === -1 ? Number.MAX_SAFE_INTEGER : inv[1];
        
        if (playbackTime >= start && playbackTime < end) {
          // Find the slot this job ran in.
          // Wait, the JSON currently doesn't export which EXACT slot the job ran in for each interval.
          // Since the engine didn't export slot history, we will just assign active jobs to slots randomly for the visual, 
          // or deterministically map them to free slots.
          const emptySlotIndex = activeSlots.findIndex(s => s === null);
          if (emptySlotIndex !== -1) {
            activeSlots[emptySlotIndex] = { id: job.id, isResumed: idx > 0 };
          }
        }
      });
    });
  }

  return (
    <div className="card">
      <span className="label">Live Cluster State</span>
      
      {/* Server Rack Container */}
      <div style={{ 
        background: '#050505', 
        border: '1px solid var(--border-color)', 
        borderRadius: 12,
        padding: 16,
        display: 'grid',
        gridTemplateColumns: slots > 16 ? 'repeat(4, 1fr)' : 'repeat(2, 1fr)',
        gap: 16,
        height: 240,
        overflowY: 'auto'
      }}>
        
        {activeSlots.map((jobInfo, i) => {
          const isActive = jobInfo !== null;
          const isResumed = isActive && jobInfo.isResumed;
          
          return (
            <div key={i} style={{
              background: isActive 
                ? (isResumed ? 'rgba(138, 43, 226, 0.15)' : 'rgba(0, 240, 255, 0.15)') 
                : 'rgba(255,255,255,0.02)',
              border: `1px solid ${isActive 
                ? (isResumed ? 'rgba(138, 43, 226, 0.4)' : 'rgba(0, 240, 255, 0.4)') 
                : 'rgba(255,255,255,0.05)'}`,
              borderRadius: 6,
              height: 32,
              display: 'flex',
              alignItems: 'center',
              padding: '0 12px',
              justifyContent: 'space-between',
              boxShadow: isActive ? `0 0 16px ${isResumed ? 'rgba(138, 43, 226, 0.2)' : 'rgba(0, 240, 255, 0.2)'}` : 'none'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {/* Activity LED */}
                <div style={{ 
                  width: 8, height: 8, borderRadius: '50%', 
                  background: isActive ? (isResumed ? 'var(--accent-violet)' : 'var(--accent-cyan)') : 'var(--text-subtle)',
                  boxShadow: isActive ? `0 0 8px ${isResumed ? 'var(--accent-violet)' : 'var(--accent-cyan)'}` : 'none'
                }} />
                
                <span style={{ fontSize: 11, fontFamily: 'JetBrains Mono', color: isActive ? 'var(--text-main)' : 'var(--text-subtle)' }}>
                  GPU_SLOT_{i.toString().padStart(2, '0')}
                </span>
              </div>
              
              {isActive && (
                <div className="badge" style={{ 
                  background: isResumed ? 'var(--accent-violet)' : 'var(--accent-cyan)', 
                  color: '#000', 
                  fontSize: 10,
                  fontWeight: 800,
                  padding: '2px 6px',
                  borderRadius: 4
                }}>
                  JOB_{jobInfo.id}
                </div>
              )}
            </div>
          );
        })}
      </div>
      
      <div style={{ display: 'flex', justifyContent: 'center', gap: 24, marginTop: 16 }}>
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          <span style={{ display: 'inline-block', width: 8, height: 8, background: 'var(--accent-cyan)', borderRadius: '50%', marginRight: 6 }} />
          INITIAL RUN
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          <span style={{ display: 'inline-block', width: 8, height: 8, background: 'var(--accent-violet)', borderRadius: '50%', marginRight: 6 }} />
          RESUMED AFTER PREEMPT
        </div>
      </div>
    </div>
  );
}
