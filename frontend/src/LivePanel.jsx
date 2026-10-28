import React, { useEffect, useRef } from 'react';

const TIER_LABEL = { nano: 'Nemotron Nano', super: 'Nemotron Super', ultra: 'Nemotron Ultra' };

function describe(event) {
  switch (event.type) {
    case 'mission_start':
      return `Mission started (${event.mode})`;
    case 'log':
      return event.message;
    case 'plan':
      return null; // rendered separately as the checklist
    case 'iteration_start':
      return `Iteration ${event.iteration + 1} — thinking with ${TIER_LABEL[event.tier] || event.tier}`;
    case 'tool_call':
      return `→ ${event.name}(${JSON.stringify(event.args).slice(0, 160)})`;
    case 'diff':
      return `✎ wrote ${event.path} (${event.bytes} bytes)`;
    case 'command_result':
      return `$ ${event.command} → exit ${event.exitCode}`;
    case 'agent_loop_end':
      return `Agent loop finished: ${event.finalSummary}`;
    case 'verification_start':
      return null; // rendered separately as a dedicated block
    case 'verification_result':
      return `Verification: ${event.passed ? 'PASSED' : 'FAILED'}`;
    case 'mission_end':
      return `Mission ${event.status}`;
    default:
      return JSON.stringify(event);
  }
}

function formatElapsed(seconds) {
  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

export default function LivePanel({ events, elapsedSeconds = 0, status }) {
  const logRef = useRef(null);
  useEffect(() => {
    logRef.current?.scrollTo(0, logRef.current.scrollHeight);
  }, [events]);

  const plan = events.find((e) => e.type === 'plan');
  const lastIteration = [...events].reverse().find((e) => e.type === 'iteration_start');
  const verifying = events.some((e) => e.type === 'verification_start') &&
    !events.some((e) => e.type === 'verification_result');
  const isRunning = status === 'running';

  return (
    <div className="live-panel">
      {plan && (
        <div className="checklist">
          <h3>Plan</h3>
          <ol>
            {plan.todos.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ol>
        </div>
      )}

      {verifying ? (
        <div className="verifying-block">
          <span className="spinner spinner-sm" aria-hidden="true" />
          <span>Verifying — running tests{/* and, for build-spec, booting the app */}…</span>
        </div>
      ) : (
        lastIteration && (
          <div className="status-badge">
            {isRunning && <span className="live-dot" aria-hidden="true" />}
            Iteration {lastIteration.iteration + 1} — {TIER_LABEL[lastIteration.tier] || lastIteration.tier}
            {isRunning && <span className="elapsed-timer">{formatElapsed(elapsedSeconds)}</span>}
          </div>
        )
      )}

      <div className="log" ref={logRef}>
        {events.map((event, i) => {
          const text = describe(event);
          if (!text) return null;
          return (
            <div key={i} className={`log-line log-${event.type}`}>
              {text}
            </div>
          );
        })}
      </div>
    </div>
  );
}
