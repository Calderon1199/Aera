<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Query\Expression;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;

/**
 * One frame exactly as the band emitted it. Never edited, never pruned.
 */
class RawFrame extends Model
{
    public $timestamps = false;

    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'received_at' => 'datetime',
            'projected_at' => 'datetime',
        ];
    }

    public function reading(): HasOne
    {
        return $this->hasOne(Reading::class);
    }

    /** The identity of a frame is the hash of its bytes, nothing else. */
    public static function hash(string $frame): string
    {
        return hash('sha256', $frame);
    }

    /**
     * Binary columns cross the driver boundary base64 encoded, in both
     * directions.
     *
     * Postgres is a UTF-8 database and a frame is not text: it starts 0xAA,
     * which is not valid UTF-8, so binding raw bytes as an ordinary parameter is
     * rejected outright. Encoding in SQL keeps the column a real bytea rather
     * than settling for text, and keeps the conversion in one place.
     */
    public static function encodeBinary(string $bytes): Expression
    {
        $encoded = base64_encode($bytes);

        // The alphabet is fixed, so this cannot carry anything but base64.
        if (preg_match('/^[A-Za-z0-9+\/]*={0,2}$/', $encoded) !== 1) {
            throw new InvalidArgumentException('refusing to inline a value that is not base64');
        }

        return DB::raw("decode('{$encoded}', 'base64')");
    }

    /** Select frames as base64, which is also what the decoder wants. */
    public static function selectBase64(): string
    {
        return "id, encode(frame, 'base64') as frame_base64";
    }
}
