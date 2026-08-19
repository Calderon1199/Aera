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

import { bodyChecksum as signBody, headerChecksum as signHeader } from '../checksums.ts';
import { encodeFrame } from '../encode.ts';
import {
  BODY_CHECKSUM_LENGTH,
  FRAME,
  FRAME_MARKER,
  HEADER_CHECKSUMMED_LENGTH,
  HEADER_LENGTH,
  HISTORY_RECORD,
  HISTORY_RECORD_LENGTH,
  HISTORY_RECORD_VERSION,
  METADATA,
  PACKET_KIND,
  ROUTING_LENGTH,
} from '../spec.ts';

export type SyntheticFrame = {
  readonly revision?: number;
  readonly routing?: readonly number[];
  readonly kind?: number;
  readonly variant?: number;
  readonly opcode?: number;
  readonly data?: readonly number[];
  /** Overrides the real checksum, for testing frames that arrive damaged. */
  readonly headerChecksum?: number;
  /** Overrides the real checksum, for testing frames that arrive damaged. */
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
  } = frame;

  const body = Uint8Array.from([kind, variant, opcode, ...data]);
  const declaredLength = frame.declaredLength ?? body.length + BODY_CHECKSUM_LENGTH;
  const bytes = new Uint8Array(HEADER_LENGTH + body.length + BODY_CHECKSUM_LENGTH);
  const view = new DataView(bytes.buffer);

  bytes[FRAME.MARKER] = FRAME_MARKER;
  bytes[FRAME.REVISION] = revision;
  view.setUint16(FRAME.DECLARED_LENGTH, declaredLength, true);
  bytes.set(routing.slice(0, ROUTING_LENGTH), FRAME.ROUTING);
  bytes.set(body, FRAME.BODY);

  // Real checksums by default, so a synthetic frame is a valid frame. Pass an
  // explicit value to build one that arrives damaged.
  view.setUint16(
    FRAME.HEADER_CHECKSUM,
    frame.headerChecksum ?? signHeader(bytes.subarray(0, HEADER_CHECKSUMMED_LENGTH)),
    true,
  );
  view.setUint32(
    FRAME.BODY + body.length,
    (frame.bodyChecksum ?? signBody(body)) >>> 0,
    true,
  );

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

export type SyntheticRecord = {
  readonly version?: number;
  readonly packetKind?: number;
  readonly recordIndex?: number;
  readonly timestamp?: number;
  readonly pulse?: number;
  readonly interbeatIntervals?: readonly number[];
  /** Written verbatim into the count byte, to build records that lie about it. */
  readonly interbeatCount?: number;
  readonly motionMagnitude?: number;
  readonly gravity?: readonly [number, number, number];
  readonly stepCounter?: number;
  /** Degrees Celsius. Written back through the documented divisor. */
  readonly skinTemperature?: number;
  readonly auxiliaryTemperatures?: readonly [number, number];
  /** Raw bytes at unverified positions, keyed by offset. */
  readonly at?: Readonly<Record<number, number>>;
  /** Truncate the frame, to build a record that cannot hold its own layout. */
  readonly length?: number;
};

/**
 * Build one version 18 history record frame, laid out at the absolute offsets
 * spec.ts states. Synthetic throughout: this proves the decoder reads the
 * positions the specification gives it, and nothing about what firmware writes.
 */
export function buildHistoryFrame(record: SyntheticRecord = {}): Uint8Array {
  const {
    version = HISTORY_RECORD_VERSION,
    packetKind = PACKET_KIND.HISTORICAL_DATA,
    recordIndex = 1,
    timestamp = 1_700_000_000,
    pulse = 58,
    interbeatIntervals = [1000, 1020],
    motionMagnitude = 0.05,
    gravity = [0, 0, 1],
    stepCounter = 4321,
    skinTemperature = 34,
    auxiliaryTemperatures = [33.5, 33.8],
  } = record;

  // A short frame stays internally consistent: it declares the length it
  // actually has, so it is a complete frame that simply cannot hold the layout.
  const bytes = new Uint8Array(record.length ?? HISTORY_RECORD_LENGTH);
  const view = new DataView(bytes.buffer);
  const declaredLength = bytes.length - HEADER_LENGTH;

  bytes[FRAME.MARKER] = FRAME_MARKER;
  bytes[FRAME.REVISION] = 0x01;
  view.setUint16(FRAME.DECLARED_LENGTH, declaredLength, true);

  if (bytes.length > FRAME.BODY) bytes[FRAME.BODY] = packetKind;
  if (bytes.length > HISTORY_RECORD.VERSION) bytes[HISTORY_RECORD.VERSION] = version;

  if (bytes.length >= HISTORY_RECORD_LENGTH) {
    view.setUint32(HISTORY_RECORD.RECORD_INDEX, recordIndex, true);
    view.setUint32(HISTORY_RECORD.TIMESTAMP, timestamp, true);
    view.setUint8(HISTORY_RECORD.PULSE, pulse);
    view.setUint8(HISTORY_RECORD.INTERBEAT_COUNT, record.interbeatCount ?? interbeatIntervals.length);

    interbeatIntervals.forEach((interval, index) => {
      view.setUint16(HISTORY_RECORD.INTERBEAT_FIRST + index * 2, interval, true);
    });

    view.setFloat32(HISTORY_RECORD.MOTION_MAGNITUDE, motionMagnitude, true);
    view.setFloat32(HISTORY_RECORD.GRAVITY_X, gravity[0], true);
    view.setFloat32(HISTORY_RECORD.GRAVITY_Y, gravity[1], true);
    view.setFloat32(HISTORY_RECORD.GRAVITY_Z, gravity[2], true);
    view.setUint16(HISTORY_RECORD.STEP_COUNTER, stepCounter, true);
    view.setUint16(HISTORY_RECORD.SKIN_TEMPERATURE, Math.round(skinTemperature * 100), true);
    view.setInt16(HISTORY_RECORD.AUX_TEMPERATURE_1, Math.round(auxiliaryTemperatures[0] * 10), true);
    view.setInt16(HISTORY_RECORD.AUX_TEMPERATURE_2, Math.round(auxiliaryTemperatures[1] * 10), true);

    for (const [offset, value] of Object.entries(record.at ?? {})) {
      bytes[Number(offset)] = value;
    }

  }

  const bodyEnd = bytes.length - BODY_CHECKSUM_LENGTH;
  if (bodyEnd > FRAME.BODY) {
    view.setUint32(bodyEnd, signBody(bytes.subarray(FRAME.BODY, bodyEnd)), true);
  }

  view.setUint16(
    FRAME.HEADER_CHECKSUM,
    signHeader(bytes.subarray(0, HEADER_CHECKSUMMED_LENGTH)),
    true,
  );

  return bytes;
}

/** A metadata packet, which is how a transfer is bracketed. Synthetic. */
export function buildMetadataFrame(subtype: number, payload: Uint8Array = new Uint8Array(0)): Uint8Array {
  return encodeFrame({ kind: PACKET_KIND.METADATA, variant: 0, opcode: subtype, data: payload });
}

/**
 * A batch-close packet carrying a position token. The token's bytes are
 * arbitrary here, which is the point: the transfer must copy them back without
 * interpreting them.
 */
export function buildBatchClose(token: readonly number[]): Uint8Array {
  return buildMetadataFrame(METADATA.HISTORY_END, Uint8Array.from(token));
}
