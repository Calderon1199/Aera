<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use RuntimeException;
use Symfony\Component\HttpFoundation\Response;

/**
 * The whole authentication story: one shared secret, compared in constant time.
 *
 * There are no accounts in this project by design. An unset or default token is
 * refused outright rather than allowed through, because a deployment that
 * accepts anything is worse than one that refuses everything.
 */
final class RequireIngestToken
{
    public function handle(Request $request, Closure $next): Response
    {
        $expected = config('aera.ingest_token');

        if (! is_string($expected) || $expected === '' || $expected === 'change-me') {
            throw new RuntimeException('AERA_INGEST_TOKEN is not set to a real value');
        }

        $presented = (string) $request->bearerToken();

        if (! hash_equals($expected, $presented)) {
            return response()->json(['message' => 'unauthenticated'], 401);
        }

        return $next($request);
    }
}
