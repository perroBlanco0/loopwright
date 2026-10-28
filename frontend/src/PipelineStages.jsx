import React from 'react';

const TIER_LABEL = { nano: 'Nemotron Nano', super: 'Nemotron Super', ultra: 'Nemotron Ultra' };

const STAGES = [
  { key: 'setup', label: 'Clone & setup' },
  { key: 'plan', label: 'Plan' },
  { key: 'iterate', label: 'Code & test' },
  { key: 'verify', label: 'Verify' },
  { key: 'done', label: 'Done' },
];

function computeStageIndex(events, status) {
  const has = (type) => events.some((e) => e.type === type);
  if (status === 'success' || status === 'failed') return 4;
  if (has('verification_start')) return 3;
  if (has('iteration_start')) return 2;
  if (has('plan')) return 1;
  return 0;
}

export default function PipelineStages({ events, status }) {
  const activeIndex = computeStageIndex(events, status);
  const failed = status === 'failed';

  const lastIteration = [...events].reverse().find((e) => e.type === 'iteration_start');
  const iterationCount = events.filter((e) => e.type === 'iteration_start').length;

  return (
    <div className="pipeline">
      <div className="pipeline-stages">
        {STAGES.map((stage, i) => {
          const isDone = i < activeIndex || (i === activeIndex && (status === 'success' || status === 'failed'));
          const isActive = i === activeIndex && status === 'running';
          const isFailedStage = isDone && failed && i === activeIndex;
          return (
            <React.Fragment key={stage.key}>
              {i > 0 && (
                <div className={`pipeline-connector ${i <= activeIndex ? 'done' : ''}`} aria-hidden="true" />
              )}
              <div
                className={`pipeline-step ${isDone ? 'done' : ''} ${isActive ? 'active' : ''} ${
                  isFailedStage ? 'failed' : ''
                }`}
              >
                <span className="pipeline-dot" aria-hidden="true">
                  {isDone && !isFailedStage ? '✓' : isFailedStage ? '✗' : i + 1}
                </span>
                <span className="pipeline-label">{stage.label}</span>
              </div>
            </React.Fragment>
          );
        })}
      </div>

      {activeIndex === 2 && status === 'running' && lastIteration && (
        <p className="pipeline-detail">
          Attempt {iterationCount} — reasoning with {TIER_LABEL[lastIteration.tier] || lastIteration.tier}. Each
          attempt is a real call to Nemotron plus a real command run inside the sandbox, so this is active work,
          not a stall.
        </p>
      )}
      {activeIndex === 3 && status === 'running' && (
        <p className="pipeline-detail">Re-running tests and, for generated apps, booting the app for a live screenshot.</p>
      )}
    </div>
  );
}
