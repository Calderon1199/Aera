# web

TypeScript dashboard reading from the API. Trends, sync status, raw-frame inspector.

**Status:** built and running against real data. See [`docs/PLAN.md`](../../docs/PLAN.md)
(milestone M6).

Constraints that apply here are in [`docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md).

## Running it

```bash
npm run dev --workspace @aera/web
```

It expects the API at `http://127.0.0.1:8000` and proxies `/api` to it, so there is no CORS
configuration to get wrong. Put the ingest token in `apps/web/.env`, which is gitignored:

```bash
VITE_AERA_TOKEN=the-value-of-AERA_INGEST_TOKEN
```

## What it shows, and what it refuses to

**One measure per chart.** Pulse and temperature never share an axis. Two scales in one
frame is the most misleading thing a dashboard can do.

**The spread, not just the mean.** Each pulse point carries the lowest and highest reading
in its bucket behind the average, because a mean alone hides exactly the excursions worth
looking at. Bucketing happens in the database: a day is 86,400 seconds and no browser wants
that many points.

**No sleep staging.** The plan lists sleep, and it is missing on purpose. The sleep-state
byte is not established, and rule 3 says an unestablished field is never displayed. It
returns when there is a validated field behind it.

**A standing notice that nothing is verified.** A chart is exactly where a Documented number
gets mistaken for a measured one, so the page says so and the API labels its own evidence
tier alongside the data.

## The inspector

Frames are shown as bytes, with the marker and the header its checksum covers picked out.
It is how a decoding problem gets diagnosed, and it makes the raw layer visible as what it
is rather than as an architectural claim. Frames this build refused can be listed on their
own, which is usually where the interesting ones are.
