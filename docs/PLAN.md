# Plan

The build order, what each stage has to prove, and why it comes where it does.

## Sequencing principle

Each milestone must be **verifiable on its own**, and the ones that need no hardware come
first. That is not tidiness; it is how the risk gets managed. The Bluetooth layer is the
least predictable part of this project, and walking into it with an already-proven decoder
means that when something goes wrong, only one thing can be wrong.

The order below also front-loads the parts that make the best portfolio reading: a pure,
well-tested decoder and a state machine with a real invariant are more interesting to a
reviewer than a dashboard, and they exist earliest.

---

## M0: Foundation

Repository, tooling, CI. No application code.

**Done when:** the repo is cloneable, `docker compose up` gives a database, CI runs on
push, and anyone picking up the project can read the docs and know the rules.

---

## M1: Protocol decoder

`packages/protocol`: a dependency-free TypeScript package. Bytes in, typed values out.

Split into four pieces, each independently testable:

| Piece | Proves |
|---|---|
| Checksums | Match published catalogue check values |
| Frame envelope | The known-good opening frame validates end to end |
| Frame stream | Fragmented, interleaved and damaged input recovers correctly |
| Record decoder | Fields land where the spec says, gated to physical ranges |

**Why this first:** the envelope carries a checksum over its own contents, which turns
"did I parse this correctly?" from a judgement call into a boolean. That makes the whole
milestone verifiable with no device attached.

**Done when:** the full suite passes, and the real opening frame, a constant nobody on
this project chose, validates against both checksums and decodes to the expected packet
kind and opcode.

**Status: met.** The opening frame validates under exactly one catalogue variant per
checksum, and the suite covers all four pieces. Note what this does and does not settle:
the framing is corroborated arithmetically, while the record field names rest on prior
work's single overnight capture. Nothing is Verified until M4 cross-checks a decoded
record against the standard characteristic on real hardware.

---

## M2: Transfer state machine

The bulk-transfer driver, still pure, still no I/O.

The device releases stored data in batches and waits for confirmation before sending more.
Confirming tells it the batch is safely yours, and it will not resend. So the ordering is
**store, then confirm**, and getting it backwards loses data with no way to ask for it
again.

The design goal is that the unsafe ordering is *not expressible*: accepting a batch-close
frame returns a "store this" instruction, and the confirmation frame is only reachable
through the call that reports storage succeeded.

**Done when:** a simulated multi-batch transfer, including a storage failure and a
mid-transfer reconnect, drives to completion in tests, with no device involved.

---

## M3: API and schema

`apps/api`: PHP. Ingest endpoint, migrations, read API.

Two tiers of storage, and the distinction is load-bearing:

- **Raw frames**: append-only, never pruned. Parts of the record are still undecoded by
  anyone. Keep the bytes and a better decoder can revisit years of history; discard them
  and that data is gone for good.
- **Decoded rows**: a projection, rebuildable from raw at any time.

**Done when:** posting a captured batch twice produces identical row counts, and decoded
tables can be dropped and rebuilt from raw alone.

---

## M4: Mobile collector

`apps/mobile`: React Native. Owns Bluetooth, buffers locally, syncs to the API when
reachable.

**The riskiest milestone**, and deliberately fourth. By the time we get here the decoder
and the transfer logic are already proven, so anything that breaks is Bluetooth.

Staged:

1. Read the standard heart-rate characteristic, which needs no pairing and becomes the
   reference signal for everything else
2. Pair and open a session
3. Run a transfer end to end
4. Local buffer, then sync

**Done when:** decoded stored readings match the standard characteristic's live readings
where their timestamps overlap. That cross-check is the only real proof the field
positions are right on this firmware, and it is why step 1 comes first.

---

## M5: Analytics

Variability, rest staging, daily rollups, recovery-style scoring. Runs in the API as
queued jobs over stored rows.

Honest framing: this is the least certain part of the project. Turning inter-beat
intervals into a defensible score is open science, not a formula to look up. Outputs are
estimates and are labelled as such.

**Done when:** metrics are reproducible from stored data, and re-running over the same
window is deterministic.

---

## M6: Dashboard

`apps/web`: TypeScript. Trends, sleep, sync status, and a raw-frame inspector.

The inspector earns its place: it is how a decoding problem gets diagnosed, and it shows a
reviewer that the raw layer actually exists.

**Done when:** a full night reads end to end from device to chart.

---

## M7: Portfolio finish

Screenshots, a written architecture walkthrough, and honest documentation of what works
and what does not.

**Done when:** someone unfamiliar can read the repo and understand both the system and the
reasoning, without running anything.

---

## Risk register

| Risk | Impact | Response |
|---|---|---|
| Bluetooth pairing fails on iOS | Blocks M4 | Reference signal works unpaired; prove the decoder against it first |
| Field positions differ on this firmware | Wrong data, silently | Cross-check against the standard characteristic; branch on the revision byte, never assume |
| Confirm-before-store bug | Permanent data loss | M2 makes it structurally impossible |
| Transfer is slow (device-paced) | Poor UX | Background sync, resumable from the cursor; do not fight it |
| Only one host may hold the device | Vendor app conflicts | Understood constraint; document it |
| Scope creep into analytics | Never ships | M1–M4 are the project; M5+ is upside |

---

## Not doing

Stated so it stays decided:

- No vendor cloud or account integration
- No destructive commands: no firmware writes, cursor resets, or shipping mode, ever
- No health claims, no medical framing
- No Android until iOS works end to end
- No committed device captures: real data stays out of git

---

## Working with agents

Milestones are sized to be one focused session each. Before starting any of them:

1. Read [`ARCHITECTURE.md`](ARCHITECTURE.md) for the constraints the repo holds to
2. Read the relevant `docs/decisions/` record for why things are as they are
3. Write the test first where a milestone has a stated "done when"; it is already a
   test description

Protocol constants live in exactly one place. An offset that appears in two files will
drift, and a drifted offset decodes to plausible nonsense rather than an obvious error.
