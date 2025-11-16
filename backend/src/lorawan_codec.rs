//! LoRaWAN codec utilities (uplink decode & downlink encode/sign).
//!
//! Ported from original Node/TypeScript (`decode.ts`, `encode_client.ts`) implementation with
//! adjustments for Rust's crypto crates. The codec handles:
//! - AES-ECB (manual block mode) with PKCS7 padding for both decrypt (uplink) & encrypt (downlink).
//! - HMAC-SHA256 signature verification/building (first 32 bytes of plaintext).
//! - Frame parsing for message types 0x01 (registration), 0x05 (location report), 0x03 (status).
//! - Construction of downlink registration response buffer + encryption routine.
//! - Conversion of 0x05 frames to a frontend `uwb_update` JSON shape consumed by the React app.
//!
//! Security Notes:
//! - AES-ECB is retained for parity with device firmware; consider migrating to an authenticated
//!   mode (e.g. AES-GCM) in future revisions.
//! - The current decode does NOT re-compute & validate HMAC signature; it preserves it for
//!   structural alignment. Add verification when timestamp / signing inputs are available.
//! - Input frames are assumed well-formed; error paths surface descriptive `String` messages.
use aes::Aes128;
use hmac::{Hmac, Mac};
use sha2::Sha256;
use serde_json::{Value, json};
use hex::FromHex;
use base64::Engine; // bring trait in scope for encode/decode
use tracing::{debug, info, warn, error};

type HmacSha256 = Hmac<Sha256>;

/// Folded 16-bit checksum (same algorithm as Node version) used for CRC field.
pub fn checksum16(data: &[u8]) -> u16 {
    let mut sum: u32 = 0;
    for &b in data { sum = sum.wrapping_add(b as u32); }
    sum = (sum >> 16) + (sum & 0xffff); // fold
    sum += sum >> 16; // second fold
    (sum & 0xffff) as u16
}

/// Remove PKCS7 padding from a mutable buffer.
fn pkcs7_unpad(data: &mut Vec<u8>) -> Result<(), String> {
    if data.is_empty() { 
        debug!("pkcs7_unpad: empty data");
        return Err("empty data".into()); 
    }
    let pad = *data.last().unwrap() as usize;
    if pad==0 || pad>16 || pad>data.len() { 
        debug!(pad, len = data.len(), "pkcs7_unpad: invalid pad value");
        return Err("bad padding".into()); 
    }
    let len = data.len();
    if !data[len-pad..].iter().all(|&b| b as usize == pad) { 
        debug!(pad, len = data.len(), tail = %hex::encode(&data[len-std::cmp::min(pad, len)..]), "pkcs7_unpad: pad bytes mismatch");
        return Err("bad padding bytes".into()); 
    }
    data.truncate(len - pad);
    Ok(())
}

/// Apply PKCS7 padding producing a new Vec<u8> sized to multiple of 16.
fn pkcs7_pad(mut data: Vec<u8>) -> Vec<u8> {
    let pad = 16 - (data.len() % 16);
    data.extend(std::iter::repeat(pad as u8).take(pad));
    data
}

/// Encrypt a single 16-byte block in-place using AES-128-ECB (no IV).
fn aes_ecb_block_encrypt(key: &[u8;16], block: &mut [u8;16]) {
    use aes::cipher::{BlockEncrypt, KeyInit};
    use aes::cipher::generic_array::GenericArray;
    let cipher = Aes128::new(&GenericArray::from_slice(key));
    let mut ba = GenericArray::clone_from_slice(block);
    cipher.encrypt_block(&mut ba);
    block.copy_from_slice(&ba);
}

/// Decrypt a single 16-byte block in-place using AES-128-ECB (no IV).
fn aes_ecb_block_decrypt(key: &[u8;16], block: &mut [u8;16]) {
    use aes::cipher::{BlockDecrypt, KeyInit};
    use aes::cipher::generic_array::GenericArray;
    let cipher = Aes128::new(&GenericArray::from_slice(key));
    let mut ba = GenericArray::clone_from_slice(block);
    cipher.decrypt_block(&mut ba);
    block.copy_from_slice(&ba);
}

