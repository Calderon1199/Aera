<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Analytics\DailySummary;
use App\Models\DailyMetric;
use Illuminate\Http\JsonResponse;

/**
 * Derived metrics.
 *
 * Labelled as estimates in the payload, and the method that produced them is
 * returned alongside. A consumer that charts these without saying so is doing it
 * against the API's own description of itself.
 */
final class MetricController extends Controller
{
    public function __invoke(): JsonResponse
    {
        return response()->json([
            'method' => DailySummary::METHOD,
            'evidence' => 'estimate',
            'note' => 'Derived from fields that are documented, not verified. Treat as provisional.',
            'days' => DailyMetric::query()->orderBy('day')->get(),
        ]);
    }
}
