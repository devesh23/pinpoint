/*

ff ee 51 00 30 00 03 a0 ba 3e 29 00 1e 00 00 01 e2 ee ff
Frame Header -> ff ee 
Equipment cluster coding -> 51
Message Number -> 00 30
ACK Number -> 00
Data Content -> 03 a0 ba 3e 29 00 1e 00 00
CRC -> 01 e2
Frame End -> ee ff

*/

import crypto from 'crypto';
import CryptoJS from 'crypto-js';

// const secretKeyClient = 'A60C3263B832E551EEBDDDB93D8B05EA';
// const signTokenClient = '3E3D4BEE7FE182D8';

const secretKeyHex = '3BA16CA4D2BE9EB96147779B32182750'; // 16 bytes → AES-128
const signTokenHex = '7AE4AF8AAD3BD554'; // can be any length for HMAC
const dataBase64 =
  'nht1ueJzcjQMZqF0m+Hnzu9lnCpS59FjTVzsep9+zAdKOjZJQZ8WukN7DpgnPeqRqGW6t1qsi3mDADtFUlWmKg==';

function aesAlgFromKey(k) {
  if (k.length === 16) return 'aes-128-ecb';
  if (k.length === 24) return 'aes-192-ecb';
  if (k.length === 32) return 'aes-256-ecb';
  throw new Error(`secretKey must be 16/24/32 bytes, got ${k.length}`);
}

function tsToBE8(ts) {
  const b = Buffer.allocUnsafe(8);
  const hi = Math.floor(ts / 2 ** 32);
  const lo = ts >>> 0;
  b.writeUInt32BE(hi, 0);
  b.writeUInt32BE(lo, 4);
  console.log('Timestamp BE8:', b);
  return b;
}

