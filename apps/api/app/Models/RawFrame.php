<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasOne;

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
}
