/**
 * Two demonstrations, in order of how much they prove.
 *
 * The first decodes the published opening frame from spec.ts. Nobody on this
 * project chose those bytes, and both of its checksums have to agree, so it is
 * the one thing here that could actually fail.
 *
 * The second feeds a deliberately hostile stream through the reassembler the way
 * a Bluetooth notification handler will: small chunks that ignore frame
 * boundaries, junk on the wire, and a frame that lies about its length. Those
 * bytes are written by this file and prove only that the reader survives them.
 *
 *   npm run example
 */

import {
  FrameStream,
  bodyChecksum,
  decodeBodyHeader,
  decodeEnvelope,
  decodeHistoryRecord,
  findImplausibilities,
  headerChecksum,
  spec,
  verifyEnvelope,
} from '@aera/protocol';

const hex = (bytes: Uint8Array): string =>
  [...bytes].map((b) => b.toString(16).padStart(2, '0')).join(' ');

console.log('\n  THE PUBLISHED OPENING FRAME');
console.log(`  ${hex(spec.OPENING_FRAME)}\n`);

const opening = decodeEnvelope(spec.OPENING_FRAME);
if (!opening.ok) throw new Error(`the opening frame does not decode: ${opening.error.kind}`);

const frame = opening.envelope;
const body = decodeBodyHeader(frame.body);
const verdict = verifyEnvelope(frame);

console.log(`    declared length  ${frame.declaredLength} + 8 header = ${frame.frameLength} bytes, and it is ${spec.OPENING_FRAME.length}`);
console.log(`    header sum       0x${frame.headerChecksum.toString(16)} over ${hex(frame.headerChecksummed)}`);
console.log(`                     ${spec.HEADER_CHECKSUM_VARIANT} computes 0x${headerChecksum(frame.headerChecksummed).toString(16)}`);
console.log(`    body sum         0x${frame.bodyChecksum.toString(16)} over ${hex(frame.body)}`);
console.log(`                     ${spec.BODY_CHECKSUM_VARIANT} computes 0x${bodyChecksum(frame.body).toString(16)}`);
console.log(`    kind 0x${body?.kind.toString(16)}  variant ${body?.variant}  opcode 0x${body?.opcode.toString(16)}`);
console.log(`\n    both checksums agree: ${verdict.ok}`);

function synthetic(opts: { revision: number; opcode: number; data: number[]; lie?: number }): Uint8Array {
  const payload = Uint8Array.from([0x20, 0x01, opts.opcode, ...opts.data]);
  const declared = opts.lie ?? payload.length + 4;
  const bytes = new Uint8Array(8 + payload.length + 4);
  const view = new DataView(bytes.buffer);

  bytes[spec.FRAME.MARKER] = spec.FRAME_MARKER;
  bytes[spec.FRAME.REVISION] = opts.revision;
  view.setUint16(spec.FRAME.DECLARED_LENGTH, declared, true);
  bytes.set(payload, spec.FRAME.BODY);
  view.setUint32(spec.FRAME.BODY + payload.length, bodyChecksum(payload), true);
  view.setUint16(
    spec.FRAME.HEADER_CHECKSUM,
    headerChecksum(bytes.subarray(0, spec.HEADER_CHECKSUMMED_LENGTH)),
    true,
  );
  return bytes;
}

const wire = Uint8Array.from([
  0x00, 0x13, 0x55, // junk before the first frame
  ...synthetic({ revision: 1, opcode: 0x41, data: [0x01, 0x02, 0x03, 0x04] }),
  ...synthetic({ revision: 1, opcode: 0x42, data: [0xaa, 0xaa], lie: 2 }), // lies about its size
  ...synthetic({ revision: 2, opcode: 0x43, data: [0xde, 0xad, 0xbe, 0xef, 0x99] }),
]);

const MTU = 9; // small enough that no frame survives a single notification
const stream = new FrameStream();

console.log(`\n\n  A HOSTILE STREAM, SYNTHETIC`);
console.log(`  ${wire.length} bytes in ${MTU}-byte notifications: junk, then three frames, one malformed\n`);

for (let at = 0; at < wire.length; at += MTU) {
  const chunk = wire.subarray(at, at + MTU);
  const frames = stream.push(chunk);

  console.log(`    ${hex(chunk).padEnd(MTU * 3)}  held: ${stream.pendingBytes}`);

  for (const envelope of frames) {
    const decoded = decodeBodyHeader(envelope.body);
    console.log(`      frame  rev ${envelope.revision}  opcode 0x${decoded?.opcode.toString(16)}` +
      `  payload ${hex(decoded?.data ?? new Uint8Array(0))}  sums ok: ${verifyEnvelope(envelope).ok}`);
  }
}

const { framesEmitted, bytesDiscarded, falseStartsRejected } = stream.stats;
console.log(`\n    ${framesEmitted} of the 2 valid frames recovered, the malformed one discarded`);
console.log(`    ${bytesDiscarded} bytes discarded, ${falseStartsRejected} false starts rejected, ` +
  `${stream.pendingBytes} still pending\n`);


