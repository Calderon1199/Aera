<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The projection. Rebuildable from raw_frames at any time, and therefore
 * disposable: nothing here is the only copy of anything.
 *
 * Every column maps to a field the decoder names. Positions whose meaning is not
 * established stay in `unverified`, keyed by offset, so nothing unproven can be
 * queried as though it were a measurement.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('readings', function (Blueprint $table): void {
            $table->id();

            // One reading per frame, and the cascade is what makes the
            // projection genuinely subordinate to the archive.
            $table->foreignId('raw_frame_id')->unique()->constrained()->cascadeOnDelete();

            $table->smallInteger('layout_version');
            $table->timestampTz('recorded_at')->index();
            $table->bigInteger('record_index')->nullable();

            $table->smallInteger('pulse')->nullable();
            $table->jsonb('interbeat_intervals')->nullable();
            $table->float('motion_magnitude')->nullable();
            $table->float('gravity_x')->nullable();
            $table->float('gravity_y')->nullable();
            $table->float('gravity_z')->nullable();
            $table->integer('step_counter')->nullable();
            $table->decimal('skin_temperature', 6, 2)->nullable();
            $table->decimal('aux_temperature_1', 6, 2)->nullable();
            $table->decimal('aux_temperature_2', 6, 2)->nullable();

            // Never given physiological names, never queried as measurements.
            $table->jsonb('unverified');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('readings');
    }
};
