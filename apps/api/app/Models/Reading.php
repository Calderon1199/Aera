<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A decoded record. A projection of one raw frame, and rebuildable from it.
 */
class Reading extends Model
{
    public $timestamps = false;

    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'recorded_at' => 'datetime',
            'interbeat_intervals' => 'array',
            'unverified' => 'array',
            'pulse' => 'integer',
            'step_counter' => 'integer',
            'motion_magnitude' => 'float',
            'gravity_x' => 'float',
            'gravity_y' => 'float',
            'gravity_z' => 'float',
        ];
    }

    public function rawFrame(): BelongsTo
    {
        return $this->belongsTo(RawFrame::class);
    }
}
