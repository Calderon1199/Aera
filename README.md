# Aera

A local-first companion for a fitness band you already own. It reads the data your band
has already recorded, over Bluetooth, and keeps it on hardware you control: no vendor
account, no subscription, nothing sent to anyone else's server.

> **Status: working end to end from a Linux laptop.** The decoder, the transfer state
> machine, the API (ingest, storage, daily metrics) and the dashboard are built and tested,
> and the CLI drains a real band's history into the API. The React Native app is written but
> not yet proven on a physical phone. Milestone by milestone: [`docs/PLAN.md`](docs/PLAN.md).

---

## Why this exists

Wearables collect continuously and hand the data to a subscription service that decides
what you may see. The band itself holds roughly a fortnight of readings in onboard flash
and speaks a documented Bluetooth protocol. Aera talks to it directly, decodes what it
sends, stores it in a database you own, and computes the same class of metrics locally.

The interesting engineering is not the dashboard. It is:

- **A wire protocol with no official documentation**: checksummed framing, a
  cursor-driven bulk transfer, and a binary record whose fields have to be validated
  against an independent reference rather than trusted.
- **A transfer that loses data if you order two operations wrongly**, solved with a state
  machine that makes the unsafe ordering unrepresentable rather than merely discouraged.
- **A decoder that has to run in three runtimes** (a phone, a server, and CI), which
  forces a genuinely dependency-free core.

## Shape

```
Aera/
├── packages/protocol/   TypeScript decoder: pure, no I/O, runs anywhere
├── apps/api/            PHP: ingest, storage, analytics, read API
├── apps/mobile/         React Native: owns Bluetooth, buffers offline
├── apps/web/            TypeScript dashboard
└── docs/                architecture, protocol notes, decision records
```

The phone collects and buffers; the API is the durable archive and does the heavy
analysis; the dashboard reads from the API. The decoder is shared, unchanged, by all
three.

## Documentation

| Document | What's in it |
|---|---|
| [`docs/PLAN.md`](docs/PLAN.md) | Roadmap, milestones, and what "done" means for each |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | How the pieces fit and why the seams are where they are |
| [`docs/PROTOCOL.md`](docs/PROTOCOL.md) | The wire format, and how each field gets validated |
| [`docs/decisions/`](docs/decisions/) | Decision records: the reasoning behind each choice |

## Getting started

```bash
npm install               # workspace dependencies
npm start                 # postgres, redis, the API, and the dashboard
```

The dashboard is then at **http://127.0.0.1:5173** and the API at
**http://127.0.0.1:8000**. Two files are needed first, neither of them committed:
`apps/api/.env` (copy `.env.example` and run `php artisan key:generate`), and
`apps/web/.env` holding `VITE_AERA_TOKEN` set to the same value as `AERA_INGEST_TOKEN`.

To collect from the band, on Linux:

```bash
npm run aera --workspace @aera/cli -- scan
npm run aera --workspace @aera/cli -- pair --address AA:BB:CC:DD:EE:FF
npm run aera --workspace @aera/cli -- sync --address AA:BB:CC:DD:EE:FF
npm run aera --workspace @aera/cli -- upload --api http://127.0.0.1:8000 --token YOUR_TOKEN
```

See [`apps/cli/README.md`](apps/cli/README.md). Syncing and uploading are both safe to
repeat and safe to interrupt.

```bash
npm test                  # the decoder, the collector, the adapter
npm run typecheck
npm run example           # decode a published frame with no hardware
```

Requires PHP 8.3+, Composer 2, Node 22+, and Docker.

> **Compose v1 vs v2.** If `docker compose` reports an unknown command, you have the
> deprecated standalone `docker-compose` (v1) rather than the v2 plugin. The compose file
> works with both (substitute `docker-compose up -d`), but v2 is worth installing, and the
> package name depends on where Docker itself came from:
>
> ```bash
> sudo apt install docker-compose-v2       # Docker from Ubuntu's repos (docker.io)
> sudo apt install docker-compose-plugin   # Docker from download.docker.com (docker-ce)
> ```
>
> Installing the wrong one fails with "Unable to locate package". `dpkg -l | grep docker`
> tells you which you have.

## On the protocol

Aera interoperates with hardware **you own**, reading data **your** device already
recorded. It does not connect to, impersonate, or work around any vendor service.

The protocol constants it uses (Bluetooth identifiers, checksum parameters, packet
numbers, field positions) are factual observations about bytes on a wire. Facts of that
kind are not authored expression; they were established by independent community
measurement and can be re-measured by anyone with the hardware. Aera implements from
those facts and copies no one's code. Prior work that documented them is credited in
[`docs/PROTOCOL.md`](docs/PROTOCOL.md).

Not affiliated with, endorsed by, or connected to any device manufacturer. **Not a
medical device**: every value is a raw sensor reading or a locally-derived estimate, for
personal informational use only, and must not be used for diagnosis or treatment.

## Licence

[MIT](LICENSE).
