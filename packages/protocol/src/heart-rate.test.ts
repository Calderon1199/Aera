/**
 * VECTORS ARE FROM THE PUBLIC SPECIFICATION, not from a device. The layout of a
 * heart-rate measurement is published by the Bluetooth SIG, so these test the
 * decoder against a standard rather than against an observation.
 */

import { deepStrictEqual, strictEqual } from 'node:assert/strict';
import { describe, it } from 'node:test';

import { decodeHeartRate } from './heart-rate.ts';

const decode = (bytes: number[]) => {
  const result = decodeHeartRate(Uint8Array.from(bytes));
  if (!result.ok) throw new Error(`expected a measurement, got ${result.error.kind}`);
  return result.measurement;
};

describe('decodeHeartRate', () => {
  it('reads an 8-bit rate', () => {
    strictEqual(decode([0x00, 62]).bpm, 62);
  });

  it('reads a 16-bit rate when the flag says so', () => {
    strictEqual(decode([0x01, 0x2c, 0x01]).bpm, 300);
  });

  it('converts beat intervals from 1024ths of a second to milliseconds', () => {
    // 1024 units is exactly one second, 512 is half of one.
    const measurement = decode([0x10, 60, 0x00, 0x04, 0x00, 0x02]);

    deepStrictEqual(measurement.interbeatIntervals, [1000, 500]);
  });

  it('reads energy before intervals when both are present', () => {
    const measurement = decode([0x18, 58, 0x64, 0x00, 0x00, 0x04]);

    strictEqual(measurement.energyExpended, 100);
    deepStrictEqual(measurement.interbeatIntervals, [1000]);
  });

  it('reports contact only when the sensor supports reporting it', () => {
    strictEqual(decode([0x06, 60]).contact, true);
    strictEqual(decode([0x04, 60]).contact, false);
    strictEqual(decode([0x00, 60]).contact, undefined);
  });

  it('ignores a trailing odd byte rather than inventing half an interval', () => {
    const measurement = decode([0x10, 60, 0x00, 0x04, 0x77]);

    deepStrictEqual(measurement.interbeatIntervals, [1000]);
  });

  it('refuses an empty notification', () => {
    const result = decodeHeartRate(new Uint8Array(0));

    strictEqual(result.ok, false);
    if (result.ok) return;
    strictEqual(result.error.kind, 'empty');
  });

  it('refuses a notification too short for the width its flags declare', () => {
    const result = decodeHeartRate(Uint8Array.from([0x01, 0x2c]));

    strictEqual(result.ok, false);
    if (result.ok) return;
    strictEqual(result.error.kind, 'truncated');
  });

  it('refuses a notification claiming energy it does not carry', () => {
    const result = decodeHeartRate(Uint8Array.from([0x08, 60, 0x01]));

    strictEqual(result.ok, false);
  });
});
