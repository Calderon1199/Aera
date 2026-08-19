/**
 * FIXTURES ARE SYNTHETIC. Frames here are built by src/testing/synthetic.ts from
 * the layout in docs/PROTOCOL.md, not captured from a device. What these tests
 * establish is that the reassembler survives fragmentation, interleaving and
 * damage. They establish nothing about the byte patterns real firmware emits.
 */

import { deepStrictEqual, strictEqual } from 'node:assert/strict';
import { describe, it } from 'node:test';

import { FrameStream } from './stream.ts';
import { buildFrame, concat } from './testing/synthetic.ts';

const bodyOf = (frame: { body: Uint8Array }): number[] => [...frame.body];

describe('FrameStream', () => {
  it('emits a frame that arrives whole', () => {
    const stream = new FrameStream();
    const frames = stream.push(buildFrame({ opcode: 0x09 }));

    strictEqual(frames.length, 1);
    strictEqual(frames[0]?.body[2], 0x09);
    strictEqual(stream.pendingBytes, 0);
  });

  it('emits nothing until the last byte of a fragmented frame arrives', () => {
    const bytes = buildFrame({ data: [1, 2, 3, 4, 5, 6] });
    const stream = new FrameStream();
    const emitted = [];

    for (const byte of bytes) {
      emitted.push(...stream.push(Uint8Array.from([byte])));
    }

    strictEqual(emitted.length, 1);
    deepStrictEqual(bodyOf(emitted[0]!), [0x02, 0x03, 0x04, 1, 2, 3, 4, 5, 6]);
    strictEqual(stream.pendingBytes, 0);
  });

  it('splits several frames arriving in one notification', () => {
    const stream = new FrameStream();
    const frames = stream.push(
      concat(buildFrame({ opcode: 1 }), buildFrame({ opcode: 2 }), buildFrame({ opcode: 3 })),
    );

    deepStrictEqual(
      frames.map((frame) => frame.body[2]),
      [1, 2, 3],
    );
  });

  it('carries a frame split across a notification boundary', () => {
    const both = concat(buildFrame({ opcode: 1, data: [0xa1] }), buildFrame({ opcode: 2 }));
    const stream = new FrameStream();

    const first = stream.push(both.subarray(0, both.length - 4));
    strictEqual(first.length, 1);
    strictEqual(stream.pendingBytes > 0, true);

    const second = stream.push(both.subarray(both.length - 4));
    strictEqual(second.length, 1);
    strictEqual(second[0]?.body[2], 2);
  });

  it('discards leading noise and still decodes the frame behind it', () => {
    const stream = new FrameStream();
    const frames = stream.push(concat(Uint8Array.from([0x00, 0x13, 0x55]), buildFrame()));

    strictEqual(frames.length, 1);
    strictEqual(stream.stats.bytesDiscarded, 3);
  });

  it('resynchronises past a frame claiming an impossible length', () => {
    const stream = new FrameStream();
    const frames = stream.push(concat(buildFrame({ declaredLength: 2 }), buildFrame({ opcode: 0x7f })));

    strictEqual(frames.length, 1);
    strictEqual(frames[0]?.body[2], 0x7f);
    strictEqual(stream.stats.bytesDiscarded > 0, true);
  });

  it('keeps payload bytes that happen to equal the marker', () => {
    const stream = new FrameStream();
    const frames = stream.push(buildFrame({ data: [0xaa, 0xaa, 0xaa] }));

    strictEqual(frames.length, 1);
    deepStrictEqual(bodyOf(frames[0]!), [0x02, 0x03, 0x04, 0xaa, 0xaa, 0xaa]);
  });

  it('holds a trailing partial frame rather than discarding it', () => {
    const bytes = buildFrame();
    const stream = new FrameStream();

    strictEqual(stream.push(bytes.subarray(0, 4)).length, 0);
    strictEqual(stream.pendingBytes, 4);
    strictEqual(stream.stats.bytesDiscarded, 0);
  });

  it('drops the partial frame on reset', () => {
    const bytes = buildFrame();
    const stream = new FrameStream();

    stream.push(bytes.subarray(0, 4));
    stream.reset();
    strictEqual(stream.pendingBytes, 0);
    strictEqual(stream.push(bytes.subarray(4)).length, 0);
  });

  /**
   * The marker alone cannot identify a frame start: this stream carries a
   * payload byte equal to it, followed by bytes that read as a large length. An
   * unguarded reader parks on that forever and loses every frame behind it,
   * which is what this decoder did before the checksum variant was identified.
   */
  it('recovers the frame after a false marker inside a payload', () => {
    const stream = new FrameStream();
    const frames = stream.push(
      concat(
        buildFrame({ declaredLength: 2, data: [0xaa, 0xaa, 0x0d, 0xf0] }),
        buildFrame({ opcode: 0x7f }),
      ),
    );

    strictEqual(frames.length, 1);
    strictEqual(frames[0]?.body[2], 0x7f);
  });

  it('accepts a confirmed frame that is still arriving, without rescanning', () => {
    const bytes = buildFrame({ data: [1, 2, 3, 4] });
    const stream = new FrameStream();

    strictEqual(stream.push(bytes.subarray(0, 10)).length, 0);
    strictEqual(stream.stats.falseStartsRejected, 0);
    strictEqual(stream.push(bytes.subarray(10)).length, 1);
  });

  it('rejects a frame whose header checksum does not match', () => {
    const stream = new FrameStream();
    const frames = stream.push(buildFrame({ headerChecksum: 0x0000 }));

    strictEqual(frames.length, 0);
    strictEqual(stream.stats.falseStartsRejected, 1);
  });

  it('counts what it has emitted', () => {
    const stream = new FrameStream();
    stream.push(concat(buildFrame(), buildFrame()));
    stream.push(buildFrame());

    strictEqual(stream.stats.framesEmitted, 3);
  });

  it('leaves emitted frames intact when later chunks arrive', () => {
    const stream = new FrameStream();
    const [first] = stream.push(buildFrame({ opcode: 0x11 }));
    stream.push(buildFrame({ opcode: 0x22 }));

    strictEqual(first?.body[2], 0x11);
  });
});
