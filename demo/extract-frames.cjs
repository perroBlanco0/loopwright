const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');
const http = require('http');

const EDGE_PATH = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const videoPath = process.argv[2];
const outPrefix = process.argv[3];
const timestamps = process.argv.slice(4).map(Number);

(async () => {
  const absVideoPath = path.resolve(videoPath);
  const server = http.createServer((req, res) => {
    if (req.url === '/video.webm') {
      res.writeHead(200, { 'Content-Type': 'video/webm' });
      fs.createReadStream(absVideoPath).pipe(res);
    } else if (req.url === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<video id="v" src="/video.webm" style="width:1280px" preload="auto"></video><canvas id="c" style="width:1280px"></canvas>');
    } else {
      res.writeHead(404); res.end();
    }
  });
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;

  const browser = await chromium.launch({ executablePath: EDGE_PATH, headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 820 } });

  await page.goto(`http://localhost:${port}/`);

  await page.waitForFunction(() => {
    const v = document.getElementById('v');
    return v.readyState >= 1 || v.error;
  }, null, { timeout: 15000 }).catch(() => console.log('metadata wait timed out, continuing anyway'));

  const duration = await page.evaluate(() => document.getElementById('v').duration);
  console.log('video duration (s):', duration);

  await page.evaluate(() => document.getElementById('v').play());

  const sorted = [...timestamps].sort((a, b) => a - b);
  let elapsed = 0;
  for (const t of sorted) {
    const waitMs = Math.max(0, t - elapsed) * 1000;
    if (waitMs > 0) await page.waitForTimeout(waitMs);
    elapsed = t;
    await page.evaluate(() => {
      const v = document.getElementById('v');
      const c = document.getElementById('c');
      c.width = v.videoWidth || 1280;
      c.height = v.videoHeight || 800;
      c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
    });
    await page.locator('#c').screenshot({ path: `${outPrefix}-${t}.png` });
    console.log(`captured frame at ${t}s`);
  }
  await page.evaluate(() => document.getElementById('v').pause());

  await browser.close();
  server.close();
})();