/**
 * A stored record, synthetic, laid out at the offsets spec.ts states. It shows
 * what the decoder produces. It is not evidence about firmware.
 */
function syntheticRecord(shiftBy = 0): Uint8Array {
  const bytes = new Uint8Array(spec.HISTORY_RECORD_LENGTH);
  const view = new DataView(bytes.buffer);
  const at = (offset: number): number => offset + shiftBy;

  bytes[spec.FRAME.MARKER] = spec.FRAME_MARKER;
  bytes[spec.FRAME.REVISION] = 0x01;
  view.setUint16(spec.FRAME.DECLARED_LENGTH, bytes.length - 8, true);
  bytes[spec.FRAME.BODY] = spec.PACKET_KIND.HISTORICAL_DATA;
  bytes[spec.HISTORY_RECORD.VERSION] = spec.HISTORY_RECORD_VERSION;

  view.setUint32(at(spec.HISTORY_RECORD.RECORD_INDEX), 90_210, true);
  view.setUint32(at(spec.HISTORY_RECORD.TIMESTAMP), 1_755_000_000, true);
  view.setUint8(at(spec.HISTORY_RECORD.PULSE), 54);
  view.setUint8(at(spec.HISTORY_RECORD.INTERBEAT_COUNT), 3);
  [1112, 1098, 1121].forEach((rr, index) => {
    view.setUint16(at(spec.HISTORY_RECORD.INTERBEAT_FIRST) + index * 2, rr, true);
  });
  view.setFloat32(at(spec.HISTORY_RECORD.MOTION_MAGNITUDE), 0.03, true);
  view.setFloat32(at(spec.HISTORY_RECORD.GRAVITY_X), -0.07, true);
  view.setFloat32(at(spec.HISTORY_RECORD.GRAVITY_Y), 0.21, true);
  view.setFloat32(at(spec.HISTORY_RECORD.GRAVITY_Z), 0.975, true);
  view.setUint16(at(spec.HISTORY_RECORD.STEP_COUNTER), 8_642, true);
  view.setUint16(at(spec.HISTORY_RECORD.SKIN_TEMPERATURE), 3_412, true);
  view.setInt16(at(spec.HISTORY_RECORD.AUX_TEMPERATURE_1), 335, true);
  view.setInt16(at(spec.HISTORY_RECORD.AUX_TEMPERATURE_2), 338, true);
  bytes[82] = 96;
  bytes[81] = 0x21;

  const bodyEnd = bytes.length - 4;
  view.setUint32(bodyEnd, bodyChecksum(bytes.subarray(spec.FRAME.BODY, bodyEnd)), true);
  view.setUint16(
    spec.FRAME.HEADER_CHECKSUM,
    headerChecksum(bytes.subarray(0, spec.HEADER_CHECKSUMMED_LENGTH)),
    true,
  );
  return bytes;
}

function readRecord(bytes: Uint8Array) {
  const envelope = decodeEnvelope(bytes);
  if (!envelope.ok) throw new Error(`frame does not decode: ${envelope.error.kind}`);
  const result = decodeHistoryRecord(envelope.envelope);
  if (!result.ok) throw new Error(`record does not decode: ${result.error.kind}`);
  return result.record;
}

console.log('\n  A STORED RECORD, SYNTHETIC');

const record = readRecord(syntheticRecord());
const magnitude = Math.hypot(record.gravity.x, record.gravity.y, record.gravity.z);

console.log(`    version ${record.version}   index ${record.recordIndex}   ` +
  `${new Date(record.timestamp * 1000).toISOString()}`);
console.log(`    pulse             ${record.pulse} bpm`);
console.log(`    beat intervals    ${record.interbeatIntervals.join(', ')} ms`);
console.log(`    motion            ${record.motionMagnitude.toFixed(3)} g`);
console.log(`    orientation       ${magnitude.toFixed(3)} g total, which is why it is self-checking`);
console.log(`    steps             ${record.stepCounter} cumulative`);
console.log(`    skin temperature  ${record.skinTemperature} C`);
console.log(`    unverified        ${Object.keys(record.unverified).length} positions carried raw, ` +
  `named by offset: ${Object.keys(record.unverified).slice(0, 4).join(', ')}, ...`);
console.log(`    plausible: ${findImplausibilities(record).length === 0}`);

console.log('\n  THE SAME RECORD, READ TWO BYTES OFF, AS A FIRMWARE CHANGE WOULD');

const shifted = readRecord(syntheticRecord(2));
console.log(`    pulse ${shifted.pulse} bpm, orientation ` +
  `${Math.hypot(shifted.gravity.x, shifted.gravity.y, shifted.gravity.z).toFixed(3)} g total`);
for (const problem of findImplausibilities(shifted)) {
  console.log(`    caught: ${problem.field} ${problem.value.toFixed(3)}, ${problem.why}`);
}
console.log('');
