<?php

declare(strict_types=1);

namespace App\Analytics;

/**
 * The day's numbers, computed from readings.
 *
 * Pure: rows in, numbers out, no database and no clock. That is what makes the
 * milestone's actual requirement testable, which is not correctness but
 * determinism: the same rows must always give the same answer.
 *
 * Two definitions are worth stating rather than burying, because both are places
 * where a plausible-looking invention could hide.
 *
 * **Resting pulse is the fifth percentile of the day's pulses.** The obvious
 * alternative is "the average pulse while still", which needs a motion threshold
 * that nobody has established for this device, and a threshold picked to make the
 * output look right is exactly the kind of number this project refuses to invent.
 * A percentile needs no threshold and is reproducible by anyone.
 *
 * **Variability uses the textbook definitions**, RMSSD and SDNN, and nothing
 * further. Successive differences are only taken between intervals known to be
 * adjacent in time, because a difference taken across a gap is not a beat-to-beat
 * difference and would inflate RMSSD without saying so.
 *
 * **RMSSD mostly comes back null, and that is the honest answer.** Two
 * corrections got it there. Computed across a whole day it read near 290 ms on
 * real data, roughly triple anything physiological, because a day contains both
 * resting and exercising; windowing to five minutes fixed that. What windowing
 * exposed is the real problem: the band reports about one interval per second
 * while a heart beats rather faster, so what arrives is a subsample of the beat
 * series, not the series. Differences taken across that subsample are not
 * beat-to-beat differences however close together the records sit.
 *
 * So a difference is only counted between intervals from the same record, where
 * adjacency is a fact rather than an assumption. Most days carry about one
 * interval per record, so most days report no RMSSD at all. A missing number
 * that could be trusted beats a present one that could not.
 *
 * `interval_coverage` is reported alongside so the sparsity is visible rather
 * than inferred from an absence.
 *
 * SDNN keeps its daily scope. It is the dispersion of the intervals themselves
 * and needs no adjacency, so subsampling weakens it without invalidating it.
 */
final class DailySummary
{
    /** Bumped when a definition changes, so old rows are never mistaken for new. */
    public const METHOD = 'within-record-rmssd-v3';

    /**
     * Seconds per variability window. RMSSD is a short-term measure by
     * definition, and the five-minute window is the long-standing convention in
     * the literature.
     */
    private const WINDOW_SECONDS = 300;

    /** Below this many differences a window's RMSSD is noise, not a measurement. */
    private const MINIMUM_DIFFERENCES = 20;

    /**
     * @param  list<array{pulse: int|null, intervals: list<int>, second: int, steps: int|null,
     *                    temperature: float|null, motion: float|null}> $readings
     * @return array<string, int|float|null>
     */
    public static function of(array $readings): array
    {
        $pulses = [];
        $temperatures = [];
        $motions = [];

        foreach ($readings as $reading) {
            // A pulse of zero is the band reporting nothing, not a heart rate.
            if (($reading['pulse'] ?? 0) > 0) {
                $pulses[] = (int) $reading['pulse'];
            }
            if (($reading['temperature'] ?? 0) > 0) {
                $temperatures[] = (float) $reading['temperature'];
            }
            if ($reading['motion'] !== null) {
                $motions[] = (float) $reading['motion'];
            }
        }

        $intervals = self::successiveIntervals($readings);

        return [
            'samples' => count($readings),
            'interval_count' => count($intervals['all']),
            'interval_coverage' => $readings === []
                ? null
                : round(count($intervals['all']) / count($readings), 3),
            'pulse_min' => $pulses === [] ? null : min($pulses),
            'pulse_max' => $pulses === [] ? null : max($pulses),
            'pulse_avg' => $pulses === [] ? null : round(array_sum($pulses) / count($pulses), 2),
            'resting_pulse' => self::percentile($pulses, 0.05),
            'rmssd' => self::windowedRmssd($intervals['windows']),
            'sdnn' => self::sdnn($intervals['all']),
            'steps' => self::steps($readings),
            'temperature_min' => $temperatures === [] ? null : round(min($temperatures), 2),
            'temperature_max' => $temperatures === [] ? null : round(max($temperatures), 2),
            'temperature_avg' => $temperatures === [] ? null : round(array_sum($temperatures) / count($temperatures), 2),
            'motion_avg' => $motions === [] ? null : round(array_sum($motions) / count($motions), 4),
        ];
    }