const decodeData = (
  dataBase64,
  secretKeyHex = '3BA16CA4D2BE9EB96147779B32182750',
  signTokenHex = '7AE4AF8AAD3BD554'
) => {
  // --- helpers ---
  const key = Buffer.from(secretKeyHex, 'hex');
  const signKey = Buffer.from(signTokenHex, 'hex');

  // --- decode + decrypt ---
  console.log('dataBase64:', dataBase64);
  const A = Buffer.from(dataBase64.replace(/\s+/g, ''), 'base64'); // ciphertext
  // console.log('Ciphertext A:', A);
  const decipher = crypto.createDecipheriv(aesAlgFromKey(key), key, null);
  decipher.setAutoPadding(true); // PKCS5/PKCS7
  const B = Buffer.concat([decipher.update(A), decipher.final()]); // plaintext: [C|D]
  // console.log('Plaintext B: ', B);

  if (B.length < 32) throw new Error(`Decrypted too short: ${B.length} bytes`);

  const C = B.subarray(0, 32); // HMAC-SHA256 (32 bytes)
  const D = B.subarray(32); // payload

  // console.log('Signature C:', C);
  // console.log('Payload D:  ', D);

  // ff ee 51 00 30 00 03 a0 ba 3e 29 00 1e 00 00 01 e2 ee ff
  // Frame Header -> ff ee
  // Equipment cluster coding -> 51
  // Message Number -> 00 30
  // ACK Number -> 00
  // Data Content -> 03 a0 ba 3e 29 00 1e 00 00
  // CRC -> 01 e2
  // Frame End -> ee ff

  // Data Content ->  00 03 a0 ba 3e 29 00 19 00 00
  // Device ID -> 00 03 a0 ba
  // Device version and type -> 3e 29
  // Position the shortest transmission period -> 00
  // Sports assistance function swtich -> 19
  // Beacon search timeout -> 00
  // Beacon search quantity -> 00

  const bufferExplained: {
    'Full Buffer': Buffer;
    'Frame Header': Buffer;
    'Equipment cluster coding': Buffer;
    'Message Number': Buffer;
    'ACK Flag': Buffer;
    'Message Type': Buffer;
    'Data Content': any;
    'CRC Check': Buffer;
    'Frame End': Buffer;
  } = {};
  bufferExplained['Full Buffer'] = D;
  bufferExplained['Frame Header'] = D.subarray(0, 2);
  bufferExplained['Equipment cluster coding'] = D.subarray(2, 3);
  bufferExplained['Message Number'] = D.subarray(3, 5);
  bufferExplained['ACK Flag'] = D.subarray(5, 6);
  bufferExplained['Message Type'] = D.subarray(6, 7);
  bufferExplained['Data Content'] = D.subarray(7, D.length - 4);
  bufferExplained['CRC Check'] = D.subarray(D.length - 4, D.length - 2);
  bufferExplained['Frame End'] = D.subarray(D.length - 2, D.length);

  if (Buffer.compare(Buffer.from(bufferExplained['Message Type']), Buffer.from([0x01])) === 0) {
    let dataContent: {
      'Full Byte': Buffer;
      'Device ID': Buffer;
      'Device version and type': Buffer;
      'Position the shortest transmission period': Buffer;
      'Sports assistance function swtich': Buffer;
      'Beacon search timeout': Buffer;
      'Beacon search quantity': Buffer;
    } = {};
    dataContent['Full Byte'] = bufferExplained['Data Content'];
    dataContent['Device ID'] = bufferExplained['Data Content'].subarray(0, 4);
    dataContent['Device version and type'] = bufferExplained['Data Content'].subarray(4, 6);
    dataContent['Position the shortest transmission period'] = bufferExplained[
      'Data Content'
    ].subarray(6, 7);
    dataContent['Sports assistance function swtich'] = bufferExplained['Data Content'].subarray(
      7,
      8
    );
    dataContent['Beacon search timeout'] = bufferExplained['Data Content'].subarray(8, 9);
    dataContent['Beacon search quantity'] = bufferExplained['Data Content'].subarray(9, 10);
    bufferExplained['Data Content'] = dataContent;
  }

  if (Buffer.compare(Buffer.from(bufferExplained['Message Type']), Buffer.from([0x05])) === 0) {
    let dataContent: {
      'Full Byte': Buffer;
      'Device ID': Buffer;
      'Number of Beacons': Buffer;
      'Physical Activity Flag': Buffer;
      Major: Buffer;
      Minor: Buffer;
      Distance: Buffer;
      'Battery Level': Buffer;
      'Remaining Beacon Info': Buffer;
    } = {} as any;

    const content = bufferExplained['Data Content'];

    // --- slice individual fields per spec ---
    dataContent['Full Byte'] = content;
    dataContent['Device ID'] = content.subarray(0, 4);
    dataContent['Number of Beacons'] = content.subarray(4, 5);
    dataContent['Physical Activity Flag'] = content.subarray(5, 6);
    dataContent['Major'] = content.subarray(6, 8);
    dataContent['Minor'] = content.subarray(8, 10);
    dataContent['Distance'] = content.subarray(10, 12);
    dataContent['Battery Level'] = content.subarray(12, 13);
    dataContent['Remaining Beacon Info'] = content.subarray(13); // optional / variable length

    bufferExplained['Data Content'] = dataContent;
  }

  // 0x03 — Device status report
  if (Buffer.compare(Buffer.from(bufferExplained['Message Type']), Buffer.from([0x03])) === 0) {
    type Status03 = {
      'Full Byte': Buffer;
      'UID of RFID': Buffer; // 4B
      'Device Abnormal': Buffer; // 1B (0x00/0x01/… per spec)
      'Battery Level': Buffer; // 1B (0–100)
      'Configuration File Version': Buffer; // 1B (0x00 per doc)
      Reservation: Buffer; // 2B
    };

    const content = bufferExplained['Data Content'];
    const dataContent: Status03 = {
      'Full Byte': content,
      'UID of RFID': content.subarray(0, 4),
      'Device Abnormal': content.subarray(4, 5),
      'Battery Level': content.subarray(5, 6),
      'Configuration File Version': content.subarray(6, 7),
      Reservation: content.subarray(7, 9),
    };

    bufferExplained['Data Content'] = dataContent;
  }

  console.log('(Decode) Buffer Explained:', bufferExplained);

  /*

Buffer Explained: {
  'Frame Header': <Buffer ff ee>,
  'Equipment cluster coding': <Buffer 51>,
  'Message Number': <Buffer 00 6f>,
  'ACK Flag': <Buffer 6f>,
  'Message Type': <Buffer 01>,
  'Data Content': {
    'Full Byte': <Buffer 01 20 b2 40 29 02 01 05 01 01 04 00>,
    'Device ID': <Buffer 01 20 b2 40>,
    'Device version and type': <Buffer 29 02>,
    'Position the shortest transmission period': <Buffer 01>,
    'Sports assistance function swtich': <Buffer 05>,
    'Beacon search timeout': <Buffer 01>,
    'Beacon search quantity': <Buffer 01>
  },
  'CRC Check': <Buffer 01 4a>,
  'Frame End': <Buffer ee ff>
}
New Buffer Response: <Buffer 01 20 b2 40 01 29 02 00 01 01 00 00>
  */

  let newBufferResponse = {};
  if (Buffer.compare(Buffer.from(bufferExplained['Message Type']), Buffer.from([0x01])) === 0) {
    newBufferResponse = Buffer.concat([
      bufferExplained['Data Content']['Device ID'], // Device Id of the target device
      Buffer.from([0x01]), // Registration Result
      bufferExplained['Data Content']['Device version and type'], // Device Version Type
      Buffer.from([0x00]), // Configure the shortest transmission period
      Buffer.from([0x01]), // Enable the motion assistance function configuration
      Buffer.from([0x01]), // Set Beacon search timeout
      Buffer.from([0x00]), // COnfigure the number of beacons searches
      Buffer.from([0x00]), // Reservation
    ]);
  }

  console.log('New Buffer Response:', newBufferResponse);
  return {
    dataBase64,
    bufferExplained,
    newBufferResponse,
  };
};

