<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * A day's derived numbers. Rebuildable from readings, which are themselves
 * rebuildable from raw frames.
 */
class DailyMetric extends Model
{
    public $timestamps = false;

    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'day' => 'date',
            'computed_at' => 'datetime',
            'samples' => 'integer',
            'interval_count' => 'integer',
            'pulse_min' => 'integer',
            'pulse_max' => 'integer',
            'resting_pulse' => 'integer',
            'steps' => 'integer',
        ];
    }
}