/// Decrypt ciphertext using AES-128-CBC. Supports two IV modes:
/// - "prefix": first 16 bytes of ciphertext are the IV, remaining bytes are the actual ciphertext
/// - "zero": IV is 16 zero bytes, entire ciphertext is treated as CBC blocks
/// If `do_unpad` is true, PKCS7 unpadding is applied to the result.
fn aes_cbc_decrypt(key_hex: &str, b64: &str, iv_mode: &str, do_unpad: bool) -> Result<Vec<u8>, String> {
    debug!(key_hex_len = key_hex.len(), b64_len = b64.len(), iv_mode, do_unpad, "aes_cbc_decrypt: starting");
    let key = <[u8;16]>::from_hex(key_hex).map_err(|e| format!("bad key hex: {e}"))?;
    let ct_all = base64::engine::general_purpose::STANDARD
        .decode(b64.as_bytes())
        .map_err(|e| format!("base64: {e}"))?;
    if ct_all.len() < 16 { return Err("ct too short".into()); }
    let (iv, ct) = match iv_mode {
        "prefix" => {
            if ct_all.len() < 32 { return Err("ct too short for prefix iv".into()); }
            let mut iv = [0u8;16];
            iv.copy_from_slice(&ct_all[0..16]);
            (iv, ct_all[16..].to_vec())
        },
        "zero" => {
            let iv = [0u8;16];
            (iv, ct_all)
        },
        other => { return Err(format!("unknown iv_mode: {}", other)); }
    };
    debug!(ct_len = ct.len(), iv_first8 = %hex::encode(&iv[0..8.min(iv.len())]), "aes_cbc_decrypt: ct prepared");
    if ct.len() % 16 != 0 { return Err("ct not multiple of block size".into()); }
    let mut out = vec![0u8; ct.len()];
    let mut prev = iv;
    for (i, chunk) in ct.chunks(16).enumerate() {
        let mut block = [0u8;16];
        block.copy_from_slice(chunk);
        aes_ecb_block_decrypt(&key, &mut block);
        for j in 0..16 { block[j] ^= prev[j]; }
        out[i*16..(i+1)*16].copy_from_slice(&block);
        // CBC decrypt uses previous ciphertext block as next prev
        let mut new_prev = [0u8;16];
        new_prev.copy_from_slice(chunk);
        prev = new_prev;
    }
    let pad_val = *out.last().unwrap_or(&0);
    debug!(pt_len = out.len(), pt_first32 = %hex::encode(&out.get(0..32).unwrap_or(&[])), pad_val, do_unpad, "aes_cbc_decrypt: decrypted before unpad");
    if do_unpad {
        let mut tmp = out;
        pkcs7_unpad(&mut tmp)?;
        debug!(pt_len = tmp.len(), pt_first32 = %hex::encode(&tmp.get(0..32).unwrap_or(&[])), "aes_cbc_decrypt: unpad ok");
        Ok(tmp)
    } else {
        Ok(out)
    }
}

/// Decrypt base64 ciphertext using hex key (AES-128-ECB + PKCS7). Returns plaintext bytes.
fn aes_ecb_decrypt(key_hex: &str, b64: &str) -> Result<Vec<u8>, String> {
    debug!(key_hex_len = key_hex.len(), b64_len = b64.len(), "aes_ecb_decrypt: starting");
    let key = <[u8;16]>::from_hex(key_hex).map_err(|e| format!("bad key hex: {e}"))?;
    let ct = base64::engine::general_purpose::STANDARD
        .decode(b64.as_bytes())
        .map_err(|e| format!("base64: {e}"))?;
    debug!(ct_len = ct.len(), ct_first16 = %hex::encode(&ct.get(0..16).unwrap_or(&[])), "aes_ecb_decrypt: decoded base64");
    if ct.len() % 16 != 0 { 
        warn!(ct_len = ct.len(), "aes_ecb_decrypt: ciphertext not multiple of 16");
        return Err("ct not multiple of block size".into()); 
    }
    let mut out = vec![0u8; ct.len()];
    for (i, chunk) in ct.chunks(16).enumerate() {
        let mut block = [0u8;16];
        block.copy_from_slice(chunk);
        aes_ecb_block_decrypt(&key, &mut block);
        out[i*16..(i+1)*16].copy_from_slice(&block);
    }
    let pad_val = *out.last().unwrap_or(&0);
    debug!(pt_len = out.len(), pt_first32 = %hex::encode(&out.get(0..32).unwrap_or(&[])), pad_val, "aes_ecb_decrypt: decrypted before unpad");
    pkcs7_unpad(&mut out)?;
    debug!(pt_len = out.len(), pt_first32 = %hex::encode(&out.get(0..32).unwrap_or(&[])), "aes_ecb_decrypt: unpad ok");
    Ok(out)
}

