/**
 * SYNTHETIC. These samples are written by this file to exercise the comparison
 * itself. The comparison only becomes evidence when it is run on real decoded
 * history against a real reference signal, which is what milestone 4 is for.
 */

import { deepStrictEqual, strictEqual } from 'node:assert/strict';
import { describe, it } from 'node:test';

import { compareWithReference, type DecodedSample, type ReferenceSample } from './validation.ts';

const BASE = 1_755_000_000;

/** A run of samples one second apart, following a plausible pulse. */
function series(count: number, at = BASE): { decoded: DecodedSample[]; reference: ReferenceSample[] } {
  const decoded: DecodedSample[] = [];
  const reference: ReferenceSample[] = [];

  for (let index = 0; index < count; index += 1) {
    const bpm = 58 + (index % 7);
    decoded.push({ at: at + index, pulse: bpm });
    reference.push({ at: at + index, bpm });
  }

  return { decoded, reference };
}

describe('compareWithReference', () => {
  it('agrees when every overlapping sample matches', () => {
    const { decoded, reference } = series(40);
    const result = compareWithReference(decoded, reference);

    strictEqual(result.verdict, 'agree');
    strictEqual(result.compared, 40);
    strictEqual(result.agreed, 40);
    deepStrictEqual(result.disagreements, []);
  });

  it('refuses to decide on too little overlap', () => {
    const { decoded, reference } = series(5);
    const result = compareWithReference(decoded, reference);

    strictEqual(result.verdict, 'insufficient-overlap');
    strictEqual(result.compared, 5);
  });

  /**
   * The failure this exists to catch. A pulse read one byte off is still a
   * number in a plausible range, and nothing else in the system can tell.
   */
  it('disagrees when the decoded pulse is wrong, and says where', () => {
    const { decoded, reference } = series(40);
    decoded[10] = { at: decoded[10]!.at, pulse: 137 };

    const result = compareWithReference(decoded, reference);

    strictEqual(result.verdict, 'disagree');
    strictEqual(result.agreed, 39);
    strictEqual(result.disagreements.length, 1);
    strictEqual(result.disagreements[0]?.pulse, 137);
  });

  it('finds a constant clock skew instead of failing everything', () => {
    const { decoded, reference } = series(40);
    const skewed = decoded.map((sample) => ({ at: sample.at - 3, pulse: sample.pulse }));

    const result = compareWithReference(skewed, reference, { searchOffsetSeconds: 10 });

    strictEqual(result.verdict, 'agree');
    strictEqual(result.offsetSeconds, 3);
  });

  it('reports what the comparison looked like without the skew', () => {
    const { decoded, reference } = series(40);
    const skewed = decoded.map((sample) => ({ at: sample.at - 8, pulse: sample.pulse }));

    const result = compareWithReference(skewed, reference, { searchOffsetSeconds: 10 });

    // The offset is disclosed alongside how little agreed without it, so a
    // search cannot quietly manufacture a passing result.
    strictEqual(result.offsetSeconds, 8);
    strictEqual(result.agreedWithoutOffset < result.agreed, true);
  });

  it('prefers no skew when a skew explains nothing extra', () => {
    const { decoded, reference } = series(40);
    const result = compareWithReference(decoded, reference, { searchOffsetSeconds: 5 });

    strictEqual(result.offsetSeconds, 0);
  });

  it('treats a zero pulse as no reading rather than a reading of zero', () => {
    const { decoded, reference } = series(40);
    decoded[3] = { at: decoded[3]!.at, pulse: 0 };

    const result = compareWithReference(decoded, reference);

    strictEqual(result.compared, 39);
    strictEqual(result.verdict, 'agree');
  });

  it('ignores decoded samples the reference never covered', () => {
    const { decoded, reference } = series(40);
    decoded.push({ at: BASE + 5000, pulse: 61 });

    const result = compareWithReference(decoded, reference);

    strictEqual(result.compared, 40);
    strictEqual(result.verdict, 'agree');
  });

  it('pairs each decoded sample with the nearest reference within tolerance', () => {
    const decoded: DecodedSample[] = [{ at: BASE, pulse: 60 }];
    const reference: ReferenceSample[] = [
      { at: BASE - 1, bpm: 71 },
      { at: BASE + 1, bpm: 60 },
    ];

    // Equidistant, so the first wins and the pair disagrees. Deterministic
    // rather than lucky.
    const result = compareWithReference(decoded, reference, { minimumOverlap: 1 });

    strictEqual(result.compared, 1);
    strictEqual(result.verdict, 'disagree');
    strictEqual(result.disagreements[0]?.bpm, 71);
  });
});
