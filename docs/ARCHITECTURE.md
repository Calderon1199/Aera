# Architecture

How the pieces fit, and why the seams are where they are.

## The shape of the problem

The band records continuously to onboard flash and holds roughly a fortnight. It records
whether or not anything is listening. **The band is the server**: syncing is draining its
flash, not streaming live.

Three consequences follow, and they drive most of the design:

1. **Nothing is lost while you are disconnected.** Sync at least fortnightly and the
   dataset is complete. Continuous collection is a convenience, not a correctness need.
2. **The transfer is device-paced and slow.** It cannot be tuned from the host side, so
   the design assumes background, resumable syncing rather than a progress bar someone
   waits on.
3. **Only one host may hold the band at a time.** While Aera is connected, the vendor app
   cannot sync, and vice versa.

## The pipeline

```
   ┌──────────────┐
   │  the band    │   ~14 days of per-second readings in flash
   └──────┬───────┘
          │ Bluetooth LE
          ▼
   ┌──────────────────────────────────────────┐
   │  apps/mobile        React Native          │
   │                                           │
   │   Bluetooth binding  (the only new risk)  │
   │   packages/collector (session, transfer)  │
   │   packages/protocol  (decode)             │
   │   local buffer       (works offline)      │
   └──────┬───────────────────────────────────┘
          │ HTTPS, when the API is reachable
          ▼
   ┌──────────────────────────────────────────┐
   │  apps/api           PHP                   │
   │                                           │
   │   raw frames     append-only, permanent   │
   │   decoded rows   projection, rebuildable  │
   │   analytics      queued jobs              │
   └──────┬───────────────────────────────────┘
          │ JSON
          ▼
   ┌──────────────────────────────────────────┐
   │  apps/web           dashboard             │
   └──────────────────────────────────────────┘
```

## Why the seams are here

### The decoder is pure

`packages/protocol` imports nothing: no Bluetooth, no filesystem, no network, no
database. Bytes in, values out.

This is the single most important structural decision in the project, and it buys three
things:

- **It runs everywhere.** The same build works in React Native, in Node, and in CI. There
  is one decoder, so there is nothing to drift.
- **It is testable without hardware.** The hardest logic in the project can be written and
  fully verified before a band is ever connected.
- **It isolates failures.** When something breaks during a real transfer, the decoder is
  already proven, so the fault is in the Bluetooth layer. Debugging two unproven layers
  simultaneously is what makes projects like this stall.

### The phone owns Bluetooth, and buffers

iOS cannot reach Bluetooth from a browser. No iOS browser implements Web Bluetooth, and
they all share one engine, so this is not a matter of picking a different one. A native
app is required, and React Native keeps it in TypeScript alongside the decoder.

The phone writes to a **local store first** and syncs to the API opportunistically. If the
API is unreachable, collection continues. This is what "local-first" actually means here:
the phone is not a thin pipe to a server, it is a functioning node on its own.

### Raw frames are permanent

Two storage tiers, and the distinction is load-bearing:

| Tier | Retention | Role |
|---|---|---|
| Raw frames | Forever | Source of truth |
| Decoded rows | Rebuildable | A projection, for querying |

Parts of the device record are not decoded by anyone yet, the optical channels in
particular. Keeping the raw bytes means that when those are worked out, years of history
can be re-decoded. Discarding them makes that permanently impossible.

It also demotes decoder bugs from data loss to an afternoon: fix, re-run, done.

### The transfer is a state machine

The bulk transfer has one rule that loses data if broken: **store the batch, then confirm
it**. Confirming tells the band the batch is safely yours and it will not resend.

The natural way to write the loop puts the confirmation exactly where the batch-close
frame arrives, which is before any storage has happened. So the driver is built so that
accepting a batch-close returns a *store this* instruction, and the confirmation frame is
only reachable through the call reporting that storage succeeded.

The unsafe ordering is not discouraged. It is not expressible.

## Validation strategy

The band also exposes the **standard Bluetooth heart-rate characteristic**: a public
profile, unrelated to the vendor protocol, that works without pairing.

That is the reference signal. Decode stored history and read the standard characteristic
over the same window; where timestamps overlap, the values must agree. It is the only real
proof that the field positions are right on a given firmware, and the earliest warning
that a layout has shifted.

It is also why the first thing built in the mobile milestone is the part that does the
least.

## Environment

Development is Linux: PHP 8.3 native, Docker for Postgres and Redis. Herd is macOS and
Windows only and is not part of this setup.

iOS builds run on Expo's hosted service rather than on a local toolchain or a macOS
runner, because signing an app for a personal Apple ID is the part that actually requires
a Mac. Decision record 4 covers the trade. The result installs from a link on the phone.
