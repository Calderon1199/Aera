<?php

declare(strict_types=1);

namespace App\Jobs;

use App\Analytics\DailySummary;
use App\Models\DailyMetric;
use App\Models\Reading;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Carbon;

/**
 * Recompute one day.
 *
 * Idempotent by construction: it reads stored rows, computes, and upserts on the
 * day. Running it twice over the same readings produces the same row, which is
 * the milestone's actual requirement. Correctness of the metrics is a separate
 * and much harder question, and the project does not claim it.
 */
final class ComputeDailyMetrics implements ShouldQueue
{
    use Queueable;

    public function __construct(public string $day)
    {
    }

    public function handle(): void
    {
        $readings = Reading::query()
            ->whereRaw('date(recorded_at) = ?', [$this->day])
            ->orderBy('recorded_at')
            ->get(['recorded_at', 'pulse', 'interbeat_intervals', 'step_counter', 'skin_temperature', 'motion_magnitude']);

        if ($readings->isEmpty()) {
            DailyMetric::query()->where('day', $this->day)->delete();

            return;
        }

        $summary = DailySummary::of($readings->map(fn (Reading $reading): array => [
            'pulse' => $reading->pulse,
            'intervals' => $reading->interbeat_intervals ?? [],
            'second' => $reading->recorded_at->getTimestamp(),
            'steps' => $reading->step_counter,
            'temperature' => $reading->skin_temperature === null ? null : (float) $reading->skin_temperature,
            'motion' => $reading->motion_magnitude,
        ])->all());

        DailyMetric::query()->updateOrCreate(
            ['day' => $this->day],
            [...$summary, 'method' => DailySummary::METHOD, 'computed_at' => Carbon::now()],
        );
    }
}
