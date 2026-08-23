<?php

declare(strict_types=1);

/*
 * FIXTURES ARE SYNTHETIC. See tests/Fixtures/frames.php. The three record
 * fixtures sit one second apart, which is what makes bucket boundaries
 * observable at all.
 */

it('buckets readings and reports the spread, not just the mean', function (): void {
    postFrames(['recordA', 'recordB', 'recordC'])->assertStatus(201);

    $response = $this->withToken(config('aera.ingest_token'))
        ->getJson('/api/series?from=2025-08-12T00:00:00Z&to=2025-08-13T00:00:00Z&bucket=hour');

    $response->assertOk()->assertJsonPath('bucket', 'hour');

    $point = $response->json('points.0');
    expect((int) $point['samples'])->toBe(3)
        ->and((int) $point['pulse_min'])->toBe(58)
        ->and((int) $point['pulse_max'])->toBe(64)
        ->and(round((float) $point['pulse_avg']))->toBe(61.0);
});

/**
 * A pulse of zero means the band reported nothing, not a heart rate of zero.
 * Averaging it in would drag every bucket toward a number nobody's heart did.
 */
it('leaves absent pulses out of the average rather than counting them as zero', function (): void {
    postFrames(['recordA', 'recordB'])->assertStatus(201);

    \App\Models\Reading::query()->orderBy('recorded_at')->first()->update(['pulse' => 0]);

    $point = $this->withToken(config('aera.ingest_token'))
        ->getJson('/api/series?from=2025-08-12T00:00:00Z&to=2025-08-13T00:00:00Z&bucket=hour')
        ->json('points.0');

    // Only the surviving reading counts toward the pulse, though both are still
    // samples of the window.
    expect((int) $point['samples'])->toBe(2)
        ->and((int) $point['pulse_min'])->toBe(61)
        ->and(round((float) $point['pulse_avg']))->toBe(61.0);
});

it('separates buckets by the resolution asked for', function (): void {
    postFrames(['recordA', 'recordB', 'recordC'])->assertStatus(201);

    $minutes = $this->withToken(config('aera.ingest_token'))
        ->getJson('/api/series?from=2025-08-12T00:00:00Z&to=2025-08-13T00:00:00Z&bucket=minute')
        ->json('points');

    $days = $this->withToken(config('aera.ingest_token'))
        ->getJson('/api/series?from=2025-08-12T00:00:00Z&to=2025-08-13T00:00:00Z&bucket=day')
        ->json('points');

    expect($days)->toHaveCount(1)->and(count($minutes))->toBeGreaterThanOrEqual(1);
});

it('refuses a bucket it does not understand', function (): void {
    $this->withToken(config('aera.ingest_token'))
        ->getJson('/api/series?from=2025-08-12T00:00:00Z&to=2025-08-13T00:00:00Z&bucket=fortnight')
        ->assertStatus(422);
});

it('requires a window', function (): void {
    $this->withToken(config('aera.ingest_token'))->getJson('/api/series')->assertStatus(422);
});

it('returns nothing for a window with no readings', function (): void {
    postFrames(['recordA'])->assertStatus(201);

    $this->withToken(config('aera.ingest_token'))
        ->getJson('/api/series?from=2001-01-01T00:00:00Z&to=2001-01-02T00:00:00Z&bucket=hour')
        ->assertOk()
        ->assertJsonCount(0, 'points');
});
