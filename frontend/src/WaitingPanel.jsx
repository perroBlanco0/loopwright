import React from 'react';

const STAGE_LABEL = {
  mission_start: 'Setting up the workspace…',
  log: 'Preparing…',
  plan: 'Planning the approach…',
  iteration_start: 'Thinking…',
  tool_call: 'Reading and writing code…',
  diff: 'Writing code…',
  command_result: 'Running commands…',
  agent_loop_end: 'Wrapping up the loop…',
  verification_start: 'Verifying the result…',
};

export default function WaitingPanel({ events }) {
  const last = [...events].reverse().find((e) => STAGE_LABEL[e.type]);
  const label = last ? STAGE_LABEL[last.type] : 'Starting…';

  return (
    <div className="result-panel waiting-panel">
      <div className="spinner" aria-hidden="true" />
      <p className="waiting-label">{label}</p>
      <p className="waiting-hint">The result will appear here once the mission finishes.</p>
    </div>
  );
}