/// Decrypt base64 ciphertext using hex key (AES-128-ECB) without PKCS7 unpadding.
/// Used as a fallback when devices do not apply padding and plaintext is already a multiple of 16 bytes.
fn aes_ecb_decrypt_no_unpad(key_hex: &str, b64: &str) -> Result<Vec<u8>, String> {
    debug!(key_hex_len = key_hex.len(), b64_len = b64.len(), "aes_ecb_decrypt_no_unpad: starting");
    let key = <[u8;16]>::from_hex(key_hex).map_err(|e| format!("bad key hex: {e}"))?;
    let ct = base64::engine::general_purpose::STANDARD
        .decode(b64.as_bytes())
        .map_err(|e| format!("base64: {e}"))?;
    debug!(ct_len = ct.len(), ct_first16 = %hex::encode(&ct.get(0..16).unwrap_or(&[])), "aes_ecb_decrypt_no_unpad: decoded base64");
    if ct.len() % 16 != 0 {
        warn!(ct_len = ct.len(), "aes_ecb_decrypt_no_unpad: ciphertext not multiple of 16");
        return Err("ct not multiple of block size".into());
    }
    let mut out = vec![0u8; ct.len()];
    for (i, chunk) in ct.chunks(16).enumerate() {
        let mut block = [0u8;16];
        block.copy_from_slice(chunk);
        aes_ecb_block_decrypt(&key, &mut block);
        out[i*16..(i+1)*16].copy_from_slice(&block);
    }
    debug!(pt_len = out.len(), pt_first32 = %hex::encode(&out.get(0..32).unwrap_or(&[])), "aes_ecb_decrypt_no_unpad: done");
    Ok(out)
}

/// Encrypt plaintext bytes using hex key (AES-128-ECB + PKCS7) -> base64 ciphertext.
fn aes_ecb_encrypt(key_hex: &str, pt: &[u8]) -> Result<String, String> {
    let key = <[u8;16]>::from_hex(key_hex).map_err(|e| format!("bad key hex: {e}"))?;
    let mut data = pkcs7_pad(pt.to_vec());
    for chunk in data.chunks_mut(16) {
        let mut block = [0u8;16];
        block.copy_from_slice(chunk);
        aes_ecb_block_encrypt(&key, &mut block);
        chunk.copy_from_slice(&block);
    }
    Ok(base64::engine::general_purpose::STANDARD.encode(data))
}

/// Compute HMAC-SHA256 over hex input using hex key; returns raw 32-byte digest.
fn hmac_sha256_hex(data_hex: &str, token_hex: &str) -> Result<Vec<u8>, String> {
    let data = Vec::from_hex(data_hex).map_err(|e| format!("data hex: {e}"))?;
    let key = Vec::from_hex(token_hex).map_err(|e| format!("token hex: {e}"))?;
    let mut mac = HmacSha256::new_from_slice(&key).map_err(|e| format!("hmac init: {e}"))?;
    mac.update(&data);
    Ok(mac.finalize().into_bytes().to_vec())
}

/// Convert millisecond timestamp to big-endian 8-byte array (upper 32 bits + lower 32 bits).
fn timestamp_be8(ts_ms: u128) -> [u8;8] {
    let mut out = [0u8;8];
    let hi = (ts_ms >> 32) as u32;
    let lo = (ts_ms & 0xFFFF_FFFF) as u32;
    out[0..4].copy_from_slice(&hi.to_be_bytes());
    out[4..8].copy_from_slice(&lo.to_be_bytes());
    out
}

/// Parsed uplink frame metadata and helper representation.
#[derive(Debug)]
pub struct DecodedFrame {
    pub raw_payload: Vec<u8>,
    pub message_type: u8,
    pub buffer_explained: Value,
    pub new_buffer_response: Option<Vec<u8>>, // for type 0x01
}

