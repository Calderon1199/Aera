<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The archive. Append-only, never pruned, and the source of truth for
 * everything downstream.
 *
 * Frames are content addressed: the hash of the bytes is the identity, which is
 * what makes posting the same batch twice a no-op rather than a duplicate. A
 * collector that retries after a timeout, or a phone that syncs a batch it
 * already sent, cannot corrupt the archive by trying again.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('raw_frames', function (Blueprint $table): void {
            $table->id();

            // sha256 of the frame bytes. Unique, and the whole idempotency story.
            $table->char('content_hash', 64)->unique();
            $table->binary('frame');

            // Provenance, not identity. Two collectors sending the same frame
            // still store one row.
            $table->string('device_id')->nullable();
            $table->binary('batch_token')->nullable();
            $table->timestampTz('received_at')->useCurrent();

            // Projection state. Null error and a set timestamp means decoded;
            // a set error means this build could not read it and said why.
            $table->timestampTz('projected_at')->nullable();
            $table->text('decode_error')->nullable();

            $table->index('received_at');
            $table->index('decode_error');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('raw_frames');
    }
};
