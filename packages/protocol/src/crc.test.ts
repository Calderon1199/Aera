/**
 * NO DEVICE DATA HERE. The vectors below are the published CRC catalogue check
 * values, which are properties of the algorithms and not observations about any
 * device. They verify the engine, not the protocol.
 */

import { deepStrictEqual, strictEqual } from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CRC_CATALOGUE, createCrc, identifyCrc, type CrcName } from './crc.ts';

const CHECK_INPUT = new TextEncoder().encode('123456789');
const names = Object.keys(CRC_CATALOGUE) as CrcName[];

describe('createCrc', () => {
  for (const name of names) {
    it(`reproduces the catalogue check value for ${name}`, () => {
      const parameters = CRC_CATALOGUE[name];
      strictEqual(createCrc(parameters)(CHECK_INPUT), parameters.check);
    });
  }

  it('returns the initial value, less any final xor, for empty input', () => {
    const crc = createCrc(CRC_CATALOGUE['CRC-16/XMODEM']);
    strictEqual(crc(new Uint8Array(0)), 0x0000);
  });

  it('keeps a 32-bit result unsigned', () => {
    const crc = createCrc(CRC_CATALOGUE['CRC-32/BZIP2']);
    const value = crc(CHECK_INPUT);
    strictEqual(value > 0, true);
    strictEqual(value, value >>> 0);
  });

  it('detects a single flipped bit', () => {
    const crc = createCrc(CRC_CATALOGUE['CRC-16/ARC']);
    const clean = Uint8Array.from([0x10, 0x20, 0x30, 0x40]);
    const damaged = Uint8Array.from([0x10, 0x20, 0x31, 0x40]);

    strictEqual(crc(clean) === crc(damaged), false);
  });

  it('is deterministic across calls', () => {
    const crc = createCrc(CRC_CATALOGUE['CRC-16/MODBUS']);
    strictEqual(crc(CHECK_INPUT), crc(CHECK_INPUT));
  });
});

describe('identifyCrc', () => {
  it('names the variant that produced a checksum', () => {
    const parameters = CRC_CATALOGUE['CRC-16/KERMIT'];
    const found = identifyCrc(CHECK_INPUT, parameters.check, 16);

    strictEqual(found.includes('CRC-16/KERMIT'), true);
  });

  it('ignores variants of the wrong width', () => {
    const found = identifyCrc(CHECK_INPUT, CRC_CATALOGUE['CRC-32/ISO-HDLC'].check, 32);

    deepStrictEqual(found, ['CRC-32/ISO-HDLC']);
  });

  it('returns nothing when no catalogue variant fits', () => {
    deepStrictEqual(identifyCrc(CHECK_INPUT, 0x0001, 16), []);
  });
});
