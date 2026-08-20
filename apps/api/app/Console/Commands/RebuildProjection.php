<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Services\Archive;
use Illuminate\Console\Command;

/**
 * Drop every decoded row and rebuild it from the archive.
 *
 * This is what makes a decoder fix an afternoon rather than permanent data
 * loss, and it is only true for as long as it keeps working.
 */
final class RebuildProjection extends Command
{
    protected $signature = 'aera:rebuild';

    protected $description = 'Rebuild decoded readings from raw frames';

    public function handle(Archive $archive): int
    {
        $this->info('Rebuilding readings from raw frames.');

        $result = $archive->rebuild();

        $this->table(['decoded', 'failed'], [[$result['decoded'], $result['failed']]]);

        if ($result['failed'] > 0) {
            $this->warn("{$result['failed']} frames could not be decoded. They are kept, with the reason recorded.");
        }

        return self::SUCCESS;
    }
}
