/**
 * SYNTHETIC FIXTURES. Every frame this module produces is constructed by this
 * project from the layout in docs/PROTOCOL.md. None of it was captured from a
 * device, and the checksum fields carry whatever value the caller passes, since
 * the real algorithms are not yet known.
 *
 * That makes these frames evidence about this decoder and nothing else. A
 * generated frame is indistinguishable from a captured one once it is bytes, so
 * treating one as proof about firmware sends you chasing bugs that do not exist.
 */

import { BODY_CHECKSUM_LENGTH, FRAME, FRAME_MARKER, HEADER_LENGTH, ROUTING_LENGTH } from '../spec.ts';

export type SyntheticFrame = {
  readonly revision?: number;
  readonly routing?: readonly number[];
  readonly kind?: number;
  readonly variant?: number;
  readonly opcode?: number;
  readonly data?: readonly number[];
  readonly headerChecksum?: number;
  readonly bodyChecksum?: number;
  /** Overrides the computed value, for testing frames that lie about their size. */
  readonly declaredLength?: number;
};

/** Build one well-formed frame, or a deliberately malformed one via overrides. */
export function buildFrame(frame: SyntheticFrame = {}): Uint8Array {
  const {
    revision = 0x01,
    routing = [0x00, 0x00],
    kind = 0x02,
    variant = 0x03,
    opcode = 0x04,
    data = [],
    headerChecksum = 0x0000,
    bodyChecksum = 0x00000000,
  } = frame;

  const body = Uint8Array.from([kind, variant, opcode, ...data]);
  const declaredLength = frame.declaredLength ?? body.length + BODY_CHECKSUM_LENGTH;
  const bytes = new Uint8Array(HEADER_LENGTH + body.length + BODY_CHECKSUM_LENGTH);
  const view = new DataView(bytes.buffer);

  bytes[FRAME.MARKER] = FRAME_MARKER;
  bytes[FRAME.REVISION] = revision;
  view.setUint16(FRAME.DECLARED_LENGTH, declaredLength, true);
  bytes.set(routing.slice(0, ROUTING_LENGTH), FRAME.ROUTING);
  view.setUint16(FRAME.HEADER_CHECKSUM, headerChecksum, true);
  bytes.set(body, FRAME.BODY);
  view.setUint32(FRAME.BODY + body.length, bodyChecksum >>> 0, true);

  return bytes;
}

/** Concatenate byte runs, for building streams of frames and noise. */
export function concat(...runs: readonly Uint8Array[]): Uint8Array {
  const total = runs.reduce((sum, run) => sum + run.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const run of runs) {
    out.set(run, at);
    at += run.length;
  }
  return out;
}
