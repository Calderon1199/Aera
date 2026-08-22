<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\RawFrame;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The raw-frame inspector.
 *
 * This is how a decoding problem gets diagnosed, and it is the only place the
 * archive is visible as what it actually is: bytes the band sent. It also shows
 * that the raw layer genuinely exists rather than being an architectural claim.
 *
 * Frames that failed to decode are the interesting ones, so they can be listed
 * on their own.
 */
final class FrameController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'limit' => ['nullable', 'integer', 'min:1', 'max:200'],
            'only' => ['nullable', 'in:undecodable'],
        ]);

        $frames = RawFrame::query()
            ->when(
                ($validated['only'] ?? null) === 'undecodable',
                fn ($query) => $query->whereNotNull('decode_error'),
            )
            ->orderByDesc('id')
            ->limit((int) ($validated['limit'] ?? 50))
            ->get(['id', 'content_hash', 'device_id', 'received_at', 'decode_error'])
            ->map(fn (RawFrame $frame): array => [
                'id' => $frame->id,
                'content_hash' => substr((string) $frame->content_hash, 0, 16),
                'device_id' => $frame->device_id,
                'received_at' => $frame->received_at,
                'decode_error' => $frame->decode_error,
            ]);

        return response()->json(['frames' => $frames]);
    }

    /** One frame, as bytes and as whatever could be made of them. */
    public function show(int $id): JsonResponse
    {
        $frame = RawFrame::query()
            ->whereKey($id)
            ->selectRaw("id, content_hash, device_id, received_at, decode_error, encode(frame, 'hex') as hex")
            ->first();

        if ($frame === null) {
            return response()->json(['message' => 'no such frame'], 404);
        }

        return response()->json([
            'frame' => [
                'id' => $frame->id,
                'content_hash' => $frame->content_hash,
                'received_at' => $frame->received_at,
                'decode_error' => $frame->decode_error,
                'bytes' => $frame->hex,
                'length' => strlen((string) $frame->hex) / 2,
            ],
            'reading' => $frame->reading()->first(),
        ]);
    }
}
