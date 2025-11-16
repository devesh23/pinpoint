import express from 'express';
import cors from 'cors';
import { loraWANDataEncrypt } from './encode_client.js';
import crypto from 'crypto';
import { decodeData } from './decode.js';
import { checksum16 } from './decode.js';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

const app = express();
dotenv.config();

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET!;
const ACCESS_TTL = process.env.ACCESS_TTL || '10m';
const STATIC_REFRESH = process.env.STATIC_REFRESH_TOKEN!;

// Middleware
app.use(cors());
app.use(express.json());

function broadcast(data: unknown) {
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  for (const { res } of clients.values()) {
    res.write(payload);
  }
}

function logTime() {
  const now = new Date();

  const year = now.getFullYear();
  const month = now.getMonth(); // 0-indexed (0 for January, 11 for December)
  const day = now.getDate();
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const seconds = now.getSeconds();

  console.log(`Time: ${hours}:${minutes}:${seconds}`);
}

const readUWB = async (req, res) => {
  const { body } = req;
  // console.log('---------------- Body --------------');
  console.log(body);
  console.log('Registration Timestamp: ', Date.now());
  logTime();

  const decodedData = decodeData(body.content.data);
  // console.log('---------------- Decoded Data --------------');
  // console.log('Decoded Data:', decodedData.dataBase64);

  // If message type is 0x01, sign, encrypt, and send data to server
  let responseData = {};

  if (decodedData.bufferExplained['Message Type'][0] === 0x01) {
    const apiResponse = await fetch('http://localhost:3001/v1/ecryptSendData', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        data: decodedData,
        timestamp: Date.now(),
        deviceId: body.content.devEui,
        fPort: body.content.fPort,
      }),
    });

    // ✅ Always await and parse JSON safely
    if (!apiResponse.ok) {
      throw new Error(`Server error: ${apiResponse.status}`);
    }

    responseData = await apiResponse.json();
  }
  // If message type is 0x05, convert data content into human readable format
  if ((decodedData.bufferExplained['Message Type'] as Buffer)[0] === 0x05) {
    const content = decodedData.bufferExplained['Data Content'];
    const raw = content['Full Byte']; // <-- your full buffer

    // --- Extract fixed-length header fields ---
    const deviceId = content['Device ID'];
    const numBeacons = content['Number of Beacons'][0];
    const motionFlag = content['Physical Activity Flag'][0];

    // --- Parse the first beacon from named buffers ---
    const major = content['Major'].toString('hex');
    const minor = content['Minor'].toString('hex');
    const beaconId = major + minor;
    const distance = content['Distance'].readUInt16BE(0); // cm
    const battery = content['Battery Level'][0]; // 0–100 %

    const beacons: any[] = [];
    beacons.push({ major, minor, beaconId, distance, battery });

    // --- Handle additional beacons if present ---
    const beaconInfoStart = 6;
    const perBeaconLen = 7;
    for (let i = 1; i < numBeacons; i++) {
      const offset = beaconInfoStart + i * perBeaconLen;
      if (offset + perBeaconLen > raw.length) break;

      beacons.push({
        major: raw.subarray(offset, offset + 2).toString('hex'),
        minor: raw.subarray(offset + 2, offset + 4).toString('hex'),
        beaconId:
          raw.subarray(offset, offset + 2).toString('hex') +
          raw.subarray(offset + 2, offset + 4).toString('hex'),
        distance: raw.readUInt16BE(offset + 4),
        battery: raw.readUInt8(offset + 6),
      });
    }

    // --- Build human-readable object ---
    const humanReadable = {
      deviceIdHex: deviceId.toString('hex'),
      deviceIdDecimal: deviceId.readUInt32BE(0),
      numberOfBeacons: numBeacons,
      motion: motionFlag === 1 ? 'Movement Detected' : 'No Movement',
      beacons,
    };

    console.log('Decoded 0x05 Device Location Report:');
    console.log({
      DeviceID: humanReadable.deviceIdHex,
      Beacons: humanReadable.numberOfBeacons,
      Motion: humanReadable.motion,
    });
    console.table(humanReadable.beacons);
    broadcast({
      type: 'uwb_update',
      payload: { ...humanReadable, requestTimestamp: body.content.timestamp },
      ts: Date.now(),
    });
  }
  console.log('---------------- Downlink Response --------------');
  console.log('Downlink Response:', responseData);

  res.status(200).json({ status: 'success', data: body, downlinkApiResponse: responseData });
};

