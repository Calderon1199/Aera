<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\Reading;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Reading back what has been decoded.
 *
 * Only named fields are exposed. The `unverified` map is deliberately not
 * returned: nothing whose meaning is unestablished should be reachable by a
 * consumer that might chart it.
 */
final class ReadingController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date'],
            'limit' => ['nullable', 'integer', 'min:1', 'max:5000'],
        ]);

        $readings = Reading::query()
            ->when($validated['from'] ?? null, fn ($query, $from) => $query->where('recorded_at', '>=', $from))
            ->when($validated['to'] ?? null, fn ($query, $to) => $query->where('recorded_at', '<=', $to))
            ->orderBy('recorded_at')
            ->limit((int) ($validated['limit'] ?? 1000))
            ->get([
                'recorded_at', 'pulse', 'interbeat_intervals', 'motion_magnitude',
                'gravity_x', 'gravity_y', 'gravity_z', 'step_counter',
                'skin_temperature', 'layout_version',
            ]);

        return response()->json(['readings' => $readings]);
    }
}
