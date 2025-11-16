use std::env;
#[path = "../lorawan_codec.rs"]
mod lorawan_codec;
use lorawan_codec::decode_frame;

// Small CLI to help debug uplink decode issues on a server.
// Usage:
//   cargo run --bin decode_uplink -- <base64_ciphertext>
// Reads env vars LORA_SECRET_KEY and LORA_SIGN_TOKEN (hex) or uses the same defaults as the server.
fn main() {
    let mut args = std::env::args().skip(1).collect::<Vec<_>>();
    if args.is_empty() {
        eprintln!("Usage: decode_uplink <base64_ciphertext>\n\nEnvironment:\n  LORA_SECRET_KEY   32-hex AES-128 key\n  LORA_SIGN_TOKEN   16-hex HMAC key (first 8 bytes)\n");
        std::process::exit(2);
    }
    let b64 = args.remove(0);
    let secret_key = env::var("LORA_SECRET_KEY").unwrap_or_else(|_| "A60C3263B832E551EEBDDDB93D8B05EA".to_string());
    let sign_token = env::var("LORA_SIGN_TOKEN").unwrap_or_else(|_| "3E3D4BEE7FE182D8".to_string());

    match decode_frame(&b64, &secret_key, &sign_token) {
        Ok(df) => {
            println!("decode: OK  message_type=0x{:02x}", df.message_type);
            println!("explained: {}", df.buffer_explained);
        }
        Err(e) => {
            // Print a clear error reason to match server logs
            println!("decode: ERR  {}", e);
            std::process::exit(1);
        }
    }
}
