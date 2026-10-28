# Loopwright

**Live demo:** https://loopwright.byrongonzalez.me

Loopwright is a self-correcting coding agent built for the **Nebius x NVIDIA Global AI Hackathon** (Coding and Agentic Engineering track). It writes code, runs it, reads the errors, and iterates — on its own — until the mission succeeds or it runs out of budget.

Given either a repo with failing tests or a short spec for a small app, Loopwright plans a checklist, then loops: call a tool (`read_file` / `write_file` / `run_command`), inspect the result, adjust, repeat. When it believes it's done it calls `finish`, and a verification pass (test run, plus a real headless-browser screenshot in build-spec mode) confirms it actually works before declaring success.

## Why it's interesting

- **Model escalation, not a single fixed model.** Every reasoning call goes through [NVIDIA Nemotron](https://developer.nvidia.com/nemotron) served via **Nebius Token Factory**. Loopwright starts cheap (Nemotron Nano) for routine iterations and automatically escalates to Super, then Ultra, after 2 and 4 consecutive command failures — so easy fixes stay fast and cheap, and only genuinely stuck loops spend the bigger budget on heavier reasoning.
- **Real verification, not a trust-me finish.** The agent's own `finish` call isn't the final word — a separate verification step re-runs the test suite and, for generated apps, actually starts the server and loads it in headless Chromium via Playwright to capture a screenshot as proof of life.
- **Two demo modes.** `fix-tests`: point it at a public git repo with a known failing test, watch it diagnose and patch. `build-spec`: give it a one-paragraph spec, watch it scaffold a working Node app plus tests from nothing.
- **Live streaming, not a spinner.** The agent emits NDJSON events (plan, tool calls, diffs, command output, verification result) which the orchestrator relays to the frontend over Server-Sent Events, so the whole loop is visible as it happens.

## Architecture

```
Frontend (React/Vite)
  │ POST /api/missions {mode, repoUrl | spec}
  │ GET  /api/missions/:id/events  (SSE)
  ▼
Orchestrator (Node/Express)
  │ docker run --rm loopwright-agent:latest   (one container per mission)
  │ parses the container's NDJSON stdout → forwards each event over SSE
  ▼
Agent container (Node 22 + git + headless Chromium)
  1. clone repo (fix-tests) or start from an empty workspace (build-spec)
  2. planning step (Nemotron Ultra, once) → checklist of todos
  3. loop: Nemotron Nano by default → tool calls → run tests/build
     → 2 consecutive failures escalate to Super, 4 to Ultra
  4. verification: re-run tests; build-spec also boots the app and
     screenshots it headlessly (Playwright + system Chromium)
  5. emits NDJSON events + a final summary to stdout
  │
  └─ outbound calls to Nebius Token Factory (chat completions, tool calling)
```

All reasoning runs through Nebius Token Factory's OpenAI-compatible API (`https://api.tokenfactory.nebius.com/v1`), using the NVIDIA Nemotron 3 family (Nano / Super / Ultra).

## Running it locally

Requirements: Docker, Node 22+, a [Nebius Token Factory](https://tokenfactory.nebius.com) API key.

```bash
# 1. agent image
cd agent && docker build -t loopwright-agent:latest . && cd ..

# 2. orchestrator
cd orchestrator && npm install
cp ../.env.example ../.env   # fill in NEBIUS_API_KEY
npm start                    # listens on :3000

# 3. frontend (separate terminal)
cd frontend && npm install && npm run dev
```

Open the frontend, pick a mode:
- **fix-tests** — paste a public git repo URL with a failing test.
- **build-spec** — paste a short spec for a small Node HTTP app.

Watch the live log, plan checklist, and final result (including the verification screenshot for build-spec).

### Environment variables

| Variable | Purpose |
|---|---|
| `NEBIUS_API_KEY` | Token Factory bearer token |
| `PORT` | Orchestrator port (default `3000`) |
| `LOOPWRIGHT_AGENT_IMAGE` | Docker image tag to run per mission (default `loopwright-agent:latest`) |
| `MAX_ITERATIONS` | Agent loop budget per mission (default `20`) |

## Project structure

```
agent/           Docker image + the agent loop itself (nemotron-client, tools, verify, agent-runner)
orchestrator/     Express server: launches a Docker container per mission, relays NDJSON → SSE
frontend/         React/Vite UI: mission form, live event panel, result panel
examples/         Fixture repo used to demo fix-tests mode
```

## Nebius Token Factory Sandboxes (beta)

Loopwright's main pipeline runs code in a local Docker container per mission. Separately, we validated **Nebius Token Factory Sandboxes** (beta, Contree SDK) as a forward-looking execution backend: `demo/sandbox-smoke-test.py` authenticates against a real Sandboxes project, boots an isolated `python:3.12-slim` sandbox, installs a system package at runtime, and executes model-generated code inside it end to end. This is a proof-of-concept, not yet wired into the production mission loop — see "What's next" below.

## Demo recordings

`demo/record.js` drives the real frontend with Playwright (headless) against a live mission and records the browser to video — no manual screen capture needed. Run `node demo/record.js fix-tests` or `node demo/record.js build-spec` against a running orchestrator + frontend to reproduce the clips in `demo/recordings/`.

## Prior work disclosure

This architecture (plan → tool-calling loop → sandboxed execution → live event streaming) builds on patterns I explored in an earlier personal project, **open-studio**, submitted to a different hackathon (GitLab Duo/Transcend). Loopwright is a from-scratch rewrite for this hackathon: new model layer (NVIDIA Nemotron via Nebius Token Factory instead of the earlier project's model/CLI stack), new sandboxing approach, new branding, and a different problem framing (general self-correcting coding agent vs. that project's GitLab-integrated workflow). No code, assets, or branding from open-studio were reused.

## License

MIT — see [LICENSE](LICENSE).
