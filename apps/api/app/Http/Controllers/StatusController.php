<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

/**
 * What the archive holds.
 *
 * Includes the counts that are easy to leave out and awkward to admit: frames
 * this build could not decode, and the fact that nothing here is Verified. A
 * dashboard that only reports successes is not reporting.
 */
final class StatusController extends Controller
{
    public function __invoke(): JsonResponse
    {
        $frames = DB::table('raw_frames')->selectRaw(
            'count(*) as total,
             count(*) filter (where decode_error is not null) as undecodable,
             max(received_at) as last_received'
        )->first();

        $readings = DB::table('readings')->selectRaw(
            'count(*) as total,
             min(recorded_at) as first_recorded,
             max(recorded_at) as last_recorded,
             count(distinct date(recorded_at)) as days'
        )->first();

        $layouts = DB::table('readings')
            ->select('layout_version', DB::raw('count(*) as total'))
            ->groupBy('layout_version')
            ->orderBy('layout_version')
            ->get();

        return response()->json([
            'frames' => [
                'total' => (int) ($frames->total ?? 0),
                'undecodable' => (int) ($frames->undecodable ?? 0),
                'last_received' => $frames->last_received ?? null,
            ],
            'readings' => [
                'total' => (int) ($readings->total ?? 0),
                'days' => (int) ($readings->days ?? 0),
                'first_recorded' => $readings->first_recorded ?? null,
                'last_recorded' => $readings->last_recorded ?? null,
            ],
            'layouts' => $layouts,
            // Stated by the API, not just in the documentation, so a consumer
            // cannot present these numbers as validated by accident.
            'evidence' => 'documented',
        ]);
    }
}
