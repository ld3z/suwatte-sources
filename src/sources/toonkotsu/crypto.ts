import { NativeCrypto } from "@suwatte/toolchain";

import { READER_SECRET } from "./constants";
import { ReaderKeyResponse } from "./types";

declare const Crypto: NativeCrypto;

const BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

const asciiBytes = (value: string): Uint8Array =>
  Uint8Array.from(value, (c) => c.charCodeAt(0));

/** Decodes base64 or base64url, with or without padding. */
export function decodeBase64Url(value: string): Uint8Array {
  const clean = value.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  if (
    !/^[A-Za-z0-9+/_-]+={0,2}$/.test(value) ||
    clean.length % 4 === 1 ||
    (value.includes("=") && value.length % 4 !== 0)
  ) {
    throw new Error("Invalid base64 reader data.");
  }
  const bytes = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let buffer = 0;
  let bits = 0;
  let index = 0;
  for (const character of clean) {
    buffer = ((buffer << 6) | BASE64.indexOf(character)) & 0xffffff;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes[index++] = (buffer >> bits) & 0xff;
    }
  }
  if (bits && buffer & ((1 << bits) - 1)) throw new Error("Invalid base64 reader data.");
  return bytes.subarray(0, index);
}

/** Encodes as unpadded base64url. */
export function encodeBase64Url(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const chunk = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    const length = Math.min(3, bytes.length - i) + 1;
    for (let j = 0; j < length; j++) out += BASE64[(chunk >> (18 - j * 6)) & 63];
  }
  return out;
}

const xorCycle = (data: Uint8Array, mask: Uint8Array): Uint8Array =>
  data.map((value, index) => value ^ mask[index % mask.length]);

export function hmacSha256(key: Uint8Array, message: Uint8Array): Uint8Array {
  const block = new Uint8Array(64);
  block.set(key.length > 64 ? Crypto.sha256(key) : key);
  const inner = new Uint8Array(64 + message.length);
  const outer = new Uint8Array(64 + 32);
  for (let i = 0; i < 64; i++) {
    inner[i] = block[i] ^ 0x36;
    outer[i] = block[i] ^ 0x5c;
  }
  inner.set(message, 64);
  outer.set(Crypto.sha256(inner), 64);
  return Crypto.sha256(outer);
}

export interface ReaderKey {
  /** HMAC-SHA256 key that signs chapter requests and unwraps page keys. */
  key: Uint8Array;
  /** Server time minus local time, in milliseconds. */
  offset: number;
}

/** The served key is masked with a digest of the reader secret. */
export function deriveReaderKey(
  response: ReaderKeyResponse,
  secret = READER_SECRET
): ReaderKey {
  const mask = Crypto.sha256(asciiBytes(`sign:${secret}`));
  return {
    key: xorCycle(decodeBase64Url(response.key), mask),
    offset: Number(response.now) - Date.now() || 0,
  };
}

const hmac = (readerKey: ReaderKey, message: string): Uint8Array =>
  hmacSha256(readerKey.key, asciiBytes(message));

const randomBytes = (length: number): Uint8Array =>
  Uint8Array.from({ length }, () => Math.floor(Math.random() * 256));

/** Builds the `x-sig` header for a reader API path. */
export function signReaderPath(readerKey: ReaderKey, path: string): string {
  const time = String(Date.now() + readerKey.offset);
  const nonce = encodeBase64Url(randomBytes(12));
  const signature = encodeBase64Url(hmac(readerKey, `${time}.${nonce}.${path}`));
  return `v1.${time}.${nonce}.${signature.slice(0, 32)}`;
}

/** A "v1" wrapped chapter masks each page key with an HMAC of that page's nonce. */
export function unwrapPageKey(readerKey: ReaderKey, key: string, nonce: string): string {
  return encodeBase64Url(xorCycle(decodeBase64Url(key), hmac(readerKey, `page.${nonce}`)));
}

// ================================ AES-CTR ================================

const SBOX = new Uint8Array(256);
const MIX = [0, 1, 2, 3].map(() => new Uint32Array(256));

{
  const double = Array.from({ length: 256 }, (_, i) => (i < 128 ? i << 1 : (i << 1) ^ 0x11b));
  let x = 0;
  let xi = 0;
  for (let i = 0; i < 256; i++) {
    let sx = xi ^ (xi << 1) ^ (xi << 2) ^ (xi << 3) ^ (xi << 4);
    sx = (sx >>> 8) ^ (sx & 0xff) ^ 0x63;
    SBOX[x] = sx;
    const x2 = double[x];
    const x8 = double[double[x2]];
    const t = (double[sx] * 0x101) ^ (sx * 0x1010100);
    MIX[0][x] = (t << 24) | (t >>> 8);
    MIX[1][x] = (t << 16) | (t >>> 16);
    MIX[2][x] = (t << 8) | (t >>> 24);
    MIX[3][x] = t;
    if (x === 0) {
      x = xi = 1;
    } else {
      x = x2 ^ double[double[double[x8 ^ x2]]];
      xi ^= double[double[xi]];
    }
  }
}

