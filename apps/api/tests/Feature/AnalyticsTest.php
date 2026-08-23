<?php

declare(strict_types=1);

/*
 * FIXTURES ARE SYNTHETIC. See tests/Fixtures/frames.php.
 */

use App\Models\DailyMetric;
use App\Models\Reading;

/**
 * The milestone's acceptance line: metrics are reproducible from stored data,
 * and re-running over the same window is deterministic.
 */
it('produces the same numbers when run again over the same readings', function (): void {
    postFrames(['recordA', 'recordB', 'recordC'])->assertStatus(201);

    $this->artisan('aera:analyse --sync')->assertSuccessful();
    $first = DailyMetric::query()->first()->only([
        'samples', 'interval_count', 'pulse_min', 'pulse_avg', 'pulse_max',
        'resting_pulse', 'rmssd', 'sdnn', 'steps', 'temperature_avg', 'motion_avg',
    ]);

    $this->artisan('aera:analyse --sync')->assertSuccessful();
    $second = DailyMetric::query()->first()->only(array_keys($first));

    expect($second)->toBe($first)
        // Upserted, not appended: a rerun must not multiply rows.
        ->and(DailyMetric::query()->count())->toBe(1);
});

it('computes a day from stored readings alone', function (): void {
    postFrames(['recordA', 'recordB', 'recordC'])->assertStatus(201);
    $this->artisan('aera:analyse --sync')->assertSuccessful();

    $metric = DailyMetric::query()->first();

    expect($metric->samples)->toBe(3)
        ->and($metric->pulse_min)->toBe(58)
        ->and($metric->pulse_max)->toBe(64)
        ->and($metric->interval_count)->toBe(6)
        ->and($metric->method)->toBe(App\Analytics\DailySummary::METHOD);
});

it('drops a day whose readings have gone', function (): void {
    postFrames(['recordA'])->assertStatus(201);
    $this->artisan('aera:analyse --sync')->assertSuccessful();
    expect(DailyMetric::query()->count())->toBe(1);

    // Metrics are an interpretation of readings. With the readings gone there is
    // nothing left to interpret, and a stale row would outlive its evidence.
    Reading::query()->delete();
    $this->artisan('aera:analyse --day=2025-08-12 --sync')->assertSuccessful();

    expect(DailyMetric::query()->count())->toBe(0);
});

it('serves metrics labelled as estimates', function (): void {
    postFrames(['recordA', 'recordB'])->assertStatus(201);
    $this->artisan('aera:analyse --sync')->assertSuccessful();

    $this->withToken(config('aera.ingest_token'))
        ->getJson('/api/metrics')
        ->assertOk()
        ->assertJsonPath('evidence', 'estimate')
        ->assertJsonPath('method', App\Analytics\DailySummary::METHOD)
        ->assertJsonCount(1, 'days');
});

it('says nothing rather than something when there is nothing to analyse', function (): void {
    $this->artisan('aera:analyse --sync')->assertSuccessful();

    expect(DailyMetric::query()->count())->toBe(0);
});
