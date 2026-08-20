<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\RawFrame;
use App\Models\Reading;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Ingest and projection.
 *
 * Two properties hold everything together, and both are tested rather than
 * intended:
 *
 * 1. Posting the same batch twice changes nothing. Frames are content
 *    addressed, so a retry is a no-op.
 * 2. The decoded tables can be dropped and rebuilt from raw alone. Ingest and
 *    rebuild run the same projection, so that path is exercised constantly
 *    rather than only when someone remembers to test it.
 */
final class Archive
{
    public function __construct(private FrameDecoder $decoder)
    {
    }

    /**
     * Store frames, then project them.
     *
     * @param  list<string> $frames raw bytes
     * @return array{received: int, stored: int, duplicates: int, decoded: int, failed: int}
     */
    public function ingest(array $frames, ?string $deviceId = null, ?string $batchToken = null): array
    {
        $received = count($frames);
        $rows = [];

        foreach ($frames as $frame) {
            // Keyed by hash, so a batch that repeats a frame within itself
            // collapses before it reaches the database.
            $rows[RawFrame::hash($frame)] = [
                'content_hash' => RawFrame::hash($frame),
                'frame' => $frame,
                'device_id' => $deviceId,
                'batch_token' => $batchToken,
                'received_at' => Carbon::now(),
            ];
        }

        $stored = 0;
        if ($rows !== []) {
            $stored = DB::table('raw_frames')->insertOrIgnore(array_values($rows));
        }

        $projected = $this->project(
            RawFrame::query()->whereIn('content_hash', array_keys($rows))->whereNull('projected_at')->get()
        );

        return [
            'received' => $received,
            'stored' => $stored,
            'duplicates' => $received - $stored,
            'decoded' => $projected['decoded'],
            'failed' => $projected['failed'],
        ];
    }

    /**
     * Rebuild every decoded row from the archive.
     *
     * This is the invariant decision record 2 committed to. If it stops working,
     * raw frames stop being a source of truth and become merely a backup.
     *
     * @return array{decoded: int, failed: int}
     */
    public function rebuild(): array
    {
        DB::table('readings')->delete();
        DB::table('raw_frames')->update(['projected_at' => null, 'decode_error' => null]);

        $totals = ['decoded' => 0, 'failed' => 0];

        RawFrame::query()->orderBy('id')->chunkById(500, function ($frames) use (&$totals): void {
            $result = $this->project($frames);
            $totals['decoded'] += $result['decoded'];
            $totals['failed'] += $result['failed'];
        });

        return $totals;
    }

    /**
     * @param  iterable<RawFrame> $frames
     * @return array{decoded: int, failed: int}
     */
    public function project(iterable $frames): array
    {
        $bytes = [];
        foreach ($frames as $frame) {
            $bytes[$frame->id] = $frame->frame;
        }

        if ($bytes === []) {
            return ['decoded' => 0, 'failed' => 0];
        }

        $results = $this->decoder->decode($bytes);

        $readings = [];
        $decodedIds = [];
        $failures = [];

        foreach ($results as $id => $result) {
            $id = (int) $id;

            if (! ($result['ok'] ?? false)) {
                $failures[$id] = $result['error'] ?? 'unknown';
                continue;
            }

            $readings[] = $this->toReading($id, $result['record'] ?? []);
            $decodedIds[] = $id;
        }

        DB::transaction(function () use ($readings, $decodedIds, $failures): void {
            if ($readings !== []) {
                Reading::query()->upsert($readings, ['raw_frame_id']);
                RawFrame::query()->whereIn('id', $decodedIds)
                    ->update(['projected_at' => Carbon::now(), 'decode_error' => null]);
            }

            foreach ($failures as $id => $error) {
                RawFrame::query()->whereKey($id)
                    ->update(['projected_at' => Carbon::now(), 'decode_error' => $error]);
            }
        });

        return ['decoded' => count($readings), 'failed' => count($failures)];
    }

    /**
     * @param  array<string, mixed> $record
     * @return array<string, mixed>
     */
    private function toReading(int $rawFrameId, array $record): array
    {
        /** @var array{x: float, y: float, z: float} $gravity */
        $gravity = $record['gravity'] ?? ['x' => null, 'y' => null, 'z' => null];
        /** @var array{0: float, 1: float} $aux */
        $aux = $record['auxiliaryTemperatures'] ?? [null, null];

        return [
            'raw_frame_id' => $rawFrameId,
            'layout_version' => $record['version'],
            'recorded_at' => Carbon::createFromTimestampUTC($record['timestamp']),
            'record_index' => $record['recordIndex'] ?? null,
            'pulse' => $record['pulse'] ?? null,
            'interbeat_intervals' => json_encode($record['interbeatIntervals'] ?? [], JSON_THROW_ON_ERROR),
            'motion_magnitude' => $record['motionMagnitude'] ?? null,
            'gravity_x' => $gravity['x'],
            'gravity_y' => $gravity['y'],
            'gravity_z' => $gravity['z'],
            'step_counter' => $record['stepCounter'] ?? null,
            'skin_temperature' => $record['skinTemperature'] ?? null,
            'aux_temperature_1' => $aux[0] ?? null,
            'aux_temperature_2' => $aux[1] ?? null,
            'unverified' => json_encode($record['unverified'] ?? [], JSON_THROW_ON_ERROR),
        ];
    }
}
