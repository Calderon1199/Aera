<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Route;

/*
 * There is no web interface here. The dashboard is a separate application that
 * reads through the API, so this exists only to say what the service is rather
 * than to render anything.
 */
Route::get('/', fn (): array => [
    'service' => 'aera-api',
    'endpoints' => ['POST /api/ingest', 'GET /api/readings'],
]);
