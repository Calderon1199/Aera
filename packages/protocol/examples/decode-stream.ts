/**
 * SYNTHETIC. Every byte below is written by this file from the layout in
 * docs/PROTOCOL.md. Nothing here came off a device.
 *
 * Feeds a deliberately hostile byte stream through the reassembler the way a
 * Bluetooth notification handler will: small chunks that ignore frame
 * boundaries, junk on the wire, and one frame that lies about its length.
 *
 *   node packages/protocol/examples/decode-stream.ts
 */

import { FrameStream, decodeBodyHeader, spec } from '@aera/protocol';

const hex = (bytes: Uint8Array): string =>
  [...bytes].map((b) => b.toString(16).padStart(2, '0')).join(' ');

function frame(opts: { revision: number; opcode: number; data: number[]; lie?: number }): Uint8Array {
  const body = Uint8Array.from([0x20, 0x01, opts.opcode, ...opts.data]);
  const declared = opts.lie ?? body.length + 4;
  const bytes = new Uint8Array(8 + body.length + 4);
  const view = new DataView(bytes.buffer);
  bytes[spec.FRAME.MARKER] = spec.FRAME_MARKER;
  bytes[spec.FRAME.REVISION] = opts.revision;
  view.setUint16(spec.FRAME.DECLARED_LENGTH, declared, true);
  view.setUint16(spec.FRAME.HEADER_CHECKSUM, 0x1234, true);
  bytes.set(body, spec.FRAME.BODY);
  view.setUint32(spec.FRAME.BODY + body.length, 0xcafef00d, true);
  return bytes;
}

const wire = Uint8Array.from([
  0x00, 0x13, 0x55, // junk before the first frame
  ...frame({ revision: 1, opcode: 0x41, data: [0x01, 0x02, 0x03, 0x04] }),
  ...frame({ revision: 1, opcode: 0x42, data: [0xaa, 0xaa], lie: 2 }), // lies about its size
  ...frame({ revision: 2, opcode: 0x43, data: [0xde, 0xad, 0xbe, 0xef, 0x99] }),
]);

const MTU = 9; // small enough that no frame survives a single notification
const stream = new FrameStream();

console.log(`\n  ${wire.length} bytes arriving in ${MTU}-byte notifications\n`);

for (let at = 0; at < wire.length; at += MTU) {
  const chunk = wire.subarray(at, at + MTU);
  const frames = stream.push(chunk);

  console.log(`  notification  ${hex(chunk).padEnd(MTU * 3)}  held: ${stream.pendingBytes}`);

  for (const envelope of frames) {
    const body = decodeBodyHeader(envelope.body);
    console.log(`    frame  rev ${envelope.revision}  kind 0x${body?.kind.toString(16)}` +
      `  opcode 0x${body?.opcode.toString(16)}  ${envelope.frameLength} bytes on the wire`);
    console.log(`           payload   ${hex(body?.data ?? new Uint8Array(0)) || '(none)'}`);
    console.log(`           checksums header 0x${envelope.headerChecksum.toString(16)}` +
      `  body 0x${envelope.bodyChecksum.toString(16)}  (extracted, NOT verified)`);
  }
}

const { framesEmitted, bytesDiscarded } = stream.stats;
console.log(`\n  ${framesEmitted} frames recovered, ${bytesDiscarded} bytes discarded, ` +
  `${stream.pendingBytes} still pending\n`);
