<?php

declare(strict_types=1);

/*
 * NO DEVICE DATA. These are constructed inputs with answers worked out by hand,
 * so they test the definitions rather than the data.
 */

use App\Analytics\DailySummary;

function reading(array $overrides = []): array
{
    return [
        'pulse' => 60,
        'intervals' => [],
        'second' => 1_755_000_000,
        'steps' => null,
        'temperature' => null,
        'motion' => null,
        ...$overrides,
    ];
}

it('takes resting pulse as the fifth percentile, needing no invented threshold', function (): void {
    // Twenty readings, 50 to 69. The fifth percentile lands on the lowest.
    $readings = [];
    for ($pulse = 50; $pulse < 70; $pulse++) {
        $readings[] = reading(['pulse' => $pulse]);
    }

    expect(DailySummary::of($readings)['resting_pulse'])->toBe(50);
});

it('treats a zero pulse as absent rather than as a heart rate of zero', function (): void {
    $summary = DailySummary::of([
        reading(['pulse' => 0]),
        reading(['pulse' => 60]),
        reading(['pulse' => 62]),
    ]);

    expect($summary['pulse_min'])->toBe(60)->and($summary['pulse_avg'])->toBe(61.0);
});

/**
 * RMSSD by hand, from intervals the band reported together. Twenty-five
 * intervals in one record alternating 800 and 810 ms give twenty-four
 * successive differences of exactly 10, so the root mean square is 10.
 */
it('computes RMSSD from intervals reported together', function (): void {
    $intervals = [];
    for ($i = 0; $i < 25; $i++) {
        $intervals[] = $i % 2 === 0 ? 800 : 810;
    }

    expect(DailySummary::of([reading(['intervals' => $intervals])])['rmssd'])->toBe(10.0);
});

/**
 * The correction that mattered most, and the one that removed a number rather
 * than fixing it. The band reports roughly one interval per second against a
 * faster heartbeat, so intervals in neighbouring records are separated by beats
 * it never sent. Differencing them produced 290 ms on real data, triple anything
 * physiological. A missing number that can be trusted beats a present one that
 * cannot.
 */
it('refuses to difference intervals from different records', function (): void {
    $readings = [];
    for ($i = 0; $i < 40; $i++) {
        $readings[] = reading([
            'intervals' => [$i % 2 === 0 ? 800 : 810],
            'second' => 1_755_000_000 + $i,
        ]);
    }

    $summary = DailySummary::of($readings);

    expect($summary['rmssd'])->toBeNull()
        ->and($summary['interval_count'])->toBe(40)
        // The sparsity is reported rather than left to be inferred from a null.
        ->and($summary['interval_coverage'])->toBe(1.0);
});

it('reports no variability rather than a number built from too few beats', function (): void {
    expect(DailySummary::of([reading(['intervals' => [800, 810, 790]])])['rmssd'])->toBeNull();
});

it('computes SDNN as the sample standard deviation', function (): void {
    // 800, 810, 790: mean 800, sample variance 100, so SDNN is 10.
    expect(DailySummary::of([reading(['intervals' => [800, 810, 790]])])['sdnn'])->toBe(10.0);
});

/**
 * The one that keeps RMSSD honest. A difference measured across a gap in time is
 * not a beat-to-beat difference, and counting it would inflate variability
 * without saying so.
 */
it('refuses to difference intervals separated by a gap', function (): void {
    $far = DailySummary::of([
        reading(['intervals' => [800], 'second' => 1_000]),
        reading(['intervals' => [1200], 'second' => 9_999]),
    ]);

    $adjacent = DailySummary::of([
        reading(['intervals' => [800], 'second' => 1_000]),
        reading(['intervals' => [1200], 'second' => 1_001]),
    ]);

    expect($far['rmssd'])->toBeNull()
        ->and($far['interval_count'])->toBe(2)
        ->and($adjacent['rmssd'])->toBeNull(); // one difference is still too few
});

it('discards intervals no heart produces', function (): void {
    $summary = DailySummary::of([reading(['intervals' => [800, 40, 810]])]);

    expect($summary['interval_count'])->toBe(2);
});

it('counts steps as positive differences, so a wrap is not a walk backwards', function (): void {
    $summary = DailySummary::of([
        reading(['steps' => 100]),
        reading(['steps' => 140]),
        reading(['steps' => 5]),   // wrapped
        reading(['steps' => 25]),
    ]);

    expect($summary['steps'])->toBe(60);
});

it('returns nulls rather than zeroes when a day has nothing to measure', function (): void {
    $summary = DailySummary::of([reading(['pulse' => 0])]);

    expect($summary['pulse_avg'])->toBeNull()
        ->and($summary['resting_pulse'])->toBeNull()
        ->and($summary['rmssd'])->toBeNull()
        ->and($summary['samples'])->toBe(1);
});

/** The milestone's actual requirement. */
it('is deterministic', function (): void {
    $readings = [
        reading(['pulse' => 58, 'intervals' => [900, 890], 'steps' => 10, 'temperature' => 34.2, 'motion' => 0.02]),
        reading(['pulse' => 61, 'intervals' => [880], 'second' => 1_755_000_001, 'steps' => 14, 'temperature' => 34.4, 'motion' => 0.05]),
    ];

    expect(DailySummary::of($readings))->toBe(DailySummary::of($readings));
});
