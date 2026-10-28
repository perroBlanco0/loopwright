import React, { useState, useRef, useCallback, useEffect } from 'react';
import MissionForm from './MissionForm.jsx';
import LivePanel from './LivePanel.jsx';
import ResultPanel from './ResultPanel.jsx';
import WaitingPanel from './WaitingPanel.jsx';

const API_BASE = import.meta.env.VITE_API_BASE || '';
const BASE_TITLE = 'Loopwright';

function playTone(frequencies, durationMs = 140) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    frequencies.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.08, ctx.currentTime + (i * durationMs) / 1000);
      osc.connect(gain);
      gain.connect(ctx.destination);
      const start = ctx.currentTime + (i * durationMs) / 1000;
      osc.start(start);
      osc.stop(start + durationMs / 1000);
    });
  } catch {
    // Web Audio not available or blocked — not critical, skip silently.
  }
}

export default function App() {
  const [missionId, setMissionId] = useState(null);
  const [events, setEvents] = useState([]);
  const [status, setStatus] = useState('idle'); // idle | running | success | failed
  const [activeMissions, setActiveMissions] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const sourceRef = useRef(null);
  const startedAtRef = useRef(null);

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

  useEffect(() => {
    if (status !== 'running') return undefined;
    const id = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAtRef.current) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [status]);

  useEffect(() => {
    if (status === 'running') {
      const mm = String(Math.floor(elapsedSeconds / 60)).padStart(2, '0');
      const ss = String(elapsedSeconds % 60).padStart(2, '0');
      document.title = `⏳ ${mm}:${ss} — ${BASE_TITLE}`;
    } else if (status === 'success') {
      document.title = `✅ Done — ${BASE_TITLE}`;
    } else if (status === 'failed') {
      document.title = `❌ Failed — ${BASE_TITLE}`;
    } else {
      document.title = BASE_TITLE;
    }
  }, [status, elapsedSeconds]);

  const reset = useCallback(() => {
    sourceRef.current?.close();
    setMissionId(null);
    setEvents([]);
    setStatus('idle');
    setElapsedSeconds(0);
    document.title = BASE_TITLE;
  }, []);

  async function startMission(payload) {
    reset();

    if (window.Notification && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }

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
    startedAtRef.current = Date.now();
    setElapsedSeconds(0);
    setMissionId(id);
    setStatus('running');

    const source = new EventSource(`${API_BASE}/api/missions/${id}/events`);
    sourceRef.current = source;
    source.onmessage = (e) => {
      const event = JSON.parse(e.data);
      setEvents((prev) => [...prev, event]);
      if (event.type === 'mission_end') {
        const succeeded = event.status === 'success';
        setStatus(succeeded ? 'success' : 'failed');
        source.close();

        if (window.Notification && Notification.permission === 'granted') {
          new Notification(succeeded ? 'Loopwright: mission succeeded' : 'Loopwright: mission failed', {
            body: event.finalSummary || '',
          });
        }
        playTone(succeeded ? [523, 659, 784] : [392, 330]);
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
            <LivePanel events={events} elapsedSeconds={elapsedSeconds} status={status} />
            {missionEnd ? <ResultPanel event={missionEnd} /> : <WaitingPanel events={events} />}
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
