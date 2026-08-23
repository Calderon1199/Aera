<?php

declare(strict_types=1);

/*
 * FIXTURES ARE SYNTHETIC. See tests/Fixtures/frames.php.
 */

use App\Models\RawFrame;

it('reports what the archive holds', function (): void {
    postFrames(['recordA', 'recordB', 'recordC'])->assertStatus(201);

    $this->withToken(config('aera.ingest_token'))
        ->getJson('/api/status')
        ->assertOk()
        ->assertJsonPath('frames.total', 3)
        ->assertJsonPath('frames.undecodable', 0)
        ->assertJsonPath('readings.total', 3);
});

it('counts the frames it could not decode rather than hiding them', function (): void {
    postFrames(['recordA', 'unknownLayout'])->assertStatus(201);

    $this->withToken(config('aera.ingest_token'))
        ->getJson('/api/status')
        ->assertOk()
        ->assertJsonPath('frames.total', 2)
        ->assertJsonPath('frames.undecodable', 1)
        ->assertJsonPath('readings.total', 1);
});

/**
 * Rule 3 at the edge of the system. A consumer reading this API must not be
 * able to present these numbers as validated without ignoring what it says.
 */
it('labels its own evidence tier', function (): void {
    $this->withToken(config('aera.ingest_token'))
        ->getJson('/api/status')
        ->assertOk()
        ->assertJsonPath('evidence', 'documented');
});

it('names the day with the most readings, not the newest', function (): void {
    postFrames(['recordA', 'recordB', 'recordC'])->assertStatus(201);

    // One lonely reading on a later day, on its own frame: a frame may only
    // have one reading, which the schema enforces. The busiest day should still
    // win, because opening a dashboard on a day with one point teaches nothing.
    $frame = RawFrame::query()->create([
        'content_hash' => str_repeat('a', 64),
        'frame' => RawFrame::encodeBinary('not a real frame'),
        'received_at' => now(),
    ]);
    $frame->reading()->create([
        'layout_version' => 18,
        'recorded_at' => '2030-01-01T12:00:00Z',
        'unverified' => '{}',
    ]);

    $this->withToken(config('aera.ingest_token'))
        ->getJson('/api/status')
        ->assertOk()
        ->assertJsonPath('readings.busiest_day', '2025-08-12');
});

it('reports which layouts it has seen', function (): void {
    postFrames(['recordA'])->assertStatus(201);

    $this->withToken(config('aera.ingest_token'))
        ->getJson('/api/status')
        ->assertOk()
        ->assertJsonPath('layouts.0.layout_version', 18);
});
