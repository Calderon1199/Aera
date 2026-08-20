<?php

declare(strict_types=1);

/*
 * FIXTURES ARE SYNTHETIC. See tests/Fixtures/frames.php.
 */

use App\Models\RawFrame;
use App\Models\Reading;

/**
 * The second half of the milestone's acceptance line, and the invariant
 * decision record 2 committed to. Raw frames are only a source of truth for as
 * long as this keeps working.
 */
it('rebuilds every decoded row from raw frames alone', function (): void {
    postFrames(['recordA', 'recordB', 'recordC', 'unknownLayout'])->assertStatus(201);

    $before = Reading::query()->orderBy('recorded_at')->get()->map(
        fn (Reading $reading): array => [
            $reading->recorded_at->timestamp,
            $reading->pulse,
            $reading->step_counter,
            $reading->skin_temperature,
        ]
    )->all();

    Reading::query()->delete();
    expect(Reading::count())->toBe(0);

    $this->artisan('aera:rebuild')->assertSuccessful();

    $after = Reading::query()->orderBy('recorded_at')->get()->map(
        fn (Reading $reading): array => [
            $reading->recorded_at->timestamp,
            $reading->pulse,
            $reading->step_counter,
            $reading->skin_temperature,
        ]
    )->all();

    expect($after)->toBe($before)->and($after)->toHaveCount(3);
});

it('rebuilds without needing the collector again', function (): void {
    postFrames(['recordA', 'recordB'])->assertStatus(201);

    // Everything the projection needs is already in the archive, so dropping
    // the decoded rows costs nothing but the time to rebuild them.
    Reading::query()->delete();
    RawFrame::query()->update(['projected_at' => null]);

    $this->artisan('aera:rebuild')->assertSuccessful();

    expect(Reading::count())->toBe(2);
});
