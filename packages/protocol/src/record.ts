/**
 * The stored history record.
 *
 * One entry per second, drained from the band's flash. This is the layer where
 * a mistake is most expensive and least visible: a byte read at the wrong offset
 * still produces a number, and that number looks exactly like a measurement.
 *
 * So the split here is deliberate and load-bearing. Fields that prior work
 * validated against an independent reference get names and units. Everything
 * else goes into `unverified`, keyed by position and width rather than by any
 * guess at meaning, where nothing can display it or feed it to analysis by
 * accident. An honest gap beats a plausible lie.
 *
 * Nothing in here is Verified in the sense docs/PROTOCOL.md defines. That word
 * is reserved for a cross-check against the standard heart-rate characteristic
 * on real hardware, which has not happened.
 */

import type { Envelope } from './envelope.ts';
import {
  HISTORY_RECORD,
  HISTORY_RECORD_LENGTH,
  HISTORY_RECORD_UNVERIFIED,
  HISTORY_RECORD_VERSION,
  INTERBEAT_MAX,
  PACKET_KIND,
} from './spec.ts';

export type Gravity = {
  readonly x: number;
  readonly y: number;
  readonly z: number;
};

export type HistoryRecord = {
  readonly version: number;
  /** Lifetime counter written by the device, monotonic across records. */
  readonly recordIndex: number;
  /** Unix seconds, as written by the device rather than observed by the host. */
  readonly timestamp: number;
  /** Beats per minute. */
  readonly pulse: number;
  /** Milliseconds between beats. The input to any variability measure. */
  readonly interbeatIntervals: readonly number[];
  /** Acceleration with gravity removed, in g. */
  readonly motionMagnitude: number;
  /** Orientation in g. Magnitude near 1 when the record is read correctly. */
  readonly gravity: Gravity;
  /** Cumulative and wrapping. Differences are steps; the value is not. */
  readonly stepCounter: number;
  /** Degrees Celsius. The divisor is the whole claim. */
  readonly skinTemperature: number;
  /** Two further temperature channels, degrees Celsius, on a different divisor. */
  readonly auxiliaryTemperatures: readonly [number, number];
  /**
   * Positions whose meaning is not established, keyed by offset and width. Never
   * given a physiological name, never displayed, never fed to analysis.
   */
  readonly unverified: Readonly<Record<string, number>>;
};

export type RecordError =
  | { readonly kind: 'wrong-packet'; readonly packetKind: number }
  | { readonly kind: 'unknown-version'; readonly version: number }
  | { readonly kind: 'too-short'; readonly have: number; readonly need: number };

export type RecordResult =
  | { readonly ok: true; readonly record: HistoryRecord }
  | { readonly ok: false; readonly error: RecordError };

/**
 * Decode one stored record from a verified frame.
 *
 * Gated on the packet kind and then on the version byte, because firmware writes
 * several layouts and decoding one against another's positions produces
 * confident nonsense. An unrecognised version is reported, never guessed at.
 */
