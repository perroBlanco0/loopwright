// Runs one Loopwright mission as a local Docker container (`loopwright-agent` image).
// Replaces the Nebius Serverless Jobs plan: AI Cloud (where Jobs live) isn't available on
// this account (only Token Factory credits are), so code execution/sandboxing runs locally
// instead. Nemotron inference still goes through Nebius Token Factory from inside the
// container — that alone satisfies the hackathon's "runs on Token Factory or AI Cloud"
// requirement.
//
// One `docker run` per mission (not one per loop iteration): the whole plan/implement/verify
// loop happens inside agent-runner.js in a single container, which prints NDJSON events to
// stdout that we stream straight through — no separate polling/log-tailing step needed since
// we own the process directly (simpler than the Nebius Jobs "create then poll logs" model).

import { spawn } from 'node:child_process';

const IMAGE = process.env.LOOPWRIGHT_AGENT_IMAGE || 'loopwright-agent:latest';

export function runMission(mission, onEvent) {
  const containerName = `loopwright-${mission.missionId}`;
  const args = [
    'run', '--rm',
    '--name', containerName,
    '-e', `MODE=${mission.mode}`,
    '-e', `MISSION_ID=${mission.missionId}`,
    '-e', `REPO_URL=${mission.repoUrl || ''}`,
    '-e', `SPEC=${mission.spec || ''}`,
    '-e', `NEBIUS_API_KEY=${process.env.NEBIUS_API_KEY}`,
  ];
  if (process.env.NEBIUS_MODEL_NANO) args.push('-e', `NEBIUS_MODEL_NANO=${process.env.NEBIUS_MODEL_NANO}`);
  if (process.env.NEBIUS_MODEL_SUPER) args.push('-e', `NEBIUS_MODEL_SUPER=${process.env.NEBIUS_MODEL_SUPER}`);
  if (process.env.NEBIUS_MODEL_ULTRA) args.push('-e', `NEBIUS_MODEL_ULTRA=${process.env.NEBIUS_MODEL_ULTRA}`);
  // Demo-recording override only — see pickModelForIteration in agent/nemotron-client.js.
  if (process.env.FORCE_TIER) args.push('-e', `FORCE_TIER=${process.env.FORCE_TIER}`);
  args.push(IMAGE);

  const proc = spawn('docker', args);
  let buffer = '';

  function handleChunk(chunk) {
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop(); // keep the trailing partial line for the next chunk
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        onEvent(JSON.parse(line));
      } catch {
        onEvent({ ts: Date.now(), missionId: mission.missionId, type: 'log', message: line });
      }
    }
  }

  proc.stdout.on('data', handleChunk);
  proc.stderr.on('data', (chunk) => {
    onEvent({ ts: Date.now(), missionId: mission.missionId, type: 'log', message: chunk.toString() });
  });

  return new Promise((resolvePromise) => {
    proc.on('close', (code) => {
      if (buffer.trim()) {
        try {
          onEvent(JSON.parse(buffer));
        } catch {
          /* trailing partial line, ignore */
        }
      }
      resolvePromise({ exitCode: code });
    });
  });
}

export function stopMission(missionId) {
  const containerName = `loopwright-${missionId}`;
  spawn('docker', ['kill', containerName]);
}
