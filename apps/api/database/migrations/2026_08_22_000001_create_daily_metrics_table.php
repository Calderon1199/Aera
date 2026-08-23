<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Derived metrics, one row per day.
 *
 * A third tier, and the least certain one. Raw frames are the truth, readings
 * are a projection of them, and this is an interpretation of the projection. It
 * is rebuildable from readings exactly as readings are rebuildable from raw, so
 * nothing here is anybody's only copy.
 *
 * Every column is an estimate computed from fields that are Documented rather
 * than Verified. The table records how it was computed, so a number can always
 * be traced to the definition that produced it.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('daily_metrics', function (Blueprint $table): void {
            $table->id();
            $table->date('day')->unique();

            $table->integer('samples');
            $table->integer('interval_count');

            $table->smallInteger('pulse_min')->nullable();
            $table->decimal('pulse_avg', 6, 2)->nullable();
            $table->smallInteger('pulse_max')->nullable();
            /** The fifth percentile of the day's pulses. No invented threshold. */
            $table->smallInteger('resting_pulse')->nullable();

            /** Milliseconds. Textbook definitions, computed over successive intervals. */
            $table->decimal('rmssd', 8, 2)->nullable();
            $table->decimal('sdnn', 8, 2)->nullable();

            $table->integer('steps')->nullable();
            $table->decimal('temperature_min', 6, 2)->nullable();
            $table->decimal('temperature_avg', 6, 2)->nullable();
            $table->decimal('temperature_max', 6, 2)->nullable();
            $table->decimal('motion_avg', 8, 4)->nullable();

            /** Identifies the definitions used, so old rows are never mistaken for new ones. */
            $table->string('method');
            $table->timestampTz('computed_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('daily_metrics');
    }
};
