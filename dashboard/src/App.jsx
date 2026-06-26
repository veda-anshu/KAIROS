import { useState, useEffect } from 'react'
import MetricCards   from "./components/MetricCards.jsx"
import ClusterGrid   from "./components/ClusterGrid.jsx"
import OptionSurface from "./components/OptionSurface.jsx"
import JobTimeline   from "./components/JobTimeline.jsx"
import QueryVisualizer from "./components/QueryVisualizer.jsx"

const API_BASE = "http://127.0.0.1:5000/api"

export default function App() {
  const [config, setConfig] = useState({ n_jobs: 80, n_slots: 8, mu: 9.0, sigma: 1.5 })
  const [simData, setSimData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState('overview')
  
  // Playback state
  const [isPlaying, setIsPlaying] = useState(false)
  const [playbackTime, setPlaybackTime] = useState(0)
  const [maxTime, setMaxTime] = useState(0)

  // Query state
  const [queryInput, setQueryInput] = useState({ elapsed_hours: 1.0, preemption_value: 0.35 })
  const [queryRes, setQueryRes] = useState(null)
  const [queryLoading, setQueryLoading] = useState(false)

  // Playback effect
  useEffect(() => {
    let animationFrame;
    let lastTime = performance.now();

    const tick = (now) => {
      const dt = (now - lastTime) / 1000; // seconds
      lastTime = now;
      
      setPlaybackTime(prev => {
        if (prev >= maxTime) {
          setIsPlaying(false);
          return maxTime;
        }
        // Advance time: e.g., 200000 sim-seconds per real second
        return prev + (maxTime / 10) * dt; 
      });
      
      if (isPlaying) {
        animationFrame = requestAnimationFrame(tick);
      }
    };

    if (isPlaying) {
      animationFrame = requestAnimationFrame(tick);
    }
    return () => cancelAnimationFrame(animationFrame);
  }, [isPlaying, maxTime]);

  const runSimulation = async () => {
    setLoading(true)
    setIsPlaying(false)
    try {
      const resp = await fetch(`${API_BASE}/simulate`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config)
      })
      const data = await resp.json()
      setSimData(data)
      
      // Calculate max time from Kairos jobs
      let mt = 0;
      data.kairos_jobs?.forEach(j => {
        j.intervals.forEach(inv => {
          if (inv[1] > mt) mt = inv[1];
        })
      });
      setMaxTime(mt);
      setPlaybackTime(mt); // Default to end
      
    } catch (e) {
      console.error(e)
    }
    setLoading(false)
  }

  const runQuery = async () => {
    setQueryLoading(true)
    try {
      const resp = await fetch(`${API_BASE}/query`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          elapsed_time: queryInput.elapsed_hours * 3600.0,
          preemption_value: queryInput.preemption_value,
          mu: config.mu,
          sigma: config.sigma
        })
      })
      const data = await resp.json()
      setQueryRes(data)
    } catch(e) {
      console.error(e)
    }
    setQueryLoading(false)
  }

  const startPlayback = () => {
    setPlaybackTime(0);
    setIsPlaying(true);
  }

  return (
    <div className="container">
      {/* Hero Section */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 40 }}>
        <div>
          <h1 className="page-title">KAIROS</h1>
          <p className="subtitle" style={{ maxWidth: 600 }}>
            Stochastic Preemption Engine. By mapping cluster scheduling to an American Option Pricing model, 
            Kairos achieves massive throughput gains via Longstaff-Schwartz Monte Carlo decision boundaries.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 16 }}>
          {simData && (
            <button className="btn-primary" onClick={startPlayback}>
              {isPlaying ? '■ STOP PLAYBACK' : '▶ LIVE PLAYBACK'}
            </button>
          )}
          <button className="btn-primary action" onClick={runSimulation} disabled={loading}>
            {loading ? "SIMULATING..." : "GENERATE NEW CLUSTER STATE"}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs-container">
        <button className={`tab-button ${activeTab === 'overview' ? 'active' : ''}`} onClick={() => setActiveTab('overview')}>
          Cluster Overview & Playback
        </button>
        <button className={`tab-button ${activeTab === 'query' ? 'active' : ''}`} onClick={() => setActiveTab('query')}>
          Option Surface & Engine Matrix
        </button>
      </div>

      {/* OVERVIEW TAB */}
      {activeTab === 'overview' && (
        <div className="animate-fade-in">
          {simData && (
            <>
              <MetricCards data={simData} />
              
              <div className="grid-2" style={{ marginTop: 24 }}>
                <div className="card">
                  <span className="label">Simulation Parameters</span>
                  <div className="grid-2">
                    <div>
                      <div className="subtitle" style={{ fontSize: 12 }}>TOTAL JOBS</div>
                      <input type="number" className="input-field" value={config.n_jobs} onChange={e => setConfig({...config, n_jobs: +e.target.value})} />
                    </div>
                    <div>
                      <div className="subtitle" style={{ fontSize: 12 }}>GPU SLOTS</div>
                      <input type="number" className="input-field" value={config.n_slots} onChange={e => setConfig({...config, n_slots: +e.target.value})} />
                    </div>
                  </div>
                </div>
                
                {/* Server Racks Live View */}
                <ClusterGrid slots={config.n_slots} kairosJobs={simData.kairos_jobs} playbackTime={playbackTime} />
              </div>

              {/* Job Timeline */}
              {simData.fifo_jobs && simData.kairos_jobs && (
                <JobTimeline 
                  fifoJobs={simData.fifo_jobs} 
                  kairosJobs={simData.kairos_jobs} 
                  playbackTime={playbackTime} 
                  maxTime={maxTime} 
                />
              )}
            </>
          )}
        </div>
      )}

      {/* QUERY TAB */}
      {activeTab === 'query' && (
        <div className="animate-fade-in">
          <div className="grid-2" style={{ alignItems: 'start' }}>
            <div className="card">
              <span className="label">Live Preemption Query</span>
              <p className="subtitle" style={{ marginBottom: 24 }}>
                Input a hypothetical job's state to see exactly how the Monte Carlo engine decides its fate.
              </p>
              
              <div className="grid-2" style={{ marginBottom: 24 }}>
                <div>
                  <div className="subtitle" style={{ fontSize: 12 }}>ELAPSED TIME (HOURS)</div>
                  <input type="number" step="0.1" className="input-field" value={queryInput.elapsed_hours} onChange={e => setQueryInput({...queryInput, elapsed_hours: +e.target.value})} />
                </div>
                <div>
                  <div className="subtitle" style={{ fontSize: 12 }}>PREEMPTION VALUE</div>
                  <input type="number" step="0.01" className="input-field" value={queryInput.preemption_value} onChange={e => setQueryInput({...queryInput, preemption_value: +e.target.value})} />
                </div>
              </div>

              <button className="btn-primary action" style={{ width: '100%' }} onClick={runQuery} disabled={queryLoading}>
                {queryLoading ? "RUNNING MC..." : "QUERY LS-MC"}
              </button>
            </div>
            
            {/* The Option Surface Heatmap */}
            {simData && <OptionSurface data={simData} />}
          </div>

          {/* Fluid Monte Carlo Paths */}
          <QueryVisualizer queryResult={queryRes} />
        </div>
      )}

    </div>
  )
}