// console.log('Payload D (utf8): ', D.toString('utf8')); // if it's text

// --- optional: verify HMAC if you have the timestamp from the push ---
// if (Number.isFinite(timestampMs)) {
//   const F = Buffer.concat([D, tsToBE8(timestampMs)]);
//   console.log('HMAC F: ', F);
//   const Cprime = crypto.createHmac('sha256', signKey).update(F).digest();
//   console.log('Cprime: ', Cprime);
//   console.log('HMAC match:', crypto.timingSafeEqual(C, Cprime));
// } else {
//   console.log('Skipping HMAC verify (no timestamp provided).');
// }

// const wordArray = CryptoJS.AES.decrypt(dataBase64, CryptoJS.enc.Hex.parse(secretKeyHex), {
//   mode: CryptoJS.mode.ECB,
//   padding: CryptoJS.pad.Pkcs7,
// });
// const rs = wordArray.toString();
// console.log('Decrypt: ', rs);

// const secretKeyClient = 'A60C3263B832E551EEBDDDB93D8B05EA';
// const signTokenClient = '3E3D4BEE7FE182D8';
// const testData = '/6z9lMvtyrg6YQTv2thcrSG36SmIzil+F7bTvdk6rd6eSaEM9g6/uhblvcUj9SFE';
// decodeData(testData, 'A60C3263B832E551EEBDDDB93D8B05EA', '3E3D4BEE7FE182D8');

function checksum16(data: number[]) {
  let sum = 0;
  for (let byte of data) {
    sum += byte;
  }
  sum = (sum >> 16) + (sum & 0xffff);
  sum += sum >> 16;
  return sum & 0xffff;
}
export { decodeData, checksum16 };