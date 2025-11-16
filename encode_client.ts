import CryptoJS from 'crypto-js';

const long2BytesBE = (value: number) => {
  let bytes = [];
  bytes[7] = value & 0xff;
  bytes[6] = (value / Math.pow(2, 8)) & 0xff;
  bytes[5] = (value / Math.pow(2, 16)) & 0xff;
  bytes[4] = (value / Math.pow(2, 24)) & 0xff;
  bytes[3] = (value / Math.pow(2, 32)) & 0xff;
  bytes[2] = (value / Math.pow(2, 40)) & 0xff;
  bytes[1] = (value / Math.pow(2, 48)) & 0xff;
  bytes[0] = (value / Math.pow(2, 56)) & 0xff;
  return bytes;
};

export const stringToHex = (str: string) => {
  let val = '';
  for (let i = 0; i < str.length; i++) {
    if (val == '') val = str.charCodeAt(i).toString(16);
    else val += str.charCodeAt(i).toString(16);
  }
  return val;
};

export const byteStringToHex = (str: string) => {
  let val = [];
  for (let i = 0; i < str.length; i++) {
    val.push(str.charCodeAt(i).toString(16).padStart(2, '0'));
  }
  return val.join(' ');
};

const hexToString = (hex: string) => {
  let arr = hex.split('');
  let out = '';
  for (let i = 0; i < arr.length / 2; i++) {
    let tmp: any = '0x' + arr[i * 2] + arr[i * 2 + 1];
    let charValue = String.fromCharCode(tmp);
    out += charValue;
  }
  return out;
};
export const bytes2Hex = (bytes: number[]) =>
  bytes.map((r) => r.toString(16).padStart(2, '0')).join('');

export const loraWANDataEncrypt = (
  t: number,
  payload: string,
  signToken: string,
  secretKey: string,
  needSign: boolean,
  encrypt: boolean,
  isHex?: boolean
): any => {
  let nowHex = bytes2Hex(long2BytesBE(t));
  payload = isHex ? payload : stringToHex(payload);
  // console.log('Payload (Hex): ', payload);
  let signData = payload + nowHex;
  let sign = needSign
    ? CryptoJS.HmacSHA256(CryptoJS.enc.Hex.parse(signData), CryptoJS.enc.Hex.parse(signToken))
    : '';
  let encryptData = sign + payload;
  return encrypt
    ? CryptoJS.AES.encrypt(CryptoJS.enc.Hex.parse(encryptData), CryptoJS.enc.Hex.parse(secretKey), {
        mode: CryptoJS.mode.ECB,
        padding: CryptoJS.pad.Pkcs7,
      })
    : CryptoJS.enc.Base64.stringify(CryptoJS.enc.Hex.parse(encryptData));
};
// const signToken = '3BA16CA4D2BE9EB96147779B32182750';
// const secretKey = '7AE4AF8AAD3BD554';
// const timestamp = 1760339389861;

// const secretKey = 'A60C3263B832E551EEBDDDB93D8B05EA';
// const signToken = '3E3D4BEE7FE182D8';
// const timestamp = 1760427417749;

// const testData = loraWANDataEncrypt(timestamp, '02', signToken, secretKey, true, true, false);
// console.log('Encrypted Data:', testData.toString());

// const testDataHex = loraWANDataEncrypt(
//   timestamp,
//   '544f444f',
//   signToken,
//   secretKey,
//   true,
//   true,
//   true
// );
// console.log('Encrypted Data:', testDataHex.toString());

// const testData = loraWANDataEncrypt(timestamp, 'TODO', signToken, secretKey, true, false);
//console.log(testData);
