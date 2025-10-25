Project file documentation — Pinpoint

This document lists important files and a short description of their purpose and key methods.

Root
- docker-compose.yml — runs backend and frontend with Docker.
- README.md — quick start and notes.
- DOCS.md — this file.

Frontend (/frontend)
- package.json, vite.config.js — standard Vite React config.
- public/default-plan.svg — demo factory plan asset served at /default-plan.svg.

src/
- main.jsx — application entry that mounts React App.
- App.jsx
  - Purpose: main application and state management.
  - Key state: `anchors` (stored normalized), `factoryWidthMeters`, `factoryHeightMeters`, `smoothed` (EMA per device), `pollUrl`, `pollIntervalSec`, `polling`.
  - fetchPositions(): Fetches data from `pollUrl` (supports uwb_update payload or legacy positions array).
  - handleUwbUpdate(payload): Runs trilateration on `payload.beacons`, converts to normalized coords, applies EMA smoothing, and updates UI.
  - onPlanClick(e): When Anchor Mode is active, allows adding anchors by clicking and entering `beaconId`.
  - startAnchorDrag(i,e): Drag handler to move anchors on the plan.

- components/Layout.js
  - TopBar component: presents API key input, poll URL input and Fetch Now button. Extracted as a presentational component.

- triangulation.js
  - Purpose: convert per-anchor distances into 2D positions using a Levenberg-Marquardt style solver.
  - trilaterate(anchors, distances): returns {x,y} in meters or null on failure.

- triangulation.test.js
  - Simple test script that runs trilateration on a known configuration and throws if the result is incorrect. Run with a JS runner or adapt to jest.

Backend (/backend)
- Cargo.toml — Rust dependencies (actix-web, actix-cors, rand).
- src/main.rs
  - Purpose: simple Actix web server that exposes GET /positions for demo.
  - generate_uwb_update(width,height): generates a random device position and computes distances to anchors; returns a JSON `uwb_update` payload.
  - anchors(): anchor positions used to compute distances for the mock payload. Make sure these align with frontend anchors for realistic testing.

Notes
- Anchors must have matching `beaconId` values in both frontend and backend to enable proper trilateration.
- Units: distances are treated as meters throughout. Adjust `factoryWidthMeters` and `factoryHeightMeters` in the frontend to match your physical plan.

If you'd like, I can also generate a machine-readable API spec (OpenAPI) for the mock endpoint or convert `triangulation.test.js` into a Jest test and wire it into `npm test`.
