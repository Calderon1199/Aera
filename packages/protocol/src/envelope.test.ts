/**
 * FIXTURES ARE SYNTHETIC. Frames here are built by src/testing/synthetic.ts from
 * the layout in docs/PROTOCOL.md, not captured from a device. They prove the
 * decoder reads the positions the specification states. They prove nothing about
 * what any firmware actually writes.
 */

import { deepStrictEqual, strictEqual } from 'node:assert/strict';
import { describe, it } from 'node:test';

import { decodeBodyHeader, decodeEnvelope, frameLengthOf } from './envelope.ts';
import { buildFrame, concat } from './testing/synthetic.ts';

describe('decodeEnvelope', () => {
  it('reads every header field of a well-formed frame', () => {
    const bytes = buildFrame({
      revision: 0x07,
      routing: [0x11, 0x22],
      kind: 0x30,
      variant: 0x31,
      opcode: 0x32,
      data: [0xde, 0xad],
      headerChecksum: 0xbeef,
      bodyChecksum: 0x01020304,
    });

    const result = decodeEnvelope(bytes);
    if (!result.ok) throw new Error(`expected a frame, got ${result.error.kind}`);
    const { envelope } = result;

    strictEqual(envelope.revision, 0x07);
    deepStrictEqual([...envelope.routing], [0x11, 0x22]);
    strictEqual(envelope.headerChecksum, 0xbeef);
    strictEqual(envelope.bodyChecksum, 0x01020304);
    deepStrictEqual([...envelope.body], [0x30, 0x31, 0x32, 0xde, 0xad]);
    strictEqual(envelope.declaredLength, 9);
    strictEqual(envelope.frameLength, bytes.length);
  });

  it('exposes exactly the six bytes the header checksum covers', () => {
    const bytes = buildFrame({ revision: 0x07, routing: [0x11, 0x22] });
    const result = decodeEnvelope(bytes);
    if (!result.ok) throw new Error('expected a frame');

    deepStrictEqual([...result.envelope.headerChecksummed], [...bytes.subarray(0, 6)]);
  });

  it('keeps a body checksum with the top bit set unsigned', () => {
    const result = decodeEnvelope(buildFrame({ bodyChecksum: 0xfedcba98 }));
    if (!result.ok) throw new Error('expected a frame');

    strictEqual(result.envelope.bodyChecksum, 0xfedcba98);
    strictEqual(result.envelope.bodyChecksum > 0, true);
  });

  it('rejects input that does not start with the marker', () => {
    const result = decodeEnvelope(Uint8Array.from([0x55, 0x01, 0x07, 0x00]));
    if (result.ok) throw new Error('expected a rejection');

    strictEqual(result.error.kind, 'not-a-frame');
  });

  it('reports how many bytes a truncated header still needs', () => {
    const result = decodeEnvelope(buildFrame().subarray(0, 5));
    if (result.ok) throw new Error('expected a rejection');
    if (result.error.kind !== 'incomplete') throw new Error(result.error.kind);

    strictEqual(result.error.have, 5);
    strictEqual(result.error.need, 8);
  });

  it('reports how many bytes a truncated body still needs', () => {
    const bytes = buildFrame({ data: [1, 2, 3, 4] });
    const result = decodeEnvelope(bytes.subarray(0, bytes.length - 3));
    if (result.ok) throw new Error('expected a rejection');
    if (result.error.kind !== 'incomplete') throw new Error(result.error.kind);

    strictEqual(result.error.need, bytes.length);
  });

  it('rejects a declared length too small to describe a frame', () => {
    const result = decodeEnvelope(buildFrame({ declaredLength: 3 }));
    if (result.ok) throw new Error('expected a rejection');

    strictEqual(result.error.kind, 'implausible-length');
  });

  it('ignores bytes beyond the frame it decodes', () => {
    const frame = buildFrame({ data: [0xaa, 0xbb] });
    const result = decodeEnvelope(concat(frame, Uint8Array.from([0xaa, 0x99, 0x00])));
    if (!result.ok) throw new Error('expected a frame');

    strictEqual(result.envelope.frameLength, frame.length);
    deepStrictEqual([...result.envelope.body.subarray(3)], [0xaa, 0xbb]);
  });

  it('decodes a frame that starts partway into a buffer', () => {
    const frame = buildFrame({ revision: 0x42 });
    const result = decodeEnvelope(concat(Uint8Array.from([0x00, 0xff]), frame), 2);
    if (!result.ok) throw new Error('expected a frame');

    strictEqual(result.envelope.revision, 0x42);
  });

  it('treats an empty buffer as incomplete rather than corrupt', () => {
    const result = decodeEnvelope(new Uint8Array(0));
    if (result.ok) throw new Error('expected a rejection');

    strictEqual(result.error.kind, 'incomplete');
  });
});

describe('frameLengthOf', () => {
  it('adds the header the declared length excludes', () => {
    strictEqual(frameLengthOf(9), 17);
  });
});

describe('decodeBodyHeader', () => {
  it('splits the routing triple from the payload', () => {
    const result = decodeEnvelope(buildFrame({ kind: 1, variant: 2, opcode: 3, data: [9, 8] }));
    if (!result.ok) throw new Error('expected a frame');

    const header = decodeBodyHeader(result.envelope.body);
    strictEqual(header?.kind, 1);
    strictEqual(header?.variant, 2);
    strictEqual(header?.opcode, 3);
    deepStrictEqual([...(header?.data ?? [])], [9, 8]);
  });

  it('returns undefined for a body too short to carry one', () => {
    strictEqual(decodeBodyHeader(Uint8Array.from([1, 2])), undefined);
  });
});