    /**
     * The median of the day's window RMSSD values.
     *
     * A median rather than a mean, so one restless window cannot drag the day.
     *
     * @param array<int, list<int>> $windows successive differences, keyed by window
     */
    private static function windowedRmssd(array $windows): ?float
    {
        $values = [];

        ksort($windows);
        foreach ($windows as $differences) {
            if (count($differences) < self::MINIMUM_DIFFERENCES) {
                continue;
            }

            $rmssd = self::rmssd($differences);
            if ($rmssd !== null) {
                $values[] = $rmssd;
            }
        }

        if ($values === []) {
            return null;
        }

        sort($values);
        $middle = (int) floor((count($values) - 1) / 2);

        return round($values[$middle], 2);
    }

    /**
     * Intervals, and the pairs of them that are genuinely adjacent.
     *
     * Two intervals are adjacent if they came from the same record, or from
     * records one second apart. Anything else has a gap between it, and a
     * difference measured across a gap is not a beat-to-beat difference.
     *
     * @param  list<array{intervals: list<int>, second: int}> $readings
     * @return array{all: list<int>, windows: array<int, list<int>>}
     */
    private static function successiveIntervals(array $readings): array
    {
        $all = [];
        $windows = [];

        $previousSecond = null;
        $previousInterval = null;

        foreach ($readings as $reading) {
            $second = (int) $reading['second'];

            foreach ($reading['intervals'] as $index => $interval) {
                $interval = (int) $interval;

                // Physiologically impossible values are damage, not data.
                if ($interval < 250 || $interval > 3000) {
                    $previousInterval = null;
                    continue;
                }

                $all[] = $interval;

                // Same record only. Two intervals in one record are genuinely
                // consecutive beats; two in neighbouring records are separated
                // by however many beats the band did not report.
                $adjacent = $previousInterval !== null && $index > 0;

                if ($adjacent) {
                    $window = intdiv($second, self::WINDOW_SECONDS);
                    $windows[$window][] = abs($interval - $previousInterval);
                }

                $previousInterval = $interval;
                $previousSecond = $second;
            }
        }

        return ['all' => $all, 'windows' => $windows];
    }

    /** Root mean square of successive differences, in milliseconds. */
    private static function rmssd(array $differences): ?float
    {
        if (count($differences) < 2) {
            return null;
        }

        $squares = array_map(static fn (int $d): float => $d ** 2, $differences);

        return round(sqrt(array_sum($squares) / count($squares)), 2);
    }

    /** Standard deviation of the intervals themselves, in milliseconds. */
    private static function sdnn(array $intervals): ?float
    {
        if (count($intervals) < 2) {
            return null;
        }

        $mean = array_sum($intervals) / count($intervals);
        $variance = array_sum(array_map(
            static fn (int $value): float => ($value - $mean) ** 2,
            $intervals,
        )) / (count($intervals) - 1);

        return round(sqrt($variance), 2);
    }

    /**
     * Steps as the sum of positive differences.
     *
     * The counter is cumulative and wraps, so the value itself means nothing and
     * only the differences do. A negative difference is a wrap, not a walk
     * backwards, and contributes nothing rather than a guess at the wrap point.
     *
     * @param  list<array{steps: int|null}> $readings
     */
    private static function steps(array $readings): ?int
    {
        $total = 0;
        $previous = null;
        $seen = false;

        foreach ($readings as $reading) {
            $value = $reading['steps'];
            if ($value === null) {
                continue;
            }

            $seen = true;
            if ($previous !== null && $value > $previous) {
                $total += $value - $previous;
            }
            $previous = (int) $value;
        }

        return $seen ? $total : null;
    }

    /** @param list<int> $values */
    private static function percentile(array $values, float $fraction): ?int
    {
        if ($values === []) {
            return null;
        }

        sort($values);
        $index = (int) floor($fraction * (count($values) - 1));

        return $values[$index];
    }
}
