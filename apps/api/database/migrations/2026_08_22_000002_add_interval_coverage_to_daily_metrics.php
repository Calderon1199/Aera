<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * How many intervals arrived per reading.
 *
 * Reported because it is the reason RMSSD is usually absent. The band sends
 * roughly one interval per second against a faster heartbeat, so the beat series
 * is subsampled, and a reader deserves to see that rather than infer it from a
 * null.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('daily_metrics', function (Blueprint $table): void {
            $table->decimal('interval_coverage', 6, 3)->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('daily_metrics', function (Blueprint $table): void {
            $table->dropColumn('interval_coverage');
        });
    }
};