const encryptSignSendData = async (req, res) => {
  try {
    let { timestamp, data, deviceId, fPort } = req.body;
    // console.log('Timestamp:', timestamp);
    console.log('Downlink Timestamp: ', Date.now());
    console.log('Request: ', req.body);
    // CRC is top-level per your dump
    // let newDataBuffer = makeNewData(data);
    let newDataBuffer = Buffer.concat([
      Buffer.from(data.bufferExplained['Data Content']['Full Byte']).subarray(0, 4),
      Buffer.from([0x01]),
      Buffer.from(data.bufferExplained['Data Content']['Full Byte']).subarray(4),
      Buffer.from([0x01]),
    ]);
    console.log('newDataBuffer:', newDataBuffer);
    const checksumData = Buffer.concat([Buffer.from([0x02]), newDataBuffer]);
    console.log('checksumData:', checksumData);
    const getChecksum = checksum16(Array.from(checksumData));
    console.log('Checksum:', getChecksum);
    const buf = Buffer.alloc(2);
    buf.writeUInt16BE(getChecksum); // ['CRC Check', data.bufferExplained['CRC Check']],
    console.log('getChecksum: ', buf);
    let finalRequestBuffer = Buffer.concat([
      Buffer.from(data.bufferExplained['Frame Header']),
      Buffer.from(data.bufferExplained['Equipment cluster coding']),
      Buffer.from(data.bufferExplained['Message Number']),
      Buffer.from([0x00]),
      Buffer.from([0x02]),
      newDataBuffer,
      buf,
      Buffer.from(data.bufferExplained['Frame End']),
    ]);
    // ['Frame End', data.bufferExplained['Frame End']],
    console.log('Data (buffer, base64): ', finalRequestBuffer);
    let newData = finalRequestBuffer.toString('hex');
    console.log('Data (Hex): ', newData);

    const secretKey = 'A60C3263B832E551EEBDDDB93D8B05EA';
    const signToken = '3E3D4BEE7FE182D8';

    // Build + encrypt LoRaWAN frame
    let testData = loraWANDataEncrypt(timestamp, newData, signToken, secretKey, true, true, true);
    testData = testData.toString();
    console.log('Downlink Data: ', {
      data: testData,
      devEui: deviceId,
      fPort: fPort,
      modeEnum: 'DEFAULT_MODE',
      priority: false,
      timestamp,
      useClassA: true,
    });

    // Send downlink request to LoRaWAN server
    const apiResponse = await fetch('http://18.223.161.233:8090/api2/v1/lorawan/downlink', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        data: testData,
        devEui: deviceId,
        fPort: fPort,
        modeEnum: 'DEFAULT_MODE',
        priority: false,
        timestamp,
        useClassA: true,
      }),
    });

    // const wordArray = CryptoJS.AES.decrypt(testData, CryptoJS.enc.Hex.parse(secretKey), {
    //   mode: CryptoJS.mode.ECB,
    //   padding: CryptoJS.pad.Pkcs7,
    // });
    // const rs = wordArray.toString();
    // console.log('Decrypt: ', rs);

    // ✅ Wait and parse JSON response
    const responseData = await apiResponse.json();

    // Decode
    const decodedData = decodeData(testData, secretKey, signToken);
    //  console.log('Decoded Data: ', decodedData);

    return res.status(200).json({
      status: 'success',
      sentData: testData,
      downlinkResponse: responseData,
    });
  } catch (err) {
    console.error('Error sending LoRaWAN data:', err);
    return res.status(500).json({
      status: 'error',
      message: err.message,
    });
  }
};

const clients = new Map();
const uwbDataStream = (req, res) => {
  // Required SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.(); // if using compression middleware, ensure it's disabled for SSE

  const id = crypto.randomUUID();
  clients.set(id, { id, res });

  // Optional: send a hello/heartbeat immediately
  res.write(`event: hello\n`);
  res.write(`data: ${JSON.stringify({ ok: true, connectedAt: Date.now() })}\n\n`);

  req.on('close', () => {
    clients.delete(id);
  });
};

const verifyAccess = (token: string) => {
  return jwt.verify(token, ACCESS_SECRET);
};

function signAccessToken() {
  return jwt.sign({ valid: true }, ACCESS_SECRET, { expiresIn: ACCESS_TTL });
}

const requireAuth = (req, res, next) => {
  const headers = req.get('authorization');
  const token =
    (headers?.startsWith('Bearer ') ? headers.slice(7) : undefined) ||
    (req.query.token as string | undefined) ||
    (req.cookies?.access_token as string | undefined);

  if (!token) return res.status(401).json({ error: 'Missing access token' });

  try {
    if (verifyAccess(token)) return next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired access token' });
  }
};

const refreshAccessToken = (req, res) => {
  const refreshToken = req.query.refreshToken;
  if (!refreshToken) return res.status(401).json({ error: 'Missing refresh token' });

  if (refreshToken !== STATIC_REFRESH)
    return res.status(401).json({ error: 'Invalid refresh token' });

  const accessToken = signAccessToken();
  res.setHeader('Set-Cookie', `access_token=${accessToken}; HttpOnly; Path=/`);
  res.status(200).json({ accessToken });
};

// Routes
app.post('/v1/uwb', readUWB);
app.post('/v1/ecryptSendData', encryptSignSendData);
app.get('/v1/uwbDataStream', requireAuth, uwbDataStream);
app.get('/v1/auth/refresh', refreshAccessToken);

// Start
app.listen(3001, () => console.log(`🚀 Server running on http://localhost:${3001}`));

/*

01 A0BA3E0129020001010000
FFEE 51 0017 00 02 A0BA3E29 01 02 01 05 01 01 04 00 01 [CRC] EEFF
<Buffer 01 a0 ba 3e 01 29 02 00 01 01 00 00>
*/
