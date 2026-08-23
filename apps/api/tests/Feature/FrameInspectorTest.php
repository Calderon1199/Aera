<?php

declare(strict_types=1);

/*
 * FIXTURES ARE SYNTHETIC. See tests/Fixtures/frames.php.
 */

use App\Models\RawFrame;

it('lists frames with their state', function (): void {
    postFrames(['recordA', 'unknownLayout'])->assertStatus(201);

    $frames = $this->withToken(config('aera.ingest_token'))
        ->getJson('/api/frames')->assertOk()->json('frames');

    expect($frames)->toHaveCount(2)
        ->and(collect($frames)->pluck('decode_error')->filter()->count())->toBe(1);
});

it('can list only the frames it refused, which is where the interesting ones are', function (): void {
    postFrames(['recordA', 'recordB', 'unknownLayout'])->assertStatus(201);

    $frames = $this->withToken(config('aera.ingest_token'))
        ->getJson('/api/frames?only=undecodable')->assertOk()->json('frames');

    expect($frames)->toHaveCount(1)
        ->and($frames[0]['decode_error'])->toContain('unknown-version');
});

/**
 * The point of the inspector: the bytes come back exactly as they went in.
 * If this ever diverges, the archive is not an archive.
 */
it('returns a frame byte for byte', function (): void {
    postFrames(['recordA'])->assertStatus(201);

    $sent = base64_decode(frames()['recordA'], strict: true);
    $id = RawFrame::query()->value('id');

    $response = $this->withToken(config('aera.ingest_token'))
        ->getJson("/api/frames/{$id}")->assertOk();

    expect($response->json('frame.bytes'))->toBe(bin2hex($sent))
        ->and($response->json('frame.length'))->toBe(strlen($sent));
});

it('returns the decoded reading alongside the bytes', function (): void {
    postFrames(['recordA'])->assertStatus(201);
    $id = RawFrame::query()->value('id');

    $this->withToken(config('aera.ingest_token'))
        ->getJson("/api/frames/{$id}")
        ->assertOk()
        ->assertJsonPath('reading.pulse', 58);
});

it('explains itself for a frame it could not decode', function (): void {
    postFrames(['unknownLayout'])->assertStatus(201);
    $id = RawFrame::query()->value('id');

    $response = $this->withToken(config('aera.ingest_token'))
        ->getJson("/api/frames/{$id}")->assertOk();

    // The bytes survive regardless, which is the whole argument for keeping them.
    expect($response->json('reading'))->toBeNull()
        ->and($response->json('frame.decode_error'))->toContain('unknown-version')
        ->and(strlen((string) $response->json('frame.bytes')))->toBeGreaterThan(0);
});

it('answers 404 for a frame that does not exist', function (): void {
    $this->withToken(config('aera.ingest_token'))->getJson('/api/frames/999999')->assertStatus(404);
});
