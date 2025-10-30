# Pinpoint — Indoor Tag Positioning Demo

This repository is a self-contained demo showing how to collect UWB-like distance measurements, run trilateration to compute 2D positions, and visualize live tag locations on a plan. It includes a React + Vite frontend (presentation/UI) and an Actix (Rust) backend (application/data layer). Docker and a quickstart helper are included so you can run the full stack locally.

This README documents the architecture, design rationale (why there is a separate backend and what it does), how to run the project, and a file-by-file description of the codebase so you can extend, debug, or adapt it.

---

## Quickstart (docker)

A quick helper `quickstart.sh` and `Makefile` exist to start the services. The project is configured to work with Docker Compose.

From the project root:

- Start the stack (rebuild images if needed):

  # If you have Docker and docker-compose installed
  make dev

- Or run the quickstart script directly (it includes helpful checks):

  ./quickstart.sh --yes

- If you prefer without the helper:

  docker compose up --build

This starts two services:

- frontend: the React app (default port 5173 in dev or served by the container)
- backend: Actix server listening on port 8080 (in the container)

Open the frontend URL shown in the quickstart or open `http://localhost:5173`.

---

## Running tests

Frontend (Vitest):

  cd frontend
  npm install
  npm run test

Backend (Rust):

  cd backend
  cargo test

Notes: the frontend tests include a `mock-json-positions.test.js` which attempts to map beacon IDs to normalized anchor corners and reports out-of-bounds counts — it's an intentionally diagnostic test that reveals mismatches between recorded data and solver assumptions.

---

## Troubleshooting & gotchas

- Docker runtime error: missing libssl
  - Symptom: container fails to start with message about `libssl.so.3`.
  - Fix: the backend Dockerfile is already updated to install `libssl3` and `ca-certificates`. If you still see this when building/running locally, ensure the base image matches the build target and rebuild the backend image:

    docker compose build backend
    docker compose up -d backend

- Path history not growing / persistent device paths
  - Cause: the demo generator originally emitted a new random `deviceId` for each event. The backend mock endpoints have been updated to emit a stable `deviceId` (hex + decimal) so the frontend can identify and accumulate points into a single device path.
  - If you still see path fragmentation, check the SSE payload received by the browser and inspect the `deviceIdHex`/`deviceIdDecimal` fields. The frontend also uses a fallback `payload.deviceIdHex || payload.deviceId || 'mock-device'` to avoid missing IDs.

- Mock JSON trilateration producing out-of-bounds points
  - The test `mock-json-positions.test.js` demonstrates this: recorded measurement data may not match the solver assumptions (room size, anchor ordering, z-offset of tag, sensor noise). To debug:
    - Verify the anchors placed in the frontend (Admin) match the anchors assumed by the recording (order and normalized positions).
    - Ensure the correct factory/room width and height are configured before converting normalized anchors to meters — mixing meters and normalized coordinates causes scale errors.
    - Try smoothing (Kalman or EMA) to reduce noisy spikes.
    - Consider testing 2-anchor analytic intersection fallback or increasing solver robustness (residual-based weighting).

- SSE streaming in browsers
  - The backend exposes `/mock/stream` as `text/event-stream` and returns SSE event blocks. The frontend reads the response stream and parses SSE-like messages — it's not using EventSource intentionally so that low-level control over reconnect and parsing is possible.

---

## File / Directory walkthrough

Top-level

- `docker-compose.yml` — orchestration of `frontend` and `backend` services for local development. Builds images and sets up networking so frontend can call backend by service name.
- `Makefile` — convenience tasks like `make dev` which runs `quickstart.sh`.
- `quickstart.sh` — helper script that checks for Docker, optionally installs toolchains locally (rustup, nvm) if missing, offers helpful flags like `--no-build` and `--yes` for unattended starts.
- `QUICKSTART.md` — short guide referencing `quickstart.sh` and `make dev`.
- `mock.json` / `mock_positions.json` — sample recorded event sequences used by tests. Useful for replaying offline tests.

The Backend (`/backend`)

