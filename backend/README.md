# Backend (Rust / Actix Web)

Implements local LoRaWAN ingestion, frame decoding, optional downlink posting, and SSE streaming.

## Modules

- `main.rs`: bootstrap, CORS, conditional wiring (`USE_REMOTE_UWB`).
- `lorawan_stream.rs`: ingestion endpoint + SSE local stream.
- `lorawan_codec.rs`: crypto + frame parse + downlink construction.

## Key Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/uwb` | POST | Ingest encrypted uplink frame, decode, broadcast location or create downlink. |
| `/proxy/uwbStream` | GET | Local SSE stream of `uwb_update` events. |
| `/mock/stream` | GET | Synthetic SSE generator for testing UI. |
| `/mock/once` | GET | Single synthetic payload (JSON or SSE). |
| `/positions` | GET | Legacy single position sample. |

## Data Structures

`DecodedFrame` in `lorawan_codec.rs`:
```text
raw_payload: Vec<u8>         // Decrypted payload bytes (after removing HMAC segment)
message_type: u8             // 0x01 registration, 0x05 location, 0x03 status, etc.
buffer_explained: JSON       // Field-by-field hex breakdown aiding debugging.
new_buffer_response: Option<Vec<u8>> // Only for 0x01 registration.
```

## Downlink Construction

For 0x01 frames the downlink buffer is assembled then encrypted:
1. Compose `new_buffer_response` fields (device ID, flags, reservations).
2. Compute checksum16 over `[0x02 | new_buffer_response]`.
3. Assemble final frame pieces: header, equipment code, message number, ack=0x00, type=0x02, payload, CRC, frame end.
4. Convert to hex, append timestamp (BE8) for HMAC input, prepend HMAC, encrypt with AES-ECB.

## Environment

See root `README.md` for comprehensive list. `DOWNLINK_URL` enables external POST for downlink frames.

## Error Handling

- Decode failures return `{ ok:true, error }` and broadcast a diagnostic event; ingestion client still receives 200.
- Downlink HTTP failures appended as `downlinkHttpError`.

## Testing Ideas

- Unit test `decode_frame` with known 0x01 & 0x05 captured frames (assert field extraction). 
- Property test `checksum16` against random buffers vs. Node implementation results.
- Integration test posting synthetic encrypted frame and verifying SSE emission (requires fixture generator).