export function decodeHistoryRecord(envelope: Envelope): RecordResult {
  const { frame } = envelope;

  const packetKind = frame[8];
  if (packetKind !== PACKET_KIND.HISTORICAL_DATA) {
    return { ok: false, error: { kind: 'wrong-packet', packetKind: packetKind ?? -1 } };
  }

  const version = frame[HISTORY_RECORD.VERSION];
  if (version !== HISTORY_RECORD_VERSION) {
    return { ok: false, error: { kind: 'unknown-version', version: version ?? -1 } };
  }

  if (frame.length < HISTORY_RECORD_LENGTH) {
    return {
      ok: false,
      error: { kind: 'too-short', have: frame.length, need: HISTORY_RECORD_LENGTH },
    };
  }

  const view = new DataView(frame.buffer, frame.byteOffset, frame.length);

  return {
    ok: true,
    record: {
      version,
      recordIndex: view.getUint32(HISTORY_RECORD.RECORD_INDEX, true) >>> 0,
      timestamp: view.getUint32(HISTORY_RECORD.TIMESTAMP, true) >>> 0,
      pulse: view.getUint8(HISTORY_RECORD.PULSE),
      interbeatIntervals: readInterbeatIntervals(view),
      motionMagnitude: view.getFloat32(HISTORY_RECORD.MOTION_MAGNITUDE, true),
      gravity: {
        x: view.getFloat32(HISTORY_RECORD.GRAVITY_X, true),
        y: view.getFloat32(HISTORY_RECORD.GRAVITY_Y, true),
        z: view.getFloat32(HISTORY_RECORD.GRAVITY_Z, true),
      },
      stepCounter: view.getUint16(HISTORY_RECORD.STEP_COUNTER, true),
      skinTemperature: view.getUint16(HISTORY_RECORD.SKIN_TEMPERATURE, true) / 100,
      auxiliaryTemperatures: [
        view.getInt16(HISTORY_RECORD.AUX_TEMPERATURE_1, true) / 10,
        view.getInt16(HISTORY_RECORD.AUX_TEMPERATURE_2, true) / 10,
      ],
      unverified: readUnverified(view),
    },
  };
}

/**
 * The count byte says how many intervals follow. The layout bounds it, so a
 * larger count is damage rather than a longer list, and is clamped instead of
 * being allowed to read into the next field.
 */
function readInterbeatIntervals(view: DataView): number[] {
  const declared = view.getUint8(HISTORY_RECORD.INTERBEAT_COUNT);
  const count = Math.min(declared, INTERBEAT_MAX);

  const intervals: number[] = [];
  for (let index = 0; index < count; index += 1) {
    intervals.push(view.getUint16(HISTORY_RECORD.INTERBEAT_FIRST + index * 2, true));
  }
  return intervals;
}

function readUnverified(view: DataView): Record<string, number> {
  const out: Record<string, number> = {};

  for (const { offset, width } of HISTORY_RECORD_UNVERIFIED) {
    const key = `u${width * 8}_${offset}`;
    if (width === 1) out[key] = view.getUint8(offset);
    else if (width === 2) out[key] = view.getUint16(offset, true);
    else out[key] = view.getUint32(offset, true) >>> 0;
  }

  return out;
}

export type Implausibility = {
  readonly field: string;
  readonly value: number;
  readonly why: string;
};

/**
 * Range gates, as a report rather than a filter.
 *
 * Real data is never dropped for looking odd, because the odd reading might be
 * the real one. What this catches is the failure that matters: a layout that has
 * shifted under a firmware change decodes to numbers that are individually
 * plausible-looking but collectively impossible, and gravity is the sharpest
 * signal of it, since its magnitude has to sit near 1 g whatever the wearer is
 * doing.
 */
export function findImplausibilities(record: HistoryRecord): Implausibility[] {
  const found: Implausibility[] = [];
  const { gravity } = record;
  const magnitude = Math.hypot(gravity.x, gravity.y, gravity.z);

  if (record.pulse !== 0 && (record.pulse < 20 || record.pulse > 240)) {
    found.push({ field: 'pulse', value: record.pulse, why: 'outside 20 to 240 bpm' });
  }

  if (magnitude !== 0 && (magnitude < 0.5 || magnitude > 1.5)) {
    found.push({ field: 'gravity', value: magnitude, why: 'magnitude is not near 1 g' });
  }

  if (record.skinTemperature !== 0 && (record.skinTemperature < 15 || record.skinTemperature > 45)) {
    found.push({
      field: 'skinTemperature',
      value: record.skinTemperature,
      why: 'outside 15 to 45 degrees Celsius',
    });
  }

  for (const interval of record.interbeatIntervals) {
    if (interval !== 0 && (interval < 250 || interval > 3000)) {
      found.push({
        field: 'interbeatIntervals',
        value: interval,
        why: 'outside 250 to 3000 milliseconds',
      });
    }
  }

  return found;
}
