import React, { useState } from 'react';

export default function MissionForm({ disabled, onSubmit, onReset }) {
  const [mode, setMode] = useState('fix-tests');
  const [repoUrl, setRepoUrl] = useState('');
  const [spec, setSpec] = useState('');

  function handleSubmit(e) {
    e.preventDefault();
    if (mode === 'fix-tests') {
      onSubmit({ mode, repoUrl });
    } else {
      onSubmit({ mode, spec });
    }
  }

  return (
    <form className="mission-form" onSubmit={handleSubmit}>
      <div className="mode-toggle">
        <button
          type="button"
          className={mode === 'fix-tests' ? 'active' : ''}
          onClick={() => setMode('fix-tests')}
          disabled={disabled}
        >
          Fix failing tests
        </button>
        <button
          type="button"
          className={mode === 'build-spec' ? 'active' : ''}
          onClick={() => setMode('build-spec')}
          disabled={disabled}
        >
          Build from spec
        </button>
      </div>

      {mode === 'fix-tests' ? (
        <input
          type="text"
          placeholder="https://github.com/you/repo-with-failing-tests"
          value={repoUrl}
          onChange={(e) => setRepoUrl(e.target.value)}
          disabled={disabled}
          required
        />
      ) : (
        <textarea
          placeholder="Describe the small app you want built..."
          value={spec}
          onChange={(e) => setSpec(e.target.value)}
          disabled={disabled}
          rows={4}
          required
        />
      )}

      <div className="form-actions">
        <button type="submit" disabled={disabled}>
          {disabled ? (
            <>
              <span className="spinner spinner-sm spinner-inline" aria-hidden="true" />
              Running…
            </>
          ) : (
            'Start mission'
          )}
        </button>
        <button type="button" onClick={onReset} disabled={disabled}>
          Reset
        </button>
      </div>
    </form>
  );
}
