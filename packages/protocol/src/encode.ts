/**
 * Building frames to send.
 *
 * Everything else in this package reads. This writes, and writing is where a
 * mistake reaches the hardware, so there is one guard here that is not a
 * convenience: a command the working agreement excludes cannot be encoded. Not
 * discouraged, not linted against. It throws.
 */

import { bodyChecksum, headerChecksum } from './checksums.ts';
import {
  BODY,
  BODY_CHECKSUM_LENGTH,
  COMMAND,
  FRAME,
  FRAME_MARKER,
  HEADER_CHECKSUMMED_LENGTH,
  HEADER_LENGTH,
  NEVER_SEND,
  PACKET_KIND,
  ROUTING_LENGTH,
} from './spec.ts';

/** The declared length is a u16, so a body cannot exceed what it can describe. */
const MAX_BODY_LENGTH = 0xffff - BODY_CHECKSUM_LENGTH;

export type FrameFields = {
  readonly kind: number;
  readonly variant: number;
  readonly opcode: number;
  readonly data?: Uint8Array;
  readonly revision?: number;
  readonly routing?: Uint8Array;
};

/**
 * Build one frame, checksums included.
 *
 * Refuses to encode any command the working agreement excludes. That list is in
 * spec.ts, and this is the only place it is enforced, because this is the only
 * place bytes are made to be sent.
 */
export function encodeFrame(fields: FrameFields): Uint8Array {
  const { kind, variant, opcode, data = new Uint8Array(0), revision = 0x01 } = fields;

  if (kind === PACKET_KIND.COMMAND) assertSendable(opcode);

  const bodyLength = BODY.DATA + data.length;
  if (bodyLength > MAX_BODY_LENGTH) {
    throw new RangeError(`body of ${bodyLength} bytes exceeds what the declared length can describe`);
  }

  const declaredLength = bodyLength + BODY_CHECKSUM_LENGTH;
  const bytes = new Uint8Array(HEADER_LENGTH + bodyLength + BODY_CHECKSUM_LENGTH);
  const view = new DataView(bytes.buffer);

  bytes[FRAME.MARKER] = FRAME_MARKER;
  bytes[FRAME.REVISION] = revision;
  view.setUint16(FRAME.DECLARED_LENGTH, declaredLength, true);
  if (fields.routing) bytes.set(fields.routing.subarray(0, ROUTING_LENGTH), FRAME.ROUTING);

  bytes[FRAME.BODY + BODY.KIND] = kind;
  bytes[FRAME.BODY + BODY.VARIANT] = variant;
  bytes[FRAME.BODY + BODY.OPCODE] = opcode;
  bytes.set(data, FRAME.BODY + BODY.DATA);

  const bodyEnd = FRAME.BODY + bodyLength;
  view.setUint32(bodyEnd, bodyChecksum(bytes.subarray(FRAME.BODY, bodyEnd)), true);
  view.setUint16(
    FRAME.HEADER_CHECKSUM,
    headerChecksum(bytes.subarray(0, HEADER_CHECKSUMMED_LENGTH)),
    true,
  );

  return bytes;
}

/** Build a command frame. `sequence` is the caller's own counter. */
export function encodeCommand(opcode: number, sequence: number, data?: Uint8Array): Uint8Array {
  return encodeFrame({
    kind: PACKET_KIND.COMMAND,
    variant: sequence & 0xff,
    opcode,
    ...(data ? { data } : {}),
  });
}

/**
 * Throw on any command excluded by design. Firmware writes, cursor resets,
 * shipping mode, gauge resets and update mode are all reachable on this protocol
 * and none of them belongs in a decoding library.
 */
export function assertSendable(opcode: number): void {
  const reason = NEVER_SEND[opcode];
  if (reason !== undefined) {
    throw new Error(`command ${opcode} is excluded by design: ${reason}`);
  }
}

/** Ask the band to begin releasing stored history. */
export function encodeHistoryRequest(sequence: number): Uint8Array {
  return encodeCommand(COMMAND.REQUEST_HISTORY, sequence, Uint8Array.from([0x00]));
}