- `backend/Cargo.toml` — Rust package manifest with dependencies (Actix, serde, reqwest, etc.).
- `backend/Dockerfile` — multi-stage image to build the Rust binary and copy it into a slim runtime image. The runtime stage installs `libssl3` and `ca-certificates` to satisfy OpenSSL runtime dependencies.
- `backend/src/main.rs` — main Actix server implementation. Key points:
  - `anchors()` returns the mock anchors used by the generator (in meters). Update these coordinates if you want the generator to match different room layouts.
  - `generate_uwb_update(width, height)` generates a synthetic `uwb_update` payload with a random device position inside `width x height` and per-anchor distances (contains a small gaussian-like noise injection).
  - `sse_event_block(payload)` converts a JSON payload into a multi-line SSE-style block (with `event: uwb_update` and `data:` lines).
  - `mock_stream` (`/mock/stream`) emits a continuous SSE stream (sleeps between events). It converts measured distances into integer centimeters (matching many real-world devices), and the mock emits a stable `deviceIdHex`/`deviceIdDecimal` for demo continuity.
  - `mock_once` (`/mock/once`) emits a single synthetic payload; with `?sse=1` it returns a single SSE block.
  - `proxy_uwb_stream` (`/proxy/uwbStream`) demonstrates how to perform a server-side refresh token exchange and forward the upstream SSE stream to the browser with the backend acting as a safe client with credentials.
  - `positions` (`/positions`) returns a JSON `uwb_update` once (useful for simple polls).

- `backend/mock_positions.json` — (if present) sample position data produced by the generator for offline replay or debugging.

The Frontend (`/frontend`)

- `frontend/package.json` — JS manifest with dependencies and scripts (dev, build, test).
- `frontend/vite.config.js` — Vite configuration.
- `frontend/public/default-plan.svg` — the default background plan (a single-root SVG with a 1000×1000 viewBox). Replace this with your facility floorplan (SVG). Anchors are placed relative to this plan via normalized coordinates.

- `frontend/src/App.jsx` — the main React app. Responsibilities and important behavior:
  - Connects to the backend streaming endpoints (or to the proxy) and parses incoming `uwb_update` payloads.
  - Converts beacon distances (centimeters from the mock stream) to meters before calling the trilateration solver.
  - Maintains `anchors` in normalized (0..1) coordinates in localStorage. When solving, anchors are converted to meters by multiplying by `factoryWidthMeters` and `factoryHeightMeters`.
  - Calls `triangulation.trilaterate` (see below) with anchors in meters and distances in meters to compute a 2D (x,y) position.
  - Applies smoothing per device: either a simple EMA or a per-device 2D Kalman filter (implemented in `kalman.js`).
  - Stores per-device path history in `paths` state (capped to a configurable length) and renders the path as an SVG polyline on top of the plan. The backend emits a stable `deviceId`, so paths persist across events. There is also a fallback device ID detection in the frontend.
  - UI actions to clear lines, edit anchors, and change smoothing mode are provided.

- `frontend/src/triangulation.js` — the trilateration solver. Key details:
  - Accepts `anchors` (array of {beaconId, x, y} in meters) and `distances` (map of beaconId -> distance in meters).
  - Handles 0/1/2 measurement edge cases (0/1 -> no estimate or direct anchor; 2 -> analytic circle intersection), and for 3+ measurements runs a small Levenberg–Marquardt style iterative optimizer to minimize residuals.
  - Returns an estimated `{x, y}` in meters or `null` if the solver failed to converge.
  - If you change coordinate units in the frontend make sure anchors and distances use the same units (meters recommended).

- `frontend/src/kalman.js` — simple 2D Kalman filter used per device when `smoothingMethod === 'kalman'`. It keeps a state per device and merges updates to reduce jitter.

- `frontend/src/styles.css` — styling including path layer, animated segment drawing between last two points, and the dot/label styles for devices.

- `frontend/src/components/Layout.jsx` and `frontend/src/components/Admin.jsx` — the app layout and admin UI:
  - `Admin.jsx` is the place to configure factory dimensions, anchors (positions and names), and connection settings (poll URL / enable streaming). The top bar has been simplified to reduce clutter.

