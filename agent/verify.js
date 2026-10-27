import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { setTimeout as sleep } from 'node:timers/promises';

const execFileAsync = promisify(execFile);
const CHROMIUM_PATH = process.env.CHROMIUM_PATH || '/usr/bin/chromium';

async function runTests(workspaceDir) {
  try {
    const { stdout, stderr } = await execFileAsync('bash', ['-lc', 'npm test'], {
      cwd: workspaceDir,
      timeout: 60_000,
      maxBuffer: 10 * 1024 * 1024,
    });
    return { passed: true, output: (stdout + stderr).slice(-4000) };
  } catch (err) {
    return { passed: false, output: (String(err.stdout || '') + String(err.stderr || '')).slice(-4000) };
  }
}

async function verifyRunningApp(workspaceDir, emit) {
  const server = spawn('bash', ['-lc', 'npm start'], { cwd: workspaceDir, detached: true });
  let serverOutput = '';
  server.stdout?.on('data', (d) => (serverOutput += d.toString()));
  server.stderr?.on('data', (d) => (serverOutput += d.toString()));

  await sleep(3000); // give the dev server a moment to bind its port

  const port = Number(process.env.APP_PORT || 3000);
  let screenshotBase64 = null;
  let reachable = false;

  try {
    const { chromium } = await import('playwright-core');
    const browser = await chromium.launch({ executablePath: CHROMIUM_PATH, headless: true });
    const page = await browser.newPage();
    await page.goto(`http://localhost:${port}`, { timeout: 10_000, waitUntil: 'load' });
    reachable = true;
    const buffer = await page.screenshot();
    screenshotBase64 = buffer.toString('base64');
    await browser.close();
  } catch (err) {
    emit('log', { message: `Headless verification failed: ${err.message}` });
  } finally {
    try {
      process.kill(-server.pid);
    } catch {
      /* best effort cleanup */
    }
  }

  return { reachable, screenshotBase64, serverOutput: serverOutput.slice(-2000) };
}

export async function verify({ mode, workspaceDir, emit }) {
  emit('verification_start', { mode });

  if (mode === 'fix-tests') {
    const result = await runTests(workspaceDir);
    emit('verification_result', result);
    return result;
  }

  // build-spec: tests (if any were written) plus a real headless screenshot as proof of life.
  const testResult = await runTests(workspaceDir).catch(() => ({ passed: true, output: '(no tests)' }));
  const appResult = await verifyRunningApp(workspaceDir, emit);
  const result = { passed: testResult.passed && appResult.reachable, testResult, appResult };
  emit('verification_result', {
    passed: result.passed,
    reachable: appResult.reachable,
    hasScreenshot: !!appResult.screenshotBase64,
    screenshotBase64: appResult.screenshotBase64,
  });
  return result;
}
