// Entrypoint for the loopwright-agent Nebius Serverless Job.
// Everything — planning, the write/run/read-error loop, and final verification —
// runs inside this single job (Jobs are batch containers with stdout as the only
// documented output channel, so the whole mission is one process; see plan Fase 0).
//
// Emits NDJSON events to stdout. The orchestrator tails `nebius ai job logs` and
// forwards each line to the frontend over SSE.

import { mkdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { plan, nextStep, pickModelForIteration } from './nemotron-client.js';
import { makeTools } from './tools.js';
import { verify } from './verify.js';

const execFileAsync = promisify(execFile);

// Mission config comes from env vars by default. If Nebius Jobs turns out not to
// support env vars (unconfirmed as of Fase 0 planning), fall back to a single
// base64-encoded JSON arg: `node agent-runner.js <base64 mission json>`.
const argMission = process.argv[2]
  ? JSON.parse(Buffer.from(process.argv[2], 'base64').toString('utf8'))
  : {};

const MODE = argMission.mode || process.env.MODE || 'fix-tests'; // 'fix-tests' | 'build-spec'
const MISSION_ID = argMission.missionId || process.env.MISSION_ID || 'local';
const REPO_URL = argMission.repoUrl || process.env.REPO_URL || '';
const SPEC = argMission.spec || process.env.SPEC || '';
const WORKSPACE = process.env.WORKSPACE_DIR || '/workspace';
const MAX_ITERATIONS = Number(process.env.MAX_ITERATIONS || 20);

function emit(type, data = {}) {
  process.stdout.write(JSON.stringify({ ts: Date.now(), missionId: MISSION_ID, type, ...data }) + '\n');
}

const FINISH_TOOL = {
  type: 'function',
  function: {
    name: 'finish',
    description:
      'Call this when the mission is complete (tests pass / app builds and runs) or ' +
      'you are stuck and should stop. Ends the agent loop.',
    parameters: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        summary: { type: 'string' },
      },
      required: ['success', 'summary'],
    },
  },
};

async function prepareWorkspace() {
  await mkdir(WORKSPACE, { recursive: true });
  if (MODE === 'fix-tests') {
    if (!REPO_URL) throw new Error('REPO_URL is required for fix-tests mode');
    emit('log', { message: `Cloning ${REPO_URL}` });
    await execFileAsync('git', ['clone', '--depth', '1', REPO_URL, WORKSPACE]);
    return `Repository cloned from ${REPO_URL}. Some tests are failing. Make them pass without ` +
      'breaking the app. Run "npm install" first if node_modules is missing, then "npm test" to ' +
      'see failures.';
  }
  // build-spec: start from an empty workspace, let the agent scaffold everything.
  emit('log', { message: 'Starting from an empty workspace for build-spec mode' });
  return `Build a small working Node.js app matching this spec from scratch:\n\n${SPEC}\n\n` +
    'Include a package.json with a "build" and "start" script, and at least one automated test. ' +
    'The app should expose an HTTP server so it can be verified by requesting it.';
}

