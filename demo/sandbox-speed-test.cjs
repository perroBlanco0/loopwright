// Standalone timing comparison: Nebius Token Factory Sandboxes REST API vs local Docker.
// Not part of the production pipeline. Measures only "spawn + run a trivial command + get result"
// cold-start latency, to test the hypothesis that Sandboxes run faster than our shared tiny VM.
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const execFileAsync = promisify(execFile);

const API_KEY = process.env.NEBIUS_API_KEY;
const PROJECT_ID = process.env.NEBIUS_PROJECT_ID;
const BASE = 'https://api.tokenfactory.nebius.com/sandboxes/v1';

async function sandboxRun() {
  const spawnRes = await fetch(`${BASE}/instances`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      Project: PROJECT_ID,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      command: 'node',
      args: ['-e', 'console.log("hello from sandbox")'],
      image: 'tag:node:20-slim',
      shell: false,
    }),
  });
  const spawnBody = await spawnRes.json();
  if (!spawnRes.ok) {
    throw new Error(`spawn failed (${spawnRes.status}): ${JSON.stringify(spawnBody)}`);
  }
  const uuid = spawnBody.uuid;

  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const statusRes = await fetch(`${BASE}/operations/${uuid}`, {
      headers: { Authorization: `Bearer ${API_KEY}`, Project: PROJECT_ID },
    });
    const statusBody = await statusRes.json();
    if (!statusRes.ok) {
      throw new Error(`status check failed (${statusRes.status}): ${JSON.stringify(statusBody)}`);
    }
    if (['SUCCESS', 'FAILED', 'CANCELLED'].includes(statusBody.status)) {
      return statusBody;
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error('timed out waiting for sandbox operation');
}

async function dockerRun() {
  const { stdout } = await execFileAsync('docker', [
    'run', '--rm', 'node:20-slim', 'node', '-e', 'console.log("hello from docker")',
  ]);
  return stdout;
}

async function timeIt(label, fn) {
  const start = Date.now();
  try {
    const result = await fn();
    const ms = Date.now() - start;
    console.log(`${label}: ${ms}ms`, JSON.stringify(result).slice(0, 200));
    return ms;
  } catch (err) {
    const ms = Date.now() - start;
    console.log(`${label}: FAILED after ${ms}ms —`, err.message);
    return null;
  }
}

(async () => {
  if (!API_KEY || !PROJECT_ID) {
    console.error('Missing NEBIUS_API_KEY or NEBIUS_PROJECT_ID in environment.');
    process.exit(1);
  }

  console.log('--- Nebius Sandboxes (cold) ---');
  await timeIt('sandbox run #1 (cold)', sandboxRun);
  console.log('--- Nebius Sandboxes (warm, same image tag) ---');
  await timeIt('sandbox run #2', sandboxRun);

  console.log('\n--- Local Docker (image already pulled) ---');
  await timeIt('docker run #1', dockerRun);
  await timeIt('docker run #2', dockerRun);
})();
