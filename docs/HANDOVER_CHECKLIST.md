# Handover Checklist

Use this list when onboarding a new engineer to the Pinpoint codebase.

## Environment & Setup
- [ ] Install Rust (rustup), Node 18+, and pnpm/npm.
- [ ] Copy `.env` or export environment variables:
  - `BACKEND_PORT` (default 8080)
  - `USE_REMOTE_UWB` (true to use legacy remote stream; omit for local ingestion)
  - `LORA_SECRET_KEY`, `LORA_SIGN_TOKEN` (hex keys from ops)
  - `DOWNLINK_URL` (optional HTTP endpoint for registration downlinks)
- [ ] `cargo run --manifest-path backend/Cargo.toml`
- [ ] `cd frontend && npm i && npm run dev`

## Key Docs
- [ ] `README.md` (root) – quick start, architecture snapshot, env vars
- [ ] `ARCHITECTURE.md` – HLD/LLD, flow and sequence diagrams
- [ ] `docs/sequences.md` – detailed Mermaid sequences
- [ ] `backend/README.md` – endpoints, downlink, testing ideas
- [ ] `frontend/README.md` – data flow, rendering strategy

## Code Tour
- Backend
  - [ ] `backend/src/main.rs` – server bootstrap and mode toggle
  - [ ] `backend/src/lorawan_stream.rs` – POST `/v1/uwb`, SSE `/proxy/uwbStream`
  - [ ] `backend/src/lorawan_codec.rs` – AES/HMAC, frame parse, downlink builder
- Frontend
  - [ ] `frontend/src/App.jsx` – streaming, trilateration, smoothing, overlays
  - [ ] `frontend/src/triangulation.js` – algebraic solver (shared Z)
  - [ ] `frontend/src/kalman.js` – simple 2D Kalman

## Operational Notes
- [ ] Toggle `USE_REMOTE_UWB` for legacy upstream vs local ingest
- [ ] Monitor backend logs for `decode_error` and `lagged` hints on load
- [ ] For registration frames (0x01), verify `downlinkHttp` status when `DOWNLINK_URL` is set
- [ ] Frontend connects to `/proxy/uwbStream`; mock path is `/mock/stream`

## Testing
- [ ] `cargo build` (Rust) – ensure backend compiles cleanly
- [ ] `cd frontend && npm test` – verify unit/UI tests
- [ ] Optional: add Rust unit tests for `lorawan_codec.rs`

## Future Work
- [ ] Validate HMAC signatures (uplink/downlink) once timestamp semantics are finalized
- [ ] Parse multiple beacons in 0x05 and emit arrays to frontend
- [ ] Introduce metrics and structured tracing (OpenTelemetry)
