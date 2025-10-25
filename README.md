# Pinpoint — Fullstack Demo

This repository contains a React frontend and a Rust (Actix) backend, with Docker-based builds and a docker-compose file to run both together.

Quick start (Docker):

1. Build and run with docker-compose:

```bash
docker compose up --build
```

2. Open http://localhost:3000 in your browser for the frontend. The frontend talks to the backend at http://backend:8080 (via compose networking).
 
Note: The frontend default is configured to call `http://backend:8080/positions` when running with `docker compose` (internal service hostname). For local frontend dev use `http://localhost:8080/positions` as the poll URL.

Development (frontend):

cd frontend
npm install
npm run dev

Development (backend):

cd backend
cargo run
 
Prototype backup
----------------
The original prototype files (pre-refactor) have been moved to the `backup/` folder at the repository root. Files include:

- `backup/index.html`
- `backup/app.js`
- `backup/utils.js`
- `backup/styles.css`
- `backup/mock_positions.json`
- `backup/tests.html`

You can open those files directly if you need to inspect or restore the prototype.
Pinpoint UI Demo

This is a self-contained UI-only demo for a factory live location proof-of-concept.

How to run

- Open `index.html` in your browser. No server required for the demo files.
- Click "Use Default Demo Plan" or upload an image of your factory plan.
- Click on the plan to place three routers. You can drag them after placing.
- The demo polls `mock_positions.json` every 60s with the configured API key header `x-api-key` and displays red dots for employee positions returned by the API.

Files
- `index.html` — main demo page (uses CDN React + Babel for JSX)
- `app.js` — demo React app
- `utils.js` — helper functions used by app and tests
- `mock_positions.json` — sample API response
- `tests.html` — Jasmine tests for utilities
- `styles.css` — demo styles

Notes and alternatives for router coordinates
- In this demo routers are placed interactively on the plan to avoid manual coordinate entry. This is usually the best UX for a PoC and avoids the need to know the absolute coordinate system of the factory.
- In production, router positions could also be provided by:
  - importing a CSV with known coordinates
  - a one-time calibration step where an admin taps router hardware to map it
  - autodiscovery if routers broadcast their physical coordinates

Next steps
- Integrate the real backend API and map the real response fields to the UI.
- Add unit tests and TypeScript typing if converting to a full project.
- Replace polling with WebSocket or server-sent events for near real-time updates.

Trilateration
--
The frontend now includes a simple least-squares trilateration utility at `frontend/src/triangulation.js`. It converts per-router distances (from the API `beacons` array) into 2D positions. Anchors (router positions) and factory physical dimensions are configured in `frontend/src/App.jsx` — update those values to match your real deployment.

