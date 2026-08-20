/**
 * Base64, because the Bluetooth library speaks it and React Native has no
 * Buffer.
 *
 * Small enough to read in one sitting, which is the point: a subtly wrong
 * base64 implementation corrupts frames in ways that look like protocol
 * problems, and this project has enough of those already.
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

const LOOKUP = (() => {
  const table = new Uint8Array(256).fill(255);
  for (let index = 0; index < ALPHABET.length; index += 1) {
    table[ALPHABET.charCodeAt(index)] = index;
  }
  return table;
})();

export function toBase64(bytes: Uint8Array): string {
  let out = '';

  for (let at = 0; at < bytes.length; at += 3) {
    const a = bytes[at] as number;
    const b = bytes[at + 1];
    const c = bytes[at + 2];

    out += ALPHABET[a >> 2];
    out += ALPHABET[((a & 0b11) << 4) | ((b ?? 0) >> 4)];
    out += b === undefined ? '=' : ALPHABET[((b & 0b1111) << 2) | ((c ?? 0) >> 6)];
    out += c === undefined ? '=' : ALPHABET[c & 0b111111];
  }

  return out;
}

export function fromBase64(text: string): Uint8Array {
  const clean = text.replace(/[^A-Za-z0-9+/]/g, '');
  const bytes = new Uint8Array((clean.length * 3) >> 2);

  let out = 0;
  let buffer = 0;
  let bits = 0;

  for (let at = 0; at < clean.length; at += 1) {
    const value = LOOKUP[clean.charCodeAt(at)] as number;
    if (value === 255) continue;

    buffer = (buffer << 6) | value;
    bits += 6;

    if (bits >= 8) {
      bits -= 8;
      bytes[out] = (buffer >> bits) & 0xff;
      out += 1;
    }
  }

  return bytes.subarray(0, out);
}