/// Decode an uplink frame (base64) with given AES key + sign token.
/// Returns a `DecodedFrame` containing raw payload, message type and an explanatory JSON tree.
pub fn decode_frame(b64: &str, secret_key_hex: &str, sign_token_hex: &str) -> Result<DecodedFrame, String> {
    debug!(b64_len = b64.len(), key_hex_len = secret_key_hex.len(), sign_token_hex_len = sign_token_hex.len(), "decode_frame: begin");
    let allow_fallback = std::env::var("LORA_DECODE_FALLBACK").ok().map(|s| s=="1" || s.eq_ignore_ascii_case("true")).unwrap_or(false);
    let try_cbc = std::env::var("LORA_TRY_CBC").ok().map(|s| s=="1" || s.eq_ignore_ascii_case("true")).unwrap_or(false);
    let allow_hmac_mismatch = std::env::var("LORA_ALLOW_HMAC_MISMATCH").ok().map(|s| s=="1" || s.eq_ignore_ascii_case("true")).unwrap_or(false);

    // Helper to parse a payload buffer into DecodedFrame (reusing existing logic)
    fn parse_payload_into_df(payload: Vec<u8>, require_valid_msg: bool) -> Result<DecodedFrame, String> {
        if payload.len() < 11 { return Err("frame too short".into()); }
        let frame_header = &payload[0..2];
        let equip = &payload[2..3];
        let msg_number = &payload[3..5];
        let ack_flag = &payload[5..6];
        let msg_type = payload[6];
        if require_valid_msg {
            let valid_msg = matches!(msg_type, 0x01 | 0x03 | 0x05);
            if !valid_msg { return Err(format!("msg_type_invalid: 0x{:02x}", msg_type)); }
        }
        debug!(msg_type = format!("0x{:02x}", msg_type), payload_total = payload.len(), "decode_frame: header parsed");
        if payload.len() < 4 { return Err("frame too short".into()); }
        let crc = &payload[payload.len()-4..payload.len()-2];
        let frame_end = &payload[payload.len()-2..];
        let data_content = &payload[7..payload.len()-4];

        let mut buffer_obj = json!({
            "Full Buffer": base64::engine::general_purpose::STANDARD.encode(&payload),
            "Frame Header": hex::encode(frame_header),
            "Equipment cluster coding": hex::encode(equip),
            "Message Number": hex::encode(msg_number),
            "ACK Flag": hex::encode(ack_flag),
            "Message Type": format!("{:02x}", msg_type),
            "CRC Check": hex::encode(crc),
            "Frame End": hex::encode(frame_end)
        });

        match msg_type {
            0x01 => {
                if data_content.len() < 10 { return Err("mt01 content too short".into()); }
                let obj = json!({
                    "Full Byte": hex::encode(data_content),
                    "Device ID": hex::encode(&data_content[0..4]),
                    "Device version and type": hex::encode(&data_content[4..6]),
                    "Position the shortest transmission period": hex::encode(&data_content[6..7]),
                    "Sports assistance function swtich": hex::encode(&data_content[7..8]),
                    "Beacon search timeout": hex::encode(&data_content[8..9]),
                    "Beacon search quantity": hex::encode(&data_content[9..10])
                });
                buffer_obj["Data Content"] = obj;
            },
            0x05 => {
                if data_content.len() < 13 { return Err("mt05 content too short".into()); }
                let obj = json!({
                    "Full Byte": hex::encode(data_content),
                    "Device ID": hex::encode(&data_content[0..4]),
                    "Number of Beacons": hex::encode(&data_content[4..5]),
                    "Physical Activity Flag": hex::encode(&data_content[5..6]),
                    "Major": hex::encode(&data_content[6..8]),
                    "Minor": hex::encode(&data_content[8..10]),
                    "Distance": hex::encode(&data_content[10..12]),
                    "Battery Level": hex::encode(&data_content[12..13]),
                    "Remaining Beacon Info": hex::encode(&data_content[13..])
                });
                buffer_obj["Data Content"] = obj;
            },
            0x03 => {
                if data_content.len() < 9 { return Err("mt03 content too short".into()); }
                let obj = json!({
                    "Full Byte": hex::encode(data_content),
                    "UID of RFID": hex::encode(&data_content[0..4]),
                    "Device Abnormal": hex::encode(&data_content[4..5]),
                    "Battery Level": hex::encode(&data_content[5..6]),
                    "Configuration File Version": hex::encode(&data_content[6..7]),
                    "Reservation": hex::encode(&data_content[7..9])
                });
                buffer_obj["Data Content"] = obj;
            },
            _ => {
                buffer_obj["Data Content"] = Value::String(hex::encode(data_content));
            }
        }

        let new_buffer_response = if msg_type == 0x01 {
            if let Some(dc) = buffer_obj.get("Data Content").and_then(|v| v.get("Full Byte")).and_then(|v| v.as_str()) {
                let dc_bytes = Vec::from_hex(dc).unwrap_or_default();
                if dc_bytes.len() >= 10 {
                    let mut out = Vec::new();
                    out.extend_from_slice(&dc_bytes[0..4]);
                    out.push(0x01);
                    out.extend_from_slice(&dc_bytes[4..6]);
                    out.push(0x00);
                    out.push(0x01);
                    out.push(0x01);
                    out.push(0x00);
                    out.push(0x00);
                    Some(out)
                } else { None }
            } else { None }
        } else { None };

        Ok(DecodedFrame { raw_payload: payload, message_type: msg_type, buffer_explained: buffer_obj, new_buffer_response })
    }

    // Build plaintext candidates across modes
    let mut candidates: Vec<(&'static str, Vec<u8>)> = Vec::new();
    match aes_ecb_decrypt(secret_key_hex, b64) {
        Ok(pt) => { debug!(mode = "ecb-pkcs7", "decode_frame: primary decrypt ok"); candidates.push(("ecb-pkcs7", pt)); },
        Err(e) => {
            warn!(error = %e, fallback = allow_fallback, "decode_frame: primary decrypt failed");
            if allow_fallback {
                if let Ok(pt2) = aes_ecb_decrypt_no_unpad(secret_key_hex, b64) {
                    debug!(mode = "ecb-raw", "decode_frame: fallback decrypt ok");
                    candidates.push(("ecb-raw", pt2));
                }
            }
        }
    }
    if try_cbc {
        if let Ok(pt) = aes_cbc_decrypt(secret_key_hex, b64, "prefix", true) { candidates.push(("cbc-pkcs7:prefix", pt)); }
        if let Ok(pt) = aes_cbc_decrypt(secret_key_hex, b64, "zero", true) { candidates.push(("cbc-pkcs7:zero", pt)); }
        if let Ok(pt) = aes_cbc_decrypt(secret_key_hex, b64, "prefix", false) { candidates.push(("cbc-raw:prefix", pt)); }
        if let Ok(pt) = aes_cbc_decrypt(secret_key_hex, b64, "zero", false) { candidates.push(("cbc-raw:zero", pt)); }
    }

    if candidates.is_empty() { return Err("no decrypt candidates".into()); }

    // Try signature layouts for each plaintext candidate
    // Layouts: (name, sig_len, sig_first)
    let layouts: [(&str, usize, bool); 4] = [
        ("sig32_first", 32, true),
        ("sig32_last", 32, false),
        ("sig16_first", 16, true),
        ("sig16_last", 16, false),
    ];

    // Evaluate candidates and pick the best per HMAC + message type validity
    let mut best_df: Option<DecodedFrame> = None;
    let mut best_score = -1i32; // 2 = hmac match + valid msg, 1 = valid msg (if mismatch allowed), 0 = parse ok but unknown msg
    for (mode, pt) in candidates.into_iter() {
        debug!(mode, pt_len = pt.len(), pt_first16 = %hex::encode(&pt.get(0..16).unwrap_or(&[])), "decode_frame: trying mode");
        for (layout_name, sig_len, sig_first) in layouts.iter() {
            if pt.len() < sig_len + 11 { continue; }
            let (sig, payload) = if *sig_first {
                (&pt[0..*sig_len], pt[*sig_len..].to_vec())
            } else {
                (&pt[pt.len()-*sig_len..], pt[0..pt.len()-*sig_len].to_vec())
            };
            debug!(mode, layout = *layout_name, payload_len = payload.len(), sig_len = *sig_len, sig_prefix8 = %hex::encode(&sig[0..sig.len().min(8)]), "decode_frame: split plaintext");

            // Compute HMAC over hex(payload).
            let mut hmac_ok = false;
            if !sign_token_hex.is_empty() {
                if let Ok(mac) = hmac_sha256_hex(&hex::encode(&payload), sign_token_hex) {
                    if *sig_len == 32 {
                        hmac_ok = mac.len() >= 32 && &mac[0..32] == sig;
                    } else { // 16
                        hmac_ok = mac.len() >= 16 && &mac[0..16] == sig;
                    }
                    if !hmac_ok {
                        debug!(mode, layout = *layout_name, computed_prefix8 = %hex::encode(&mac[0..8]), sig_prefix8 = %hex::encode(&sig[0..sig.len().min(8)]), "decode_frame: hmac mismatch");
                    } else {
                        debug!(mode, layout = *layout_name, "decode_frame: hmac match");
                    }
                }
            }

            // In fallback/deep mode, require known message type to filter bogus decrypts
            let require_valid_msg = allow_fallback || try_cbc;
            match parse_payload_into_df(payload.clone(), require_valid_msg) {
                Ok(df) => {
                    let valid_msg = matches!(df.message_type, 0x01 | 0x03 | 0x05);
                    let mut score = 0;
                    if hmac_ok && valid_msg { score = 2; }
                    else if valid_msg && allow_hmac_mismatch { score = 1; }
                    else if hmac_ok { score = 1; } // accept if HMAC ok even if msg type not in set
                    // else score remains 0
                    if score > best_score {
                        debug!(mode, layout = *layout_name, score, msg_type = format!("0x{:02x}", df.message_type), "decode_frame: candidate selected");
                        best_score = score;
                        best_df = Some(df);
                        if score == 2 { break; } // best possible for this mode/layout
                    }
                },
                Err(e) => {
                    debug!(mode, layout = *layout_name, error = %e, "decode_frame: parse failed");
                }
            }
        }
        if best_score == 2 { break; }
    }

    match best_df {
        Some(df) => {
            if best_score >= 1 { Ok(df) }
            else if allow_hmac_mismatch { Ok(df) }
            else { Err("hmac_mismatch".into()) }
        }
        None => Err("no valid decode candidates".into())
    }
}

/// Construct downlink registration response (for message type 0x01) replicating Node logic.
pub fn build_downlink_hex(df: &DecodedFrame) -> Result<Vec<u8>, String> {
    // Only for type 0x01 registration
    let new_resp = df.new_buffer_response.as_ref().ok_or("no new_buffer_response")?;
    // Assemble finalRequestBuffer per Node logic:
    // FrameHeader | EquipmentCoding | MessageNumber | 0x00 | 0x02 | newResp | CRC(0x02+newResp) | FrameEnd
    if df.raw_payload.len() < 11 { return Err("raw frame too short".into()); }
    let frame_header = &df.raw_payload[0..2];
    let equip = &df.raw_payload[2..3];
    let msg_number = &df.raw_payload[3..5];
    let frame_end = &df.raw_payload[df.raw_payload.len()-2..];

    let mut checksum_data = Vec::new();
    checksum_data.push(0x02u8);
    checksum_data.extend_from_slice(new_resp);
    let crc_u16 = checksum16(&checksum_data);
    let mut crc_buf = [0u8;2];
    crc_buf[0] = (crc_u16 >> 8) as u8; // big-endian
    crc_buf[1] = (crc_u16 & 0xFF) as u8;

    let mut final_buf = Vec::new();
    final_buf.extend_from_slice(frame_header);
    final_buf.extend_from_slice(equip);
    final_buf.extend_from_slice(msg_number);
    final_buf.push(0x00); // ACK Number
    final_buf.push(0x02); // Message Type (downlink registration response?)
    final_buf.extend_from_slice(new_resp);
    final_buf.extend_from_slice(&crc_buf);
    final_buf.extend_from_slice(frame_end);
    Ok(final_buf)
}

/// Encrypt downlink buffer into base64 LoRaWAN payload.
/// Algorithm: HMAC-SHA256(hex(downlink)||timestampBE8) || downlinkBytes -> AES-ECB encrypt.
pub fn encrypt_downlink(timestamp_ms: u128, downlink_hex: &[u8], sign_token_hex: &str, secret_key_hex: &str) -> Result<String, String> {
    // Node logic: signData = payloadHex + timestampHexBE8; HMAC-SHA256 over that, then (HMAC || payloadHex) encrypted with AES-ECB.
    let ts_be8 = timestamp_be8(timestamp_ms);
    let payload_hex = hex::encode(downlink_hex);
    let ts_hex = hex::encode(ts_be8);
    let sign_input_hex = format!("{}{}", payload_hex, ts_hex);
    let hmac_bytes = hmac_sha256_hex(&sign_input_hex, sign_token_hex)?; // 32 bytes
    let mut plain = Vec::new();
    plain.extend_from_slice(&hmac_bytes);
    plain.extend_from_slice(&downlink_hex);
    let b64 = aes_ecb_encrypt(secret_key_hex, &plain)?;
    Ok(b64)
}

/// Convert a 0x05 location report frame into `uwb_update` JSON consumed by the frontend.
pub fn as_uwb_update(df: &DecodedFrame, ts_field: u128) -> Option<Value> {
    if df.message_type != 0x05 { return None; }
    // Extract fields from buffer_explained
    let dc = df.buffer_explained.get("Data Content")?;
    let device_id_hex = dc.get("Device ID")?.as_str()?;
    let num_beacons_hex = dc.get("Number of Beacons")?.as_str()?;
    let motion_flag_hex = dc.get("Physical Activity Flag")?.as_str()?;
    let device_id_bytes = Vec::from_hex(device_id_hex).ok()?;
    if device_id_bytes.len() < 4 { return None; }
    let device_id_decimal = ((device_id_bytes[0] as u32) << 24)
        | ((device_id_bytes[1] as u32) << 16)
        | ((device_id_bytes[2] as u32) << 8)
        | (device_id_bytes[3] as u32);
    let num_beacons = u8::from_str_radix(num_beacons_hex, 16).ok()?;
    let motion_flag = u8::from_str_radix(motion_flag_hex, 16).ok()?;
    let motion_text = if motion_flag == 1 { "Movement Detected" } else { "No Movement" };

    // Build full beacons array. First beacon is named; remaining are in Remaining Beacon Info as 7-byte chunks.
    let mut beacons_vec: Vec<Value> = Vec::new();
    // First beacon
    if let (Some(major_hex), Some(minor_hex), Some(distance_hex), Some(battery_hex)) = (
        dc.get("Major").and_then(|v| v.as_str()),
        dc.get("Minor").and_then(|v| v.as_str()),
        dc.get("Distance").and_then(|v| v.as_str()),
        dc.get("Battery Level").and_then(|v| v.as_str()),
    ) {
        let distance_bytes = Vec::from_hex(distance_hex).ok()?;
        if distance_bytes.len() < 2 { return None; }
        let distance_cm = ((distance_bytes[0] as u16) << 8) | (distance_bytes[1] as u16);
        let battery_bytes = Vec::from_hex(battery_hex).ok()?;
        let battery = if battery_bytes.is_empty() { 0 } else { battery_bytes[0] };
        beacons_vec.push(json!({
            "major": major_hex,
            "minor": minor_hex,
            "beaconId": format!("{}{}", major_hex, minor_hex),
            "distance": distance_cm,
            "battery": battery
        }));
    }

    // Remaining beacons: parse 7-byte entries [major(2) minor(2) distance(2 BE) battery(1)]
    if let Some(rem_hex) = dc.get("Remaining Beacon Info").and_then(|v| v.as_str()) {
        if let Ok(rem_bytes) = Vec::from_hex(rem_hex) {
            let per = 7usize;
            let mut i = 0usize;
            while i + per <= rem_bytes.len() && (beacons_vec.len() as u8) < num_beacons {
                let major = &rem_bytes[i..i+2];
                let minor = &rem_bytes[i+2..i+4];
                let dist = ((rem_bytes[i+4] as u16) << 8) | (rem_bytes[i+5] as u16);
                let batt = rem_bytes[i+6];
                beacons_vec.push(json!({
                    "major": hex::encode(major),
                    "minor": hex::encode(minor),
                    "beaconId": format!("{}{}", hex::encode(major), hex::encode(minor)),
                    "distance": dist,
                    "battery": batt
                }));
                i += per;
            }
        }
    }

    Some(json!({
        "type": "uwb_update",
        "payload": {
            "deviceIdHex": device_id_hex,
            "deviceIdDecimal": device_id_decimal,
            "numberOfBeacons": num_beacons,
            "motion": motion_text,
            "beacons": beacons_vec,
            "requestTimestamp": ts_field
        },
        "ts": ts_field
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn build_uplink_cipher_b64(secret_key: &str, sign_token: &str, payload_bytes: &[u8]) -> String {
        // HMAC over hex(payload) as per test-only simplified check; prepend first 32 bytes
        let payload_hex = hex::encode(payload_bytes);
        let mac = hmac_sha256_hex(&payload_hex, sign_token).expect("hmac");
        let mut plain = Vec::new();
        plain.extend_from_slice(&mac[..32]);
        plain.extend_from_slice(payload_bytes);
        aes_ecb_encrypt(secret_key, &plain).expect("encrypt to b64")
    }

    #[test]
    fn checksum16_examples() {
        assert_eq!(checksum16(&[0x00]), 0x0000);
        assert_eq!(checksum16(&[0xFF, 0x01]), 0x0100);
    }

    #[test]
    fn decode_frame_0x05_with_two_beacons() {
        // Build minimal 0x05 payload with two beacons (one in named fields, one in remaining info)
        let mut payload: Vec<u8> = Vec::new();
        payload.extend_from_slice(&[0xFF, 0xEE]); // frame header
        payload.push(0x51); // equipment
        payload.extend_from_slice(&[0x00, 0x30]); // msg number
        payload.push(0x00); // ack
        payload.push(0x05); // message type
        // data content
        let device_id = [0xA0, 0xBA, 0x3E, 0x29];
        payload.extend_from_slice(&device_id);
        payload.push(0x02); // number of beacons = 2
        payload.push(0x01); // motion flag
        // first beacon (named fields)
        payload.extend_from_slice(&[0x02, 0x00]); // major
        payload.extend_from_slice(&[0x00, 0xB3]); // minor
        payload.extend_from_slice(&[0x00, 0x64]); // distance 100 cm
        payload.push(0x64); // battery 100
        // remaining beacon info (7 bytes)
        payload.extend_from_slice(&[0x02, 0x00]); // major
        payload.extend_from_slice(&[0x00, 0x53]); // minor
        payload.extend_from_slice(&[0x00, 0xC8]); // distance 200 cm
        payload.push(0x5A); // battery 90
        // CRC (dummy) + frame end
        payload.extend_from_slice(&[0x00, 0x00]);
        payload.extend_from_slice(&[0xEE, 0xFF]);

        let secret = "A60C3263B832E551EEBDDDB93D8B05EA";
        let token = "3E3D4BEE7FE182D8";
        let ct_b64 = build_uplink_cipher_b64(secret, token, &payload);

        let df = decode_frame(&ct_b64, secret, token).expect("decode ok");
        assert_eq!(df.message_type, 0x05);
        let update = as_uwb_update(&df, 0);
        assert!(update.is_some());
        let u = update.unwrap();
        let beacons = u["payload"]["beacons"].as_array().unwrap();
        assert_eq!(beacons.len(), 2);
        assert_eq!(beacons[0]["beaconId"].as_str().unwrap(), "020000b3");
        assert_eq!(beacons[0]["distance"].as_u64().unwrap(), 100);
        assert_eq!(beacons[1]["beaconId"].as_str().unwrap(), "02000053");
        assert_eq!(beacons[1]["distance"].as_u64().unwrap(), 200);
    }

    #[test]
    fn decode_frame_hmac_mismatch_errors() {
        // Build payload as before
        let mut payload: Vec<u8> = vec![0xFF,0xEE,0x51,0x00,0x30,0x00,0x05];
        payload.extend_from_slice(&[0xDE,0xAD,0xBE,0xEF]); // device id
        payload.push(0x01); // one beacon
        payload.push(0x00); // motion
        payload.extend_from_slice(&[0x01,0x02,0x03,0x04,0x00,0x0A]); // beacon (10cm)
        payload.push(0x32);
        payload.extend_from_slice(&[0x00,0x00,0xEE,0xFF]);
        let secret = "A60C3263B832E551EEBDDDB93D8B05EA";
        let token = "3E3D4BEE7FE182D8";
        let b64 = build_uplink_cipher_b64(secret, token, &payload);
        // Use wrong token for verification
        let err = decode_frame(&b64, secret, "0000000000000000").unwrap_err();
        assert_eq!(err, "hmac_mismatch");
    }
}
