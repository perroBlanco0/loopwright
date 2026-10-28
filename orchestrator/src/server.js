import express from 'express';
import cors from 'cors';
import { randomUUID } from 'node:crypto';
import { runMission, stopMission } from './docker-sandbox.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

const PORT = process.env.PORT || 3000;

// missionId -> { events: [...], clients: Set<res>, status: 'running'|'done' }
const missions = new Map();

function broadcast(mission, event) {
  mission.events.push(event);
  for (const res of mission.clients) {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  }
  if (event.type === 'mission_end') {
    mission.status = 'done';
    for (const res of mission.clients) res.end();
  }
}

app.get('/api/status', (req, res) => {
  let activeMissions = 0;
  for (const mission of missions.values()) {
    if (mission.status === 'running') activeMissions += 1;
  }
  res.json({ activeMissions });
});

app.post('/api/missions', (req, res) => {
  const { mode, repoUrl, spec } = req.body || {};
  if (mode !== 'fix-tests' && mode !== 'build-spec') {
    return res.status(400).json({ error: 'mode must be "fix-tests" or "build-spec"' });
  }
  if (mode === 'fix-tests' && !repoUrl) {
    return res.status(400).json({ error: 'repoUrl is required for fix-tests mode' });
  }
  if (mode === 'build-spec' && !spec) {
    return res.status(400).json({ error: 'spec is required for build-spec mode' });
  }

  const missionId = randomUUID();
  const mission = { events: [], clients: new Set(), status: 'running' };
  missions.set(missionId, mission);

  runMission({ missionId, mode, repoUrl, spec }, (event) => broadcast(mission, event))
    .catch((err) => broadcast(mission, { type: 'mission_end', status: 'failed', error: String(err) }));

  res.status(201).json({ missionId });
});

app.get('/api/missions/:id/events', (req, res) => {
  const mission = missions.get(req.params.id);
  if (!mission) return res.status(404).end();

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  for (const event of mission.events) {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  }
  if (mission.status === 'done') return res.end();

  mission.clients.add(res);
  req.on('close', () => mission.clients.delete(res));
});

app.post('/api/missions/:id/stop', (req, res) => {
  if (!missions.has(req.params.id)) return res.status(404).end();
  stopMission(req.params.id);
  res.status(202).end();
});

app.listen(PORT, () => {
  console.log(`Loopwright orchestrator listening on :${PORT}`);
});