- `frontend/src/__tests__/*` — Vitest tests. Notable tests:
  - `triangulation-bounds.test.js` — checks solver returns points within an expected bounding box for synthetic inputs.
  - `triangulation-3d-reconstruct.test.js` — exercises solver behavior against a small set of expected values.
  - `mock-json-positions.test.js` — diagnostic test that loads `mock.json` (recorded events) and searches for a mapping between beacon IDs and canonical normalized anchor corners (0,0),(0,1),(1,0),(1,1) that minimizes out-of-bounds results. This test is intentionally tolerant but helps expose discrepancies between recorded data and the solver assumptions (scale/ordering/noise/height).

---

## How data flows (runtime example)

1. Backend emits SSE event (or client polls `GET /positions`), JSON payload shaped like `{ type: 'uwb_update', payload: { deviceIdHex, deviceIdDecimal, beacons: [ {beaconId, distance, ...}, ... ] } }`.
2. Frontend receives the payload, converts the distances from integer centimeters (or floats in meters) into meters, and constructs an anchors-in-meters list by scaling normalized anchors with configured room width/height.
3. Frontend calls the trilateration solver with anchors-in-meters and measured distances-in-meters.
4. The solver returns an (x,y) in meters which the frontend converts back to normalized coordinates (nx = x / factoryWidthMeters, ny = y / factoryHeightMeters) to position it on the SVG plan.
5. The frontend applies smoothing and appends the point to the per-device path for visualisation.

---

## Debugging trilateration and real data tips

- Units are critical: anchors and distances must be in the same unit. The generator converts internal meters to centimeters in the SSE payload intentionally — the frontend converts them back to meters before solving.

- Anchor ordering: if your recording uses a different ordering or anchor set than the solver expects, results can appear scrambled. The `mock-json-positions.test.js` contains permutation logic to attempt mapping beacon IDs to canonical corners — helpful for exploring ordering issues.

- Height (z) component: measured distances are 3D. Trilateration in this repo is strictly 2D; if tags or anchors have a non-negligible height difference the solver will return biased positions (or fail). Consider applying a vertical compensation (sqrt(d^2 - z^2)) before running the 2D solver if you know the height offset.

- Noisy or missing beacons: the solver gracefully handles 2 beacon cases with analytic circle intersection; however more than 3 beacons with conflicting measurements may lead the iterative solver to converge to a local minimum. You can:
  - Add residual-based weighting (de-weight outliers),
  - Use a robust cost function (Huber loss), or
  - Pre-filter out beacons with suspiciously large residuals.

- Visual verification: open the Admin UI and place anchors at the reported normalized coordinates, then check a few synthetic `mock/once` responses to confirm that the generated distances map to plausible pixel positions on the SVG.

---

## Next steps and suggested improvements

- Add configurable anchor sets via backend or import/export so tests can reproduce exact anchor layouts.
- Improve solver robustness: support Huber loss, RANSAC-style outlier rejection, and automatic per-frame anchor selection.
- Add 3D-aware correction or explicit z-estimation if anchors/tags are at different heights.
- Persist device path history in localStorage across reloads (currently paths are in-memory while anchors are persisted).
- Add a UI to replay `mock.json` and step through recorded events for debugging.

---

## Contributing

Pull requests welcome. If you plan to change the wire format, keep backward compatibility in mind (frontend expects `payload.beacons[*].distance` in centimeters or meters depending on the endpoint; `/mock/stream` returns CENTIMETERS intentionally).

When adding features that touch streaming or credentials, prefer put code in the backend (proxy/translator) rather than exposing secrets client-side.

---

If you'd like, I can also:

- Add a `DOCUMENTATION.md` with a visual ASCII architecture diagram and developer notes.
- Open a small PR to (optionally) add a `?stable=1` query parameter to the mock endpoints to explicitly toggle stable device ids.
- Expand `mock-json-positions.test.js` to search a wider parameter space (swap width/height, small anchor offsets, per-frame height compensation) to reduce the observed out-of-bounds failures.

Tell me which of the follow-ups you'd like me to apply next and I will implement them.

