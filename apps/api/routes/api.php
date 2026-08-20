<?php

declare(strict_types=1);

use App\Http\Controllers\IngestController;
use App\Http\Controllers\ReadingController;
use App\Http\Middleware\RequireIngestToken;
use Illuminate\Support\Facades\Route;

Route::middleware(RequireIngestToken::class)->group(function (): void {
    Route::post('/ingest', IngestController::class);
    Route::get('/readings', ReadingController::class);
});
