import React from 'react';

function formatUsage(usageByTier = {}) {
  const total = Object.values(usageByTier).reduce((a, b) => a + b, 0);
  return { total, ...usageByTier };
}

const CONFETTI = Array.from({ length: 14 }, (_, i) => i);

export default function ResultPanel({ event }) {
  const { status, finalSummary, verification, usageByTier } = event;
  const usage = formatUsage(usageByTier);
  const screenshot = verification?.appResult?.screenshotBase64;
  const succeeded = status === 'success';

  return (
    <div className="result-panel">
      <div className={`badge badge-${status} ${succeeded ? 'badge-celebrate' : 'badge-shake'}`}>
        {succeeded && (
          <span className="confetti" aria-hidden="true">
            {CONFETTI.map((i) => (
              <span key={i} className={`confetti-piece confetti-piece-${i % 6}`} style={{ '--i': i }} />
            ))}
          </span>
        )}
        {succeeded ? '✓ Success' : '✗ Failed'}
      </div>
      <p className="summary">{finalSummary}</p>

      {screenshot && (
        <div className="screenshot">
          <h4>Live verification screenshot</h4>
          <img src={`data:image/png;base64,${screenshot}`} alt="App verification screenshot" />
        </div>
      )}

      {verification?.output && (
        <details>
          <summary>Test output</summary>
          <pre>{verification.output}</pre>
        </details>
      )}

      <div className="usage">
        <h4>Nemotron token usage</h4>
        <ul>
          <li>Nano: {usage.nano || 0}</li>
          <li>Super: {usage.super || 0}</li>
          <li>Ultra: {usage.ultra || 0}</li>
          <li>
            <strong>Total: {usage.total}</strong>
          </li>
        </ul>
      </div>
    </div>
  );
}
