<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Services\Archive;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Where the collector posts raw frames.
 *
 * It posts frames, not readings. The phone decodes for its own display, but
 * nothing it decodes is authoritative here: the server decodes what it stores,
 * so the archive never depends on a device that may be replaced.
 */
final class IngestController extends Controller
{
    public function __invoke(Request $request, Archive $archive): JsonResponse
    {
        $validated = $request->validate([
            'device_id' => ['nullable', 'string', 'max:128'],
            'batch_token' => ['nullable', 'string'],
            'frames' => ['required', 'array', 'min:1', 'max:5000'],
            'frames.*' => ['required', 'string'],
        ]);

        $frames = [];
        foreach ($validated['frames'] as $index => $encoded) {
            $decoded = base64_decode($encoded, strict: true);

            if ($decoded === false || $decoded === '') {
                return response()->json([
                    'message' => "frames.{$index} is not valid base64",
                ], 422);
            }

            $frames[] = $decoded;
        }

        $token = $validated['batch_token'] ?? null;
        $tokenBytes = null;

        if ($token !== null) {
            $decodedToken = base64_decode($token, strict: true);
            $tokenBytes = $decodedToken === false ? null : $decodedToken;
        }

        $summary = $archive->ingest($frames, $validated['device_id'] ?? null, $tokenBytes);

        return response()->json($summary, 201);
    }
}
