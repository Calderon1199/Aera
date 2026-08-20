<?php

declare(strict_types=1);

/*
 * FIXTURES ARE SYNTHETIC. See tests/Fixtures/frames.php.
 */

it('returns decoded readings in time order', function (): void {
    postFrames(['recordC', 'recordA', 'recordB'])->assertStatus(201);

    $response = $this->withToken(config('aera.ingest_token'))->getJson('/api/readings');

    $response->assertOk();
    expect(array_column($response->json('readings'), 'pulse'))->toBe([58, 61, 64]);
});

/**
 * Rule 3, enforced at the edge. A position whose meaning is not established
 * must not be reachable by anything that might chart it.
 */
it('never exposes unverified positions', function (): void {
    postFrames(['recordA'])->assertStatus(201);

    $reading = $this->withToken(config('aera.ingest_token'))
        ->getJson('/api/readings')->json('readings.0');

    expect($reading)->not->toHaveKey('unverified')
        ->and(json_encode($reading))->not->toContain('u8_82');
});

it('filters by time window', function (): void {
    postFrames(['recordA', 'recordB', 'recordC'])->assertStatus(201);

    // Encoded: an unescaped + in a query string is read as a space, and the
    // date then fails validation rather than filtering anything.
    $response = $this->withToken(config('aera.ingest_token'))
        ->getJson('/api/readings?from='.urlencode(gmdate('c', 1755000001)));

    $response->assertOk();
    expect($response->json('readings'))->toHaveCount(2);
});
