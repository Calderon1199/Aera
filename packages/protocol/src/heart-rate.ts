/**
 * The standard Bluetooth heart-rate measurement.
 *
 * This is the reference signal the whole evidence model rests on. It is a public
 * SIG profile, unrelated to the vendor protocol, and it works without pairing,
 * so it can be read before anything else in this project works at all.
 *
 * Its job is to disagree. Decode stored history and read this over the same
 * window, and where the timestamps overlap the values must match. A field read
 * at the wrong offset produces a number that looks like a pulse, and this is the
 * only thing that can tell you it is not one.
 */

import { HEART_RATE_FLAGS, INTERVAL_UNITS_PER_SECOND } from './spec.ts';

export type HeartRateMeasurement = {
  /** Beats per minute. */
  readonly bpm: number;
  /**
   * Milliseconds between beats, converted from the 1/1024 second units the
   * characteristic transmits. Present only when the sensor sends them.
   */
  readonly interbeatIntervals: readonly number[];
  /** Kilojoules, when the sensor reports it. */
  readonly energyExpended?: number;
  /**
   * Whether the sensor believes it is on skin. Undefined means the sensor does
   * not support the question, which is different from answering no.
   */
  readonly contact?: boolean;
};

export type HeartRateError =
  | { readonly kind: 'empty' }
  | { readonly kind: 'truncated'; readonly have: number; readonly need: number };

export type HeartRateResult =
  | { readonly ok: true; readonly measurement: HeartRateMeasurement }
  | { readonly ok: false; readonly error: HeartRateError };

/** Decode one notification from the standard heart-rate characteristic. */
export function decodeHeartRate(bytes: Uint8Array): HeartRateResult {
  if (bytes.length < 2) {
    return bytes.length === 0
      ? { ok: false, error: { kind: 'empty' } }
      : { ok: false, error: { kind: 'truncated', have: bytes.length, need: 2 } };
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.length);
  const flags = view.getUint8(0);
  const wide = (flags & HEART_RATE_FLAGS.WIDE_VALUE) !== 0;

  let at = 1;
  const need = wide ? 3 : 2;
  if (bytes.length < need) {
    return { ok: false, error: { kind: 'truncated', have: bytes.length, need } };
  }

  const bpm = wide ? view.getUint16(at, true) : view.getUint8(at);
  at += wide ? 2 : 1;

  let energyExpended: number | undefined;
  if ((flags & HEART_RATE_FLAGS.ENERGY_PRESENT) !== 0) {
    if (bytes.length < at + 2) {
      return { ok: false, error: { kind: 'truncated', have: bytes.length, need: at + 2 } };
    }
    energyExpended = view.getUint16(at, true);
    at += 2;
  }

  const interbeatIntervals: number[] = [];
  if ((flags & HEART_RATE_FLAGS.INTERVALS_PRESENT) !== 0) {
    // Whatever is left is intervals. A trailing odd byte is malformed input
    // rather than half an interval, so it is ignored rather than guessed at.
    for (; at + 2 <= bytes.length; at += 2) {
      const units = view.getUint16(at, true);
      interbeatIntervals.push(Math.round((units * 1000) / INTERVAL_UNITS_PER_SECOND));
    }
  }

  return {
    ok: true,
    measurement: {
      bpm,
      interbeatIntervals,
      ...(energyExpended === undefined ? {} : { energyExpended }),
      ...contactOf(flags),
    },
  };
}

/** Contact is only meaningful when the sensor says it supports reporting it. */
function contactOf(flags: number): { contact?: boolean } {
  if ((flags & HEART_RATE_FLAGS.CONTACT_SUPPORTED) === 0) return {};

  return { contact: (flags & HEART_RATE_FLAGS.CONTACT_DETECTED) !== 0 };
}
