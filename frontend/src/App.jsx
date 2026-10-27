import React, { useState, useRef, useCallback } from 'react';
import MissionForm from './MissionForm.jsx';
import LivePanel from './LivePanel.jsx';
import ResultPanel from './ResultPanel.jsx';

const API_BASE = import.meta.env.VITE_API_BASE || '';

export default function App() {
  const [missionId, setMissionId] = useState(null);
  const [events, setEvents] = useState([]);
  const [status, setStatus] = useState('idle'); // idle | running | success | failed
  const sourceRef = useRef(null);

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
    <div className="app">
      <header className="app-header">
        <h1>Loopwright</h1>
        <p>A self-correcting coding agent, powered by NVIDIA Nemotron on Nebius Token Factory.</p>
      </header>

      <MissionForm disabled={status === 'running'} onSubmit={startMission} onReset={reset} />

      {missionId && (
        <div className="panels">
          <LivePanel events={events} />
          {missionEnd && <ResultPanel event={missionEnd} />}
        </div>
      )}
    </div>
  );
}
