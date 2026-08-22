<?php

declare(strict_types=1);

use App\Http\Controllers\FrameController;
use App\Http\Controllers\IngestController;
use App\Http\Controllers\ReadingController;
use App\Http\Controllers\SeriesController;
use App\Http\Controllers\StatusController;
use App\Http\Middleware\RequireIngestToken;
use Illuminate\Support\Facades\Route;

Route::middleware(RequireIngestToken::class)->group(function (): void {
    Route::post('/ingest', IngestController::class);
    Route::get('/readings', ReadingController::class);
    Route::get('/status', StatusController::class);
    Route::get('/series', SeriesController::class);
    Route::get('/frames', [FrameController::class, 'index']);
    Route::get('/frames/{id}', [FrameController::class, 'show']);
});
