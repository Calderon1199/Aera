/**
 * FIXTURES ARE SYNTHETIC. Records here are built by src/testing/synthetic.ts at
 * the offsets spec.ts states, then read back. That is a real test of one thing
 * only: that the decoder reads the positions the specification gives it.
 *
 * It is not evidence that the specification is right about firmware. Those
 * offsets come from prior community work whose correlations rest on a single
 * overnight capture of one sleeping subject, and no device has been near this
 * code. Treating a synthetic fixture as evidence about firmware is how you end
 * up chasing bugs that do not exist.
 */

import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict';
import { describe, it } from 'node:test';

import { decodeEnvelope } from './envelope.ts';
import { decodeHistoryRecord, findImplausibilities, type HistoryRecord } from './record.ts';
import { HISTORY_RECORD_LENGTH, INTERBEAT_MAX } from './spec.ts';
import { buildHistoryFrame, type SyntheticRecord } from './testing/synthetic.ts';

function decode(fields: SyntheticRecord = {}): HistoryRecord {
  const frame = decodeEnvelope(buildHistoryFrame(fields));
  if (!frame.ok) throw new Error(`frame does not decode: ${frame.error.kind}`);

  const result = decodeHistoryRecord(frame.envelope);
  if (!result.ok) throw new Error(`record does not decode: ${result.error.kind}`);
  return result.record;
}

describe('decodeHistoryRecord', () => {
  it('reads each named field back from its documented position', () => {
    const record = decode({
      recordIndex: 987_654,
      timestamp: 1_755_000_000,
      pulse: 61,
      stepCounter: 12_345,
      motionMagnitude: 0.25,
    });

    strictEqual(record.version, 18);
    strictEqual(record.recordIndex, 987_654);
    strictEqual(record.timestamp, 1_755_000_000);
    strictEqual(record.pulse, 61);
    strictEqual(record.stepCounter, 12_345);
    ok(Math.abs(record.motionMagnitude - 0.25) < 1e-6);
  });

  it('reads orientation as three floats whose magnitude sits near 1 g', () => {
    const record = decode({ gravity: [0.1, 0.2, 0.97] });
    const magnitude = Math.hypot(record.gravity.x, record.gravity.y, record.gravity.z);

    ok(Math.abs(magnitude - 1) < 0.01, `magnitude was ${magnitude}`);
  });

  it('applies each temperature divisor as documented', () => {
    const record = decode({ skinTemperature: 34.21, auxiliaryTemperatures: [33.5, 35.7] });

    ok(Math.abs(record.skinTemperature - 34.21) < 1e-9);
    deepStrictEqual(record.auxiliaryTemperatures, [33.5, 35.7]);
  });

  it('reads a negative auxiliary temperature as signed', () => {
    const record = decode({ auxiliaryTemperatures: [-4.5, -0.2] });

    deepStrictEqual(record.auxiliaryTemperatures, [-4.5, -0.2]);
  });

  it('reads as many interbeat intervals as the count declares', () => {
    const record = decode({ interbeatIntervals: [880, 902, 915] });

    deepStrictEqual(record.interbeatIntervals, [880, 902, 915]);
  });

  it('clamps an interval count the layout cannot hold', () => {
    const record = decode({ interbeatCount: 200 });

    strictEqual(record.interbeatIntervals.length, INTERBEAT_MAX);
  });

  it('keeps unestablished positions out of the named fields', () => {
    const record = decode({ at: { 82: 97, 81: 0x21, 108: 128 } });

    // Keyed by position and width. No physiological names, so nothing here can
    // be displayed or analysed by mistake.
    strictEqual(record.unverified['u8_82'], 97);
    strictEqual(record.unverified['u8_81'], 0x21);
    strictEqual(record.unverified['u8_108'], 128);
    deepStrictEqual(Object.keys(record).includes('spo2'), false);
    deepStrictEqual(Object.keys(record).includes('sleepState'), false);
  });

  it('names every unverified position by offset and width only', () => {
    const record = decode();

    for (const key of Object.keys(record.unverified)) {
      ok(/^u(8|16|32)_\d+$/.test(key), `${key} is not a position-based name`);
    }
  });

  it('refuses a packet that is not historical data', () => {
    const frame = decodeEnvelope(buildHistoryFrame({ packetKind: 48 }));
    if (!frame.ok) throw new Error('expected a frame');

    const result = decodeHistoryRecord(frame.envelope);
    strictEqual(result.ok, false);
    if (result.ok) return;
    strictEqual(result.error.kind, 'wrong-packet');
  });

  it('refuses a layout version it does not know rather than guessing', () => {
    const frame = decodeEnvelope(buildHistoryFrame({ version: 12 }));
    if (!frame.ok) throw new Error('expected a frame');

    const result = decodeHistoryRecord(frame.envelope);
    strictEqual(result.ok, false);
    if (result.ok) return;
    strictEqual(result.error.kind, 'unknown-version');
    if (result.error.kind !== 'unknown-version') return;
    strictEqual(result.error.version, 12);
  });

  it('refuses a frame too short to hold the layout', () => {
    const frame = decodeEnvelope(buildHistoryFrame({ length: HISTORY_RECORD_LENGTH - 20 }));
    if (!frame.ok) throw new Error('expected a frame');

    const result = decodeHistoryRecord(frame.envelope);
    strictEqual(result.ok, false);
    if (result.ok) return;
    strictEqual(result.error.kind, 'too-short');
  });
});

describe('findImplausibilities', () => {
  it('passes a record that reads correctly', () => {
    deepStrictEqual(findImplausibilities(decode()), []);
  });

  it('catches orientation that cannot be orientation', () => {
    const found = findImplausibilities(decode({ gravity: [12, 40, 3] }));

    strictEqual(found.length, 1);
    strictEqual(found[0]?.field, 'gravity');
  });

  it('catches a pulse outside the range a body produces', () => {
    const found = findImplausibilities(decode({ pulse: 250 }));

    strictEqual(found[0]?.field, 'pulse');
  });

  it('catches an interval no heart beats at', () => {
    const found = findImplausibilities(decode({ interbeatIntervals: [40] }));

    strictEqual(found[0]?.field, 'interbeatIntervals');
  });

  it('treats zero as absent rather than impossible', () => {
    const record = decode({ pulse: 0, skinTemperature: 0, gravity: [0, 0, 0] });

    deepStrictEqual(findImplausibilities(record), []);
  });
});
