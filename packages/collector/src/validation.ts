/**
 * The cross-check that decides milestone 4, and with it whether any field in
 * this project may ever be called Verified.
 *
 * Decode stored history, read the standard heart-rate characteristic over the
 * same window, and compare where the timestamps overlap. A field read at the
 * wrong offset still produces a number that looks like a pulse. This is the only
 * thing that can tell you it is not one.
 *
 * Two design choices matter here, and both are about not fooling yourself.
 *
 * Agreement must be exact by default. Near enough is how a wrong offset gets
 * waved through, and prior work reported exact agreement, so anything less
 * deserves a look rather than a pass.
 *
 * A clock offset is searched for, but reported rather than absorbed. The band
 * timestamps records from its own clock and the host timestamps the reference
 * from a different one, so a constant skew makes every sample disagree for a
 * reason that has nothing to do with field positions. Finding that skew turns a
 * total failure into a legible one. Hiding it would let a search over offsets
 * manufacture agreement, so the result always carries both the offset used and
 * what the comparison looked like without one.
 */

export type DecodedSample = {
  /** Seconds since the epoch, as written by the band. */
  readonly at: number;
  readonly pulse: number;
};

export type ReferenceSample = {
  /** Seconds since the epoch, as observed by the host. */
  readonly at: number;
  readonly bpm: number;
};

export type Disagreement = {
  readonly at: number;
  readonly pulse: number;
  readonly bpm: number;
};

export type Comparison = {
  /** Pairs that shared a timestamp, within tolerance. */
  readonly compared: number;
  readonly agreed: number;
  readonly disagreements: readonly Disagreement[];
  /** Clock skew applied to the decoded timestamps, in seconds. */
  readonly offsetSeconds: number;
  /** How many pairs agreed with no skew applied, for comparison. */
  readonly agreedWithoutOffset: number;
  readonly verdict: 'agree' | 'disagree' | 'insufficient-overlap';
};

export type CompareOptions = {
  /** Seconds either side of a decoded timestamp to look for a reference sample. */
  readonly toleranceSeconds?: number;
  /** How far to search for a constant clock skew. Zero disables the search. */
  readonly searchOffsetSeconds?: number;
  /** Below this many overlapping pairs, the comparison decides nothing. */
  readonly minimumOverlap?: number;
};

/**
 * Compare decoded history against the reference signal.
 *
 * Returns a verdict rather than a boolean, because "no overlap" is a third
 * outcome and reporting it as failure would be a lie about what was learned.
 */
export function compareWithReference(
  decoded: readonly DecodedSample[],
  reference: readonly ReferenceSample[],
  options: CompareOptions = {},
): Comparison {
  const tolerance = options.toleranceSeconds ?? 1;
  const search = options.searchOffsetSeconds ?? 0;
  const minimum = options.minimumOverlap ?? 30;

  const withoutOffset = matchAt(decoded, reference, 0, tolerance);

  let best = withoutOffset;
  let bestOffset = 0;

  for (let offset = -search; offset <= search; offset += 1) {
    if (offset === 0) continue;

    const attempt = matchAt(decoded, reference, offset, tolerance);
    // Strictly better only. A tie keeps the smaller skew, so a search cannot
    // invent an offset that explains nothing.
    if (attempt.agreed > best.agreed) {
      best = attempt;
      bestOffset = offset;
    }
  }

  return {
    compared: best.compared,
    agreed: best.agreed,
    disagreements: best.disagreements,
    offsetSeconds: bestOffset,
    agreedWithoutOffset: withoutOffset.agreed,
    verdict: verdictOf(best.compared, best.agreed, minimum),
  };
}

function verdictOf(compared: number, agreed: number, minimum: number): Comparison['verdict'] {
  if (compared < minimum) return 'insufficient-overlap';

  return agreed === compared ? 'agree' : 'disagree';
}

type Match = {
  compared: number;
  agreed: number;
  disagreements: Disagreement[];
};

function matchAt(
  decoded: readonly DecodedSample[],
  reference: readonly ReferenceSample[],
  offset: number,
  tolerance: number,
): Match {
  const byTime = [...reference].sort((a, b) => a.at - b.at);
  const result: Match = { compared: 0, agreed: 0, disagreements: [] };

  for (const sample of decoded) {
    // A pulse of zero is the band saying it has no reading, not a reading of
    // zero, so it has nothing to agree or disagree with.
    if (sample.pulse === 0) continue;

    const at = sample.at + offset;
    const nearest = nearestTo(byTime, at, tolerance);
    if (nearest === undefined) continue;

    result.compared += 1;
    if (nearest.bpm === sample.pulse) result.agreed += 1;
    else result.disagreements.push({ at: sample.at, pulse: sample.pulse, bpm: nearest.bpm });
  }

  return result;
}

/** The closest reference sample within tolerance, if there is one. */
function nearestTo(
  sorted: readonly ReferenceSample[],
  at: number,
  tolerance: number,
): ReferenceSample | undefined {
  let best: ReferenceSample | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const sample of sorted) {
    const distance = Math.abs(sample.at - at);
    if (distance > tolerance) continue;

    if (distance < bestDistance) {
      best = sample;
      bestDistance = distance;
    }
  }

  return best;
}
