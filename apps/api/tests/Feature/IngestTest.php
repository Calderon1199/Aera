<?php

declare(strict_types=1);

/*
 * FIXTURES ARE SYNTHETIC. See tests/Fixtures/frames.php. These tests establish
 * that the archive stores and projects correctly. They establish nothing about
 * what a real band emits.
 */

use App\Models\RawFrame;
use App\Models\Reading;

it('refuses a post without the shared token', function (): void {
    $this->postJson('/api/ingest', ['frames' => [frames()['recordA']]])
        ->assertStatus(401);
});

it('stores raw frames and projects them in one pass', function (): void {
    $response = postFrames(['recordA', 'recordB', 'recordC'], ['device_id' => 'phone-1']);

    $response->assertStatus(201)->assertJson([
        'received' => 3,
        'stored' => 3,
        'duplicates' => 0,
        'decoded' => 3,
        'failed' => 0,
    ]);

    expect(RawFrame::count())->toBe(3)
        ->and(Reading::count())->toBe(3)
        ->and(Reading::query()->orderBy('recorded_at')->pluck('pulse')->all())->toBe([58, 61, 64]);
});

/**
 * The first half of the milestone's acceptance line. A collector that retries
 * after a timeout, or resends a batch it already sent, must not be able to
 * duplicate anything.
 */
it('treats a repeated batch as a no-op', function (): void {
    postFrames(['recordA', 'recordB'])->assertStatus(201);

    $rawAfterFirst = RawFrame::count();
    $readingsAfterFirst = Reading::count();

    postFrames(['recordA', 'recordB'])->assertStatus(201)->assertJson([
        'received' => 2,
        'stored' => 0,
        'duplicates' => 2,
    ]);

    expect(RawFrame::count())->toBe($rawAfterFirst)
        ->and(Reading::count())->toBe($readingsAfterFirst);
});

it('collapses a frame repeated inside one batch', function (): void {
    postFrames(['recordA', 'recordA', 'recordA'])->assertStatus(201);

    expect(RawFrame::count())->toBe(1);
});

it('keeps a frame it cannot decode, and records why', function (): void {
    postFrames(['recordA', 'unknownLayout'])->assertStatus(201)->assertJson([
        'stored' => 2,
        'decoded' => 1,
        'failed' => 1,
    ]);

    // The bytes survive. A layout this build cannot read is a decoder gap, and
    // a later build re-runs the projection over frames already held.
    expect(RawFrame::count())->toBe(2)
        ->and(Reading::count())->toBe(1)
        ->and(RawFrame::query()->whereNotNull('decode_error')->value('decode_error'))
        ->toContain('unknown-version');
});

it('rejects a frame that is not base64', function (): void {
    $this->withToken(config('aera.ingest_token'))
        ->postJson('/api/ingest', ['frames' => ['not base64 at all!!']])
        ->assertStatus(422);
});
