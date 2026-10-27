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
      return 'Running final verification…';
    case 'verification_result':
      return `Verification: ${event.passed ? 'PASSED' : 'FAILED'}`;
    case 'mission_end':
      return `Mission ${event.status}`;
    default:
      return JSON.stringify(event);
  }
}

export default function LivePanel({ events }) {
  const logRef = useRef(null);
  useEffect(() => {
    logRef.current?.scrollTo(0, logRef.current.scrollHeight);
  }, [events]);

  const plan = events.find((e) => e.type === 'plan');
  const lastIteration = [...events].reverse().find((e) => e.type === 'iteration_start');

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

      {lastIteration && (
        <div className="status-badge">
          Iteration {lastIteration.iteration + 1} — {TIER_LABEL[lastIteration.tier] || lastIteration.tier}
        </div>
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
