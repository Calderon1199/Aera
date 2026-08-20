<?php

declare(strict_types=1);

namespace App\Services;

use RuntimeException;
use Symfony\Component\Process\Process;

/**
 * Runs the TypeScript decoder.
 *
 * PHP does not decode. Decision record 3 sets out why: the rebuild-from-raw
 * invariant means the server has to decode, and reimplementing the decoder here
 * would put protocol constants in two places, where they drift silently.
 *
 * This is the whole of the boundary. It hands frames to the adapter and takes
 * back results, and it never inspects a byte.
 */
final class FrameDecoder
{
    /** @param list<string> $command */
    public function __construct(
        private array $command,
        private int $chunkSize,
        private int $timeout,
    ) {
    }

    public static function fromConfig(): self
    {
        /** @var list<string> $command */
        $command = config('aera.decoder.command');

        return new self(
            $command,
            (int) config('aera.decoder.chunk'),
            (int) config('aera.decoder.timeout'),
        );
    }

    /**
     * Decode frames, keyed by whatever identifier the caller uses.
     *
     * @param  array<string|int, string> $frames base64 frames, keyed by id
     * @return array<string|int, array{ok: bool, record?: array<string, mixed>, error?: string}>
     */
    public function decode(array $frames): array
    {
        $results = [];

        foreach (array_chunk($frames, $this->chunkSize, preserve_keys: true) as $chunk) {
            foreach ($this->runChunk($chunk) as $id => $result) {
                $results[$id] = $result;
            }
        }

        return $results;
    }

    /**
     * @param  array<string|int, string> $frames
     * @return array<string|int, array{ok: bool, record?: array<string, mixed>, error?: string}>
     */
    private function runChunk(array $frames): array
    {
        $input = '';
        foreach ($frames as $id => $frame) {
            $input .= json_encode([
                'id' => (string) $id,
                'frame' => $frame,
            ], JSON_THROW_ON_ERROR)."\n";
        }

        $process = new Process($this->command);
        $process->setInput($input);
        $process->setTimeout($this->timeout);
        $process->run();

        // A subprocess that fails must be loud. Returning nothing here would
        // look exactly like an archive of frames that all failed to decode,
        // and those are very different problems.
        if (! $process->isSuccessful()) {
            throw new RuntimeException(
                'decoder failed: '.trim($process->getErrorOutput() ?: $process->getOutput())
            );
        }

        $results = [];
        foreach (explode("\n", trim($process->getOutput())) as $line) {
            if ($line === '') {
                continue;
            }

            /** @var array{id: string, ok: bool, record?: array<string, mixed>, error?: string} $reply */
            $reply = json_decode($line, true, flags: JSON_THROW_ON_ERROR);
            $results[$reply['id']] = $reply;
        }

        return $results;
    }
}
