import React, { useState, useRef, useCallback, useEffect } from 'react';
import MissionForm from './MissionForm.jsx';
import LivePanel from './LivePanel.jsx';
import ResultPanel from './ResultPanel.jsx';

const API_BASE = import.meta.env.VITE_API_BASE || '';

export default function App() {
  const [missionId, setMissionId] = useState(null);
  const [events, setEvents] = useState([]);
  const [status, setStatus] = useState('idle'); // idle | running | success | failed
  const [activeMissions, setActiveMissions] = useState(0);
  const sourceRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch(`${API_BASE}/api/status`);
        const data = await res.json();
        if (!cancelled) setActiveMissions(data.activeMissions || 0);
      } catch {
        // ignore transient polling errors
      }
    }
    poll();
    const id = setInterval(poll, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const reset = useCallback(() => {
    sourceRef.current?.close();
    setMissionId(null);
    setEvents([]);
    setStatus('idle');
  }, []);

  async function startMission(payload) {
    reset();
    const res = await fetch(`${API_BASE}/api/missions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err.error || 'Could not start mission');
      return;
    }
    const { missionId: id } = await res.json();
    setMissionId(id);
    setStatus('running');

    const source = new EventSource(`${API_BASE}/api/missions/${id}/events`);
    sourceRef.current = source;
    source.onmessage = (e) => {
      const event = JSON.parse(e.data);
      setEvents((prev) => [...prev, event]);
      if (event.type === 'mission_end') {
        setStatus(event.status === 'success' ? 'success' : 'failed');
        source.close();
      }
    };
    source.onerror = () => {
      source.close();
    };
  }

  const missionEnd = events.find((e) => e.type === 'mission_end');

  return (
    <div className="app-shell">
      <nav className="topbar">
        <div className="topbar-brand">
          <span className="topbar-logo">LW</span>
          <span className="topbar-title">Loopwright</span>
        </div>
        <div className="topbar-meta">
          <span className="topbar-author">Byron González</span>
          <span className="topbar-sep">·</span>
          <span>Nebius x NVIDIA Hackathon</span>
        </div>
      </nav>

      <div className="app">
        <header className="app-header">
          <p>A self-correcting coding agent, powered by NVIDIA Nemotron on Nebius Token Factory.</p>
        </header>

        <div className="notice-bar">
          <strong>Demo notes:</strong> code execution runs sandboxed (one isolated Docker container per mission).
          This instance runs on a small shared VM, so iterations may feel slower than on dedicated hardware —
          that's the host, not the architecture. Every reasoning step calls NVIDIA Nemotron through Nebius Token
          Factory, which is billed against Token Factory credits regardless of where the code sandbox runs.
        </div>

        {status === 'running' && activeMissions > 1 && (
          <div className="concurrency-toast">
            ⚠ {activeMissions} missions are running right now on this host. This demo runs on a small shared
            VM with very little free RAM — when multiple missions overlap, everyone's iterations slow down
            because they're competing for the same limited CPU/memory, not because the agent itself is slow.
          </div>
        )}

        <MissionForm disabled={status === 'running'} onSubmit={startMission} onReset={reset} />

        {missionId && (
          <div className="panels">
            <LivePanel events={events} />
            {missionEnd && <ResultPanel event={missionEnd} />}
          </div>
        )}
      </div>

      <footer className="app-footer">
        Built by <strong>Byron González</strong> for the Nebius x NVIDIA Global AI Hackathon ·{' '}
        <a href="https://github.com/perroBlanco0/loopwright" target="_blank" rel="noreferrer">
          source on GitHub
        </a>
      </footer>
    </div>
  );
}
