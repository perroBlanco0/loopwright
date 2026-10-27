import React from 'react';

function formatUsage(usageByTier = {}) {
  const total = Object.values(usageByTier).reduce((a, b) => a + b, 0);
  return { total, ...usageByTier };
}

export default function ResultPanel({ event }) {
  const { status, finalSummary, verification, usageByTier } = event;
  const usage = formatUsage(usageByTier);
  const screenshot = verification?.appResult?.screenshotBase64;

  return (
    <div className="result-panel">
      <div className={`badge badge-${status}`}>{status === 'success' ? '✓ Success' : '✗ Failed'}</div>
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
