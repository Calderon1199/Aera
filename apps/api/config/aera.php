<?php

declare(strict_types=1);

return [
    /*
     * The shared secret the collector presents when posting batches. There are
     * no accounts in this project by design, so this is the whole of the
     * authentication story and it must not be left at its default.
     */
    'ingest_token' => env('AERA_INGEST_TOKEN'),

    'decoder' => [
        /*
         * How to run the decoder. PHP does not decode: decision record 3
         * explains why, and rule 5 makes a field offset appearing in this
         * codebase a bug by definition.
         */
        'command' => [
            env('AERA_NODE_BINARY', 'node'),
            env('AERA_DECODER_CLI', base_path('../../packages/decoder-cli/src/cli.ts')),
        ],

        /* Frames per subprocess. One process per frame would be absurd. */
        'chunk' => (int) env('AERA_DECODER_CHUNK', 500),

        /*
         * Generous on purpose. The decoder handles 500 frames in under two
         * seconds unloaded, so this is not about its speed: a first import runs
         * alongside a sync and a database, and a timeout tuned to an idle
         * machine fails exactly when the work is heaviest.
         */
        'timeout' => (int) env('AERA_DECODER_TIMEOUT', 600),
    ],
];
