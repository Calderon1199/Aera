# protocol

Pure TypeScript decoder for the band's wire protocol. No I/O, no platform bindings: bytes in, typed values out. Runs unchanged in React Native, Node and CI.

**Status:** in progress, see [`docs/PLAN.md`](../../docs/PLAN.md) (milestone M1, M2).

Constraints that apply here are in [`docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md)
and [`docs/PROTOCOL.md`](../../docs/PROTOCOL.md).

## What works

| Piece | State |
|---|---|
| Frame envelope | Header, body and both checksums, verified against the published opening frame |
| Frame stream | Fragmentation, several frames per notification, and checksum-confirmed resynchronisation |
| Checksums | CRC-16/MODBUS and CRC-32/ISO-HDLC, identified and confirmed |
| Record decoder | Layout version 18, named fields where prior work validated them, the rest carried raw |

## What is not claimed

**Nothing here is Verified.** [`docs/PROTOCOL.md`](../../docs/PROTOCOL.md) reserves that
word for a field cross-checked against an independent reference on real hardware, and no
device has been near this code. Everything is Documented: published by prior community
work, and in the framing's case corroborated arithmetically.

That corroboration is worth stating precisely, because it is stronger than a citation and
weaker than a measurement. The published opening frame satisfies both of its checksums
under exactly one catalogue variant of each width. A wrong offset or a wrong variant would
not agree, so the framing is very unlikely to be wrong. It is still not a hardware check,
and the fields inside a record carry no such corroboration at all.

**The record field names rest on one capture.** The offsets and meanings for the stored
record come from prior work whose correlations were established over a single overnight
recording of one still, sleeping subject, which its author states does not extend to
waking, exercise or off-wrist wear. Positions that work left unmapped, disputed or only
partly understood are read into `unverified`, keyed by offset and width, so a saturation
candidate is `u8_82` and never `spo2`.

**Every other fixture is synthetic.** The frames in the test suite are built by
[`src/testing/synthetic.ts`](src/testing/synthetic.ts) from the layout the specification
states, and now carry real checksums so that a built frame is a valid one. They demonstrate
that the reader survives fragmentation and damage. They demonstrate nothing about firmware.

## Running it

```bash
npm test          # node's built-in runner, no build step
npm run typecheck
```
