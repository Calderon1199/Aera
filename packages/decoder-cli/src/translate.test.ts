/**
 * FIXTURES ARE SYNTHETIC, except where a test uses the published opening frame
 * from the decoder's spec. Nothing here came off a device.
 */

import { deepStrictEqual, match, strictEqual } from 'node:assert/strict';
import { describe, it } from 'node:test';

import { bodyChecksum, encodeFrame, headerChecksum, spec } from '@aera/protocol';

import { decodeOne, translate } from './translate.ts';

/** A minimal version 18 record frame, laid out at the offsets spec.ts states. */
function recordFrame(pulse = 57, version = spec.HISTORY_RECORD_VERSION): Uint8Array {
  const bytes = new Uint8Array(spec.HISTORY_RECORD_LENGTH);
  const view = new DataView(bytes.buffer);

  bytes[spec.FRAME.MARKER] = spec.FRAME_MARKER;
  bytes[spec.FRAME.REVISION] = 0x01;
  view.setUint16(spec.FRAME.DECLARED_LENGTH, bytes.length - 8, true);
  bytes[spec.FRAME.BODY] = spec.PACKET_KIND.HISTORICAL_DATA;
  bytes[spec.HISTORY_RECORD.VERSION] = version;
  view.setUint32(spec.HISTORY_RECORD.TIMESTAMP, 1_755_000_000, true);
  view.setUint8(spec.HISTORY_RECORD.PULSE, pulse);
  view.setFloat32(spec.HISTORY_RECORD.GRAVITY_Z, 1, true);

  const bodyEnd = bytes.length - 4;
  view.setUint32(bodyEnd, bodyChecksum(bytes.subarray(spec.FRAME.BODY, bodyEnd)), true);
  view.setUint16(
    spec.FRAME.HEADER_CHECKSUM,
    headerChecksum(bytes.subarray(0, spec.HEADER_CHECKSUMMED_LENGTH)),
    true,
  );
  return bytes;
}

const base64 = (bytes: Uint8Array): string => Buffer.from(bytes).toString('base64');

describe('decodeOne', () => {
  it('returns a decoded record for a valid frame', () => {
    const reply = decodeOne({ id: 'row-1', frame: base64(recordFrame(64)) });

    strictEqual(reply.ok, true);
    if (!reply.ok) return;
    strictEqual(reply.id, 'row-1');
    strictEqual((reply.record as { pulse: number }).pulse, 64);
  });

  it('reports a frame that does not decode, against its id', () => {
    const reply = decodeOne({ id: 'row-2', frame: base64(Uint8Array.from([0x00, 0x01])) });

    strictEqual(reply.ok, false);
    if (reply.ok) return;
    strictEqual(reply.id, 'row-2');
    match(reply.error, /^frame:/);
  });

  it('tells archive corruption apart from a decoder gap', () => {
    const damaged = recordFrame();
    damaged[spec.HISTORY_RECORD.PULSE] = 200;

    const reply = decodeOne({ id: 'row-3', frame: base64(damaged) });
    strictEqual(reply.ok, false);
    if (reply.ok) return;
    match(reply.error, /^checksum:/);
  });

  it('reports an unknown record layout as a decoder gap', () => {
    const reply = decodeOne({ id: 'row-4', frame: base64(recordFrame(57, 99)) });

    strictEqual(reply.ok, false);
    if (reply.ok) return;
    match(reply.error, /^record: unknown-version/);
  });

  it('refuses a frame that is not a history record', () => {
    const command = encodeFrame({ kind: spec.PACKET_KIND.METADATA, variant: 0, opcode: 1 });
    const reply = decodeOne({ id: 'row-5', frame: base64(command) });

    strictEqual(reply.ok, false);
    if (reply.ok) return;
    match(reply.error, /^record: wrong-packet/);
  });
});

describe('translate', () => {
  it('round trips one line', () => {
    const line = JSON.stringify({ id: 'a', frame: base64(recordFrame(70)) });
    const reply = JSON.parse(translate(line) as string) as { ok: boolean; record: { pulse: number } };

    strictEqual(reply.ok, true);
    strictEqual(reply.record.pulse, 70);
  });

  it('skips blank lines rather than answering them', () => {
    strictEqual(translate('   '), undefined);
  });

  it('answers a malformed line instead of throwing', () => {
    const reply = JSON.parse(translate('{not json') as string) as { ok: boolean; error: string };

    strictEqual(reply.ok, false);
    deepStrictEqual(reply.error, 'malformed request line');
  });
});