async function run() {
  emit('mission_start', { mode: MODE });

  let missionBrief;
  try {
    missionBrief = await prepareWorkspace();
  } catch (err) {
    emit('mission_end', { status: 'failed', error: String(err.message || err) });
    process.exitCode = 1;
    return;
  }

  const tools = makeTools(WORKSPACE);
  const allTools = [...tools.definitions, FINISH_TOOL];

  const { todos, usage: planUsage } = await plan({ missionBrief });
  emit('plan', { todos });

  const systemPrompt =
    'You are Loopwright, an autonomous coding agent. You write code, run it, read errors, and ' +
    'self-correct, iterating until the mission succeeds. Always use tools to inspect and change ' +
    'files and to run commands — never just describe what you would do. Prefer plain JavaScript ' +
    'with no build/compile step (no TypeScript, no bundler) unless the mission explicitly requires ' +
    'it — fewer moving parts means fewer ways to fail within the iteration budget. Remember: in ' +
    "Node's built-in test runner, import assertions from \"node:assert\" (e.g. assert.strictEqual), " +
    'not from "node:test" — only test/describe/it come from "node:test". When you believe ' +
    `the mission is complete, call "finish". Checklist for this mission:\n${todos.map((t, i) => `${i + 1}. ${t}`).join('\n')}`;

  const history = [{ role: 'user', content: missionBrief }];
  let consecutiveFailures = 0;
  const usageByTier = { nano: 0, super: 0, ultra: 0 };
  usageByTier.ultra += planUsage.totalTokens;

  let finished = false;
  let finalSuccess = false;
  let finalSummary = '';

  for (let iteration = 0; iteration < MAX_ITERATIONS && !finished; iteration++) {
    const { tier, model } = pickModelForIteration(consecutiveFailures);
    emit('iteration_start', { iteration, tier });

    const { message, usage } = await nextStep({ tier, model, systemPrompt, history, tools: allTools });
    usageByTier[tier] += usage.totalTokens;
    // Keep only the fields a conversation turn needs — the API response carries extra
    // fields (reasoning, annotations, audio...) that just waste tokens if echoed back.
    const toolCalls = message.tool_calls || [];
    history.push({ role: 'assistant', content: message.content, tool_calls: toolCalls });
    if (toolCalls.length === 0) {
      // Model answered in plain text instead of calling a tool — nudge it back on track.
      emit('log', { message: 'Model returned text with no tool call; prompting to continue.' });
      history.push({ role: 'user', content: 'Continue using tools, or call "finish" if done.' });
      continue;
    }

    for (const call of toolCalls) {
      const args = JSON.parse(call.function.arguments || '{}');

      if (call.function.name === 'finish') {
        finished = true;
        finalSuccess = !!args.success;
        finalSummary = args.summary || '';
        history.push({ role: 'tool', tool_call_id: call.id, content: 'acknowledged' });
        break;
      }

      emit('tool_call', { name: call.function.name, args: truncateArgs(args) });

      let result;
      try {
        result = await tools.call(call.function.name, args);
      } catch (err) {
        // A malformed or nonexistent tool call is a model mistake, not a mission-ending
        // failure — feed the error back so the model can self-correct, same as a failed command.
        result = { error: String(err.message || err) };
        emit('log', { message: `Tool call failed: ${result.error}` });
        consecutiveFailures += 1;
      }

      if (call.function.name === 'write_file' && result.bytes !== undefined) {
        emit('diff', { path: args.path, bytes: result.bytes });
      }
      if (call.function.name === 'run_command' && result.exitCode !== undefined) {
        emit('command_result', {
          command: args.command,
          exitCode: result.exitCode,
          stdout: result.stdout.slice(-4000),
          stderr: result.stderr.slice(-4000),
        });
        consecutiveFailures = result.exitCode === 0 ? 0 : consecutiveFailures + 1;
      }

      history.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result).slice(0, 8000) });
    }
  }

  if (!finished) {
    finalSummary = `Reached max iterations (${MAX_ITERATIONS}) without an explicit finish.`;
  }

  emit('agent_loop_end', { finished, finalSuccess, finalSummary, usageByTier });

  const verification = await verify({ mode: MODE, workspaceDir: WORKSPACE, emit });

  emit('mission_end', {
    status: finalSuccess && verification.passed ? 'success' : 'failed',
    finalSummary,
    verification,
    usageByTier,
  });
}

function truncateArgs(args) {
  const copy = { ...args };
  if (typeof copy.content === 'string' && copy.content.length > 300) {
    copy.content = copy.content.slice(0, 300) + `... (${copy.content.length} bytes total)`;
  }
  return copy;
}

run().catch((err) => {
  emit('mission_end', { status: 'failed', error: String(err.stack || err) });
  process.exitCode = 1;
});
