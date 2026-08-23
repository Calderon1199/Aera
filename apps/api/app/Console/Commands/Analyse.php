<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Jobs\ComputeDailyMetrics;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Compute daily metrics. Safe to run repeatedly, by design.
 */
final class Analyse extends Command
{
    protected $signature = 'aera:analyse {--day= : One day, as YYYY-MM-DD} {--sync : Run now instead of queueing}';

    protected $description = 'Compute daily metrics from stored readings';

    public function handle(): int
    {
        $days = $this->option('day') !== null
            ? [(string) $this->option('day')]
            : DB::table('readings')->selectRaw('date(recorded_at) as day')->distinct()->pluck('day')->all();

        if ($days === []) {
            $this->warn('No readings to analyse.');

            return self::SUCCESS;
        }

        foreach ($days as $day) {
            $job = new ComputeDailyMetrics((string) $day);
            $this->option('sync') ? $job->handle() : dispatch($job);
        }

        $this->info(sprintf(
            '%d day%s %s.',
            count($days),
            count($days) === 1 ? '' : 's',
            $this->option('sync') ? 'computed' : 'queued',
        ));

        return self::SUCCESS;
    }
}
