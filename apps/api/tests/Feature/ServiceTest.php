<?php

declare(strict_types=1);

it('describes itself at the root', function (): void {
    $this->getJson('/')->assertOk()->assertJsonPath('service', 'aera-api');
});

it('answers the health check', function (): void {
    $this->get('/up')->assertOk();
});
