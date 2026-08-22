<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Readings bucketed for charting.
 *
 * A day is 86,400 seconds and no chart wants 86,400 points, so aggregation
 * happens in the database rather than in the browser. Minimum and maximum ride
 * along with the mean, because a mean alone hides exactly the excursions a
 * reader is looking for.
 *
 * A pulse of zero means the band reported no reading, not a reading of zero, so
 * those rows are excluded from the pulse aggregate rather than averaged in.
 */
final class SeriesController extends Controller
{
    private const BUCKETS = ['minute', 'hour', 'day'];

    public function __invoke(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'from' => ['required', 'date'],
            'to' => ['required', 'date'],
            'bucket' => ['nullable', 'string'],
        ]);

        $bucket = $validated['bucket'] ?? 'minute';
        if (! in_array($bucket, self::BUCKETS, true)) {
            return response()->json(['message' => 'bucket must be minute, hour or day'], 422);
        }

        $points = DB::table('readings')
            ->selectRaw("date_trunc(?, recorded_at) as at", [$bucket])
            ->selectRaw('avg(pulse) filter (where pulse > 0) as pulse_avg')
            ->selectRaw('min(pulse) filter (where pulse > 0) as pulse_min')
            ->selectRaw('max(pulse) filter (where pulse > 0) as pulse_max')
            ->selectRaw('avg(skin_temperature) filter (where skin_temperature > 0) as temperature_avg')
            ->selectRaw('avg(motion_magnitude) as motion_avg')
            ->selectRaw('max(step_counter) as steps')
            ->selectRaw('count(*) as samples')
            ->where('recorded_at', '>=', $validated['from'])
            ->where('recorded_at', '<=', $validated['to'])
            ->groupByRaw('1')
            ->orderByRaw('1')
            ->limit(5000)
            ->get();

        return response()->json(['bucket' => $bucket, 'points' => $points]);
    }
}
