# 1. TypeScript decoder, PHP backend

**Status:** accepted · 2026-08-18

## Context

The project needs to speak a binary Bluetooth protocol, store the results, analyse them,
and present them. The developer's working languages are PHP and TypeScript, and the
project is intended as portfolio work, so the stack should be one they will keep
improving at, not one chosen purely for convenience.

The constraint that forces the split: **PHP cannot hold a Bluetooth connection.** There is
no maintained BLE library, and the request/response process model is wrong for a
long-lived link with notification subscriptions.

## Decision

Split on the seam the problem already has:

- **TypeScript** owns everything touching bytes or the device: the decoder and the mobile
  collector.
- **PHP** owns storage, aggregation and serving.

The decoder is a standalone package with no runtime dependencies, so the identical build
runs in React Native, in Node, and in CI.

## Consequences

**Easier.** One decoder, so no drift between platforms. The hardest logic is testable
without hardware. Both halves stay in languages the developer wants to deepen.

**Harder.** Two toolchains in one repo. The decoded shape has to cross a language
boundary, so the ingest contract needs to be explicit and versioned rather than implied.

**Ruled out.** PHP cannot own the device connection. Any future "just add a PHP daemon"
idea is already answered.

## Alternatives

**Python collector.** The reference implementations are Python, so it is the best-trodden
path and would de-risk the Bluetooth work. Rejected: it adds a third language for one
component, and Node can do the same job. The reference scripts remain useful as a
*diagnostic*: if the collector will not pair, running a known-good implementation once
isolates whether the fault is the code or the setup.

**All-PHP.** Not possible; see above.

**All-TypeScript.** Viable, and rejected only because PHP is a language the developer
wants in the portfolio. Worth revisiting if the two-toolchain overhead becomes real
friction.