const RCON = [0x00, 0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1b, 0x36];

const subWord = (t: number): number =>
  (SBOX[t >>> 24] << 24) |
  (SBOX[(t >>> 16) & 0xff] << 16) |
  (SBOX[(t >>> 8) & 0xff] << 8) |
  SBOX[t & 0xff];

function expandKey(key: Uint8Array): Uint32Array {
  const words = key.length / 4;
  if (![4, 6, 8].includes(words)) throw new Error(`Unsupported page key length ${key.length}`);
  const schedule = new Uint32Array((words + 7) * 4);
  for (let i = 0; i < schedule.length; i++) {
    if (i < words) {
      schedule[i] =
        (key[i * 4] << 24) | (key[i * 4 + 1] << 16) | (key[i * 4 + 2] << 8) | key[i * 4 + 3];
      continue;
    }
    let t = schedule[i - 1];
    if (i % words === 0) {
      t = subWord((t << 8) | (t >>> 24)) ^ (RCON[i / words] << 24);
    } else if (words > 6 && i % words === 4) {
      t = subWord(t);
    }
    schedule[i] = schedule[i - words] ^ t;
  }
  return schedule;
}

const [M0, M1, M2, M3] = MIX;

function encryptBlock(schedule: Uint32Array, input: Uint32Array, output: Uint32Array): void {
  const rounds = schedule.length / 4 - 1;
  let s0 = input[0] ^ schedule[0];
  let s1 = input[1] ^ schedule[1];
  let s2 = input[2] ^ schedule[2];
  let s3 = input[3] ^ schedule[3];
  let k = 4;
  for (let round = 1; round < rounds; round++) {
    const t0 =
      M0[s0 >>> 24] ^ M1[(s1 >>> 16) & 0xff] ^ M2[(s2 >>> 8) & 0xff] ^ M3[s3 & 0xff] ^ schedule[k++];
    const t1 =
      M0[s1 >>> 24] ^ M1[(s2 >>> 16) & 0xff] ^ M2[(s3 >>> 8) & 0xff] ^ M3[s0 & 0xff] ^ schedule[k++];
    const t2 =
      M0[s2 >>> 24] ^ M1[(s3 >>> 16) & 0xff] ^ M2[(s0 >>> 8) & 0xff] ^ M3[s1 & 0xff] ^ schedule[k++];
    const t3 =
      M0[s3 >>> 24] ^ M1[(s0 >>> 16) & 0xff] ^ M2[(s1 >>> 8) & 0xff] ^ M3[s2 & 0xff] ^ schedule[k++];
    s0 = t0;
    s1 = t1;
    s2 = t2;
    s3 = t3;
  }
  const last = (a: number, b: number, c: number, d: number): number =>
    (SBOX[a >>> 24] << 24) |
    (SBOX[(b >>> 16) & 0xff] << 16) |
    (SBOX[(c >>> 8) & 0xff] << 8) |
    SBOX[d & 0xff];
  output[0] = last(s0, s1, s2, s3) ^ schedule[k++];
  output[1] = last(s1, s2, s3, s0) ^ schedule[k++];
  output[2] = last(s2, s3, s0, s1) ^ schedule[k++];
  output[3] = last(s3, s0, s1, s2) ^ schedule[k];
}

/**
 * Pages are AES-CTR encrypted: the counter block is the first 8 bytes of the
 * page nonce followed by a 64-bit big-endian block counter. Suwatte's native
 * crypto only offers AES-CBC, so the keystream is generated here.
 */
export function decryptPage(data: Uint8Array, key: Uint8Array, nonce: Uint8Array): Uint8Array {
  if (nonce.length < 8) throw new Error("Invalid AES-CTR page nonce: fewer than 8 bytes.");
  const schedule = expandKey(key);
  const bytes = Uint8Array.from(data);
  const counter = new Uint32Array(4);
  const stream = new Uint32Array(4);
  counter[0] = (nonce[0] << 24) | (nonce[1] << 16) | (nonce[2] << 8) | nonce[3];
  counter[1] = (nonce[4] << 24) | (nonce[5] << 16) | (nonce[6] << 8) | nonce[7];
  for (let offset = 0, block = 0; offset < bytes.length; offset += 16, block++) {
    counter[2] = Math.floor(block / 0x100000000);
    counter[3] = block;
    encryptBlock(schedule, counter, stream);
    const end = Math.min(16, bytes.length - offset);
    for (let i = 0; i < end; i++) {
      bytes[offset + i] ^= (stream[i >> 2] >>> (24 - (i & 3) * 8)) & 0xff;
    }
  }
  return bytes;
}
