// Drives the real Loopwright frontend end-to-end in a visible Edge window while
// Playwright records the viewport to video. No manual clicking needed — this is
// the "Devin-style" self-recorded demo: run this, then narrate over the output
// video afterwards (in parts, like the open-studio recordings).
//
// Prereqs before running:
//   1. orchestrator running on http://localhost:3000  (cd orchestrator && npm start)
//   2. frontend dev server running on http://localhost:5173  (cd frontend && npm run dev)
//   3. Docker Desktop running, loopwright-agent:latest image built
//
// Usage:
//   node record.js fix-tests
//   node record.js build-spec

import { chromium } from 'playwright-core';
import { setTimeout as sleep } from 'node:timers/promises';

const EDGE_PATH = process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const MODE = process.argv[2] === 'build-spec' ? 'build-spec' : 'fix-tests';

const SAMPLE = {
  'fix-tests': {
    repoUrl: 'https://github.com/perroBlanco0/loopwright-fixture-broken-math',
  },
  'build-spec': {
    spec:
      "A minimal Node.js HTTP server (no external deps) that responds with the text " +
      "'Hello Loopwright' on GET / at port 3000, started via npm start. Include one " +
      "automated test using Node's built-in node:test + node:assert that imports the " +
      "handler logic directly (not over HTTP) and asserts the response body equals " +
      "'Hello Loopwright'.",
  },
};

async function run() {
  const browser = await chromium.launch({
    executablePath: EDGE_PATH,
    headless: true, // headless still produces a full video of the rendered page
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    recordVideo: { dir: './recordings', size: { width: 1280, height: 800 } },
  });

  const page = await context.newPage();
  await page.goto(FRONTEND_URL);
  await page.waitForSelector('.mission-form');

  console.log(`Recording a "${MODE}" mission...`);

  // Select mode
  const modeLabel = MODE === 'fix-tests' ? 'Fix failing tests' : 'Build from spec';
  await page.click(`.mode-toggle button:has-text("${modeLabel}")`);
  await sleep(500);

  if (MODE === 'fix-tests') {
    await page.fill('.mission-form input[type="text"]', SAMPLE['fix-tests'].repoUrl);
  } else {
    await page.fill('.mission-form textarea', SAMPLE['build-spec'].spec);
  }

  await sleep(1000); // beat for the narration cut later
  await page.click('.form-actions button[type="submit"]');

  // Wait for the mission to finish: ResultPanel renders a .badge when mission_end arrives.
  await page.waitForSelector('.badge', { timeout: 180_000 });
  await sleep(3000); // let the final frame sit for a moment before cutting

  await context.close();
  await browser.close();

  console.log('Done. Video saved under demo/recordings/*.webm');
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
