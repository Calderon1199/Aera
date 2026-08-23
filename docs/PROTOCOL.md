# Protocol

What Aera speaks to the band, and, more importantly, the standard of evidence each
claim in here is held to.

> Implementation status: **not started**. This document is the specification the decoder
> will be built against (milestone M1).

## Standing on prior work

The wire format was established by independent community reverse-engineering. Aera did not
discover it and does not claim to. Credit is owed to the projects that documented it,
notably the work published by the [NOOP](https://github.com/ryanbr/noop) project and the
efforts it in turn credits: `johnmiddleton12/my-whoop` for the earlier generation and
`b-nnett/goose` for the current one.

**What is reused and what is not.** Protocol constants (Bluetooth identifiers, checksum
parameters, packet numbers, field positions) are factual observations about bytes on a
wire. They are not authored expression, they can be re-measured by anyone with the
hardware, and several independent projects have measured the same values. Aera implements
from those facts.

Nobody's code is copied, transcribed, or ported. Where a prior project's implementation is
licensed restrictively, that licence governs its code and not the facts it documents.

**What was taken from it, and what was checked.** The checksum variants, the opening frame
and the packet numbering below come from that work. The framing was not taken on trust:
the opening frame satisfies both of its checksums under exactly one catalogue variant of
each width, and a wrong offset or a wrong variant would not produce that agreement. That
is corroboration between independent facts, not a hardware check, so the tier is still
Documented.

## Evidence tiers

Every field claim carries one of these. The distinction is not pedantry. In this domain a
field read at the wrong position still yields a number, and that number looks exactly like
a measurement.

| Tier | Means | Where it may appear |
|---|---|---|
| **Verified** | Cross-checked against an independent reference on real hardware | Anywhere |
| **Documented** | Published by prior work, not yet re-checked here | Decoded, flagged |
| **Present** | The bytes exist; meaning not established | `unverified` only |

The independent reference is the **standard Bluetooth heart-rate characteristic**, a public
SIG profile that works without pairing. Decode stored history and read that characteristic
over the same window; where timestamps overlap the values must agree exactly. A wrong
offset does not agree approximately; it does not agree at all, which makes the check
unusually decisive.

Until Aera runs that check on real hardware, **nothing here is Verified**. Everything below
is Documented, and the codebase must say so.

## What a real band has established so far

A first drain of one band, 227,504 frames. None of this is Verified, because none of it is
the cross-check above, but it is considerably more than a citation.

**The framing is right.** Every one of the 227,504 frames satisfied both checksums. Not a
sample: all of them. A wrong offset, a wrong length field or a wrong CRC variant could not
produce that.

**Orientation is right, and physics says so.** Median magnitude across 219,576 decoded
records is 1.005 g. Gravity has a fixed strength, so three float offsets read wrongly would
give nonsense rather than a value within half a percent of 1.

**Surface temperature is plausible.** Median 32.96 C, range 30.07 to 38.03, which is a
human wrist and not a coincidence of scaling.

**The interval field corroborates the pulse field, and this is the strongest
evidence in the project so far.** Aggregated per day over real data, the heart rate implied
by the intervals lands on the pulse byte almost exactly:

| Day | Intervals | Median interval | Implied bpm | Pulse field |
|---|---|---|---|---|
| 2026-04-26 | 30,951 | 706 ms | 86 | 86 |
| 2026-04-27 | 11,812 | 733 ms | 82 | 83 |

Two fields at different offsets, in different units, decoded independently, agreeing to
within a beat. A wrong offset on either would not produce that.

**But the interval stream is subsampled, and records carrying several intervals look
wrong.** About one interval arrives per second against a faster heartbeat, so what the band
sends is a sample of the beat series rather than the series. Worse, on records that do
carry two to four intervals, successive differences average around 375 ms, which no pair of
consecutive beats produces. Either those intervals are not consecutive beats, or the array
is not laid out the way this decoder reads it beyond the first entry.

The consequence is stated rather than worked around: **beat-to-beat variability is not
currently derivable from this device's data.** RMSSD is computed where adjacency is a fact
rather than an assumption, is reported as an estimate alongside the interval coverage that
explains it, and is deliberately absent from the dashboard. A missing number that can be
trusted beats a present one that cannot.

**Pulse is consistent with the interval field, loosely.** Across 4,627 records carrying
both, the rate implied by the beat intervals correlates with the pulse byte at 0.61, with a
mean absolute difference of 10.7 bpm. Two fields at different offsets, in different units,
tracking each other is meaningful. It is also exactly what beat-to-beat variability looks
like against a smoothed rate, so it neither confirms nor refutes the offsets on its own.
Only the standard characteristic settles that.

## Transport

A vendor-specific GATT service alongside the standard ones. The custom channels stay silent
until the link is encrypted; pairing is just-works, with no PIN and nothing for the wearer
to confirm. On Apple platforms a single acknowledged write raises it transparently.

The standard heart-rate service is present and needs no pairing at all.

## Frame envelope

```
offset 0    marker 0xAA
offset 1    revision
offset 2    declared length, u16 LE   (body plus its 4-byte trailer)
offset 4    routing bytes
offset 6    u16 LE checksum of offsets 0..5
offset 8    body: [kind][variant][opcode][data...]
trailing    u32 LE checksum of the body

bytes on the wire = declared length + 8
```

Two checksums, two jobs. The header sum covers only the first six bytes, so the declared
length can be trusted cheaply; that is what makes stream resynchronisation possible. The
body sum covers the contents.

| Sum | Variant | Covers |
|---|---|---|
| Header, u16 at offset 6 | CRC-16/MODBUS | offsets 0..5 |
| Body, u32 trailer | CRC-32/ISO-HDLC | the body only |

The opening frame the host writes to begin a session is a published constant:

```
aa 01 08 00 00 01 e6 71 23 01 91 01 36 3e 5c 8d
```

Its bytes were chosen by nobody on this project, so it is the project's one piece of
evidence that the decoder reads real bytes rather than its own assumptions. It declares 8,
occupies 8 + 8 = 16 bytes, and satisfies both sums. It lives in
`packages/protocol/src/spec.ts` and is exercised on every test run.

**This is the project's best debugging tool.** A passing body checksum proves the framing
was parsed correctly, which converts "did I get this right?" from judgement into a boolean.

Notifications are capped at the negotiated packet size and have no relationship to frame
boundaries, so a reassembler is required: buffer, find the marker, read the declared
length, emit only when complete.

## The bulk transfer

```
  request history
        │
        ▼
  band sends a batch of records
        │
        ▼
  batch-close arrives, carrying a position token
        │
        ▼
  ┌─────────────────────────┐
  │ STORE THE BATCH FIRST   │
  └─────────────────────────┘
        │
        ▼
  confirm, echoing the token back byte for byte
        │
        └──────► band advances; repeat until finished
```

Two properties worth stating plainly:

**The confirmation is mandatory, not an optimisation.** Without it the band re-serves the
same batch indefinitely and no records are delivered at all.

**Confirming before storing loses data permanently.** The band forgets what it has been
told you have. There is no way to ask again. Milestone M2 exists to make this structurally
impossible rather than merely documented.

Echo the position token verbatim. Do not rebuild it from its decoded numbers.

## The stored record

One entry per second. Retention is longer than assumed: a single drain from one band
returned history spanning **2026-04-19 to 2026-08-20**, four months rather than the
fortnight this document previously stated. That is one device and one firmware, so it is an
observation rather than a specification, but the planning assumption of a fortnight is
wrong in the safe direction only for storage, and wrong in the unsafe direction for how
long a first sync takes.

Field positions are absolute frame offsets and are gated on a **record version byte**: firmware writes several layouts, and
decoding one against another's positions produces confident nonsense.

**Two different bytes, and confusing them is the exact failure this rule exists to
prevent.** Offset 1 is the *framing* format byte, which says how the envelope is laid out.
The *record* layout is selected by the byte at offset 9, the second byte of the body, which
is the sequence position of the packet triple. A historical record frame carries its layout
version there. Branch on offset 9 for field positions; offset 1 tells you nothing about
them.

Positions live in `packages/protocol/src/spec.ts` and nowhere else. Duplicating them
guarantees drift, and a drifted offset fails silently.

**This firmware writes at least two layouts.** Of 227,504 frames drained from a real band,
219,576 were version 18 and 7,928 were **version 26**, which is not documented anywhere
this project has found. The decoder refuses version 26 rather than reading it against
version 18's positions, and the raw frames are kept, so they can be decoded whenever that
layout is worked out. This is exactly the case the version gate exists for, and it turned
up on the first real sync.

The field map below is layout version 18, and comes from the same prior work as the
framing, specifically its type-47 field inventory. One caveat governs the whole table and
belongs next to it rather than in a footnote: **the correlations behind these names were
established over a single overnight capture of one still, sleeping subject.** The author
states plainly that they do not extend to waking, exercise or off-wrist wear. That is
enough to decode against and nowhere near enough to call Verified.

Offsets are absolute frame offsets. The layout is selected by offset 9, never by offset 1.

| Offset | Field | Tier | Notes |
|---|---|---|---|
| 11 | Record index | Documented | Lifetime counter, monotonic |
| 15 | Timestamp | Documented | Unix seconds as written by the device |
| 22 | Pulse | Documented | Reported as matching the reference exactly in prior work |
| 23, 24+ | Inter-beat intervals | Documented | Count, then u16 milliseconds. The input to any variability measure |
| 41 | Motion magnitude | Documented | Gravity removed, in g |
| 45, 49, 53 | Orientation (3× float) | Documented | Magnitude near 1 g when correctly aligned, so it is self-checking |
| 57 | Step counter | Documented | Cumulative and wrapping; differences are steps, the value is not |
| 69, 71 | Auxiliary temperatures | Documented | Signed, divided by 10. The divisor is the whole claim |
| 73 | Surface temperature | Documented | Unsigned, divided by 100 |
| 36, 37, 40 | Pulse quality bytes | **Present** | A flags byte, a duplicate pulse and a confidence score in prior work. Carried raw |
| 59, 63 | Motion side channels | **Present** | Cadence-like and a three-valued class. No established unit |
| 75, 77, 79 | Status words | **Present** | Packed, unmapped |
| 81 | Rest state | **Present** | Partially mapped in prior work. Carried raw, not surfaced |
| 82 | Saturation candidate | **Present** | Cross-device evidence conflicts. Never surfaced |
| 106 to 109 | Optical channels | **Present** | Baselines and amplitudes where 128 reads as a sentinel rather than a measurement. Carried raw |
| 113 | Unidentified float | **Present** | A quality metric in prior work. Carried raw |

Everything marked Present is read into an `unverified` map keyed by offset and width, so a
saturation candidate is `u8_82` and never `spo2`. Nothing in that map can be displayed or
fed to analysis, because it has no name that any consumer would look for.

The optical channels are the strongest argument for keeping raw frames forever: when
somebody works them out, stored history can be re-decoded.

## Commands

Deliberately partial. Only reversible, non-destructive operations are implemented, and
every command must be safe to send twice.

Firmware writes, cursor resets, shipping mode, gauge resets and update mode are all
reachable on this protocol and are all **excluded by design**. A decoding library should
not contain the means to brick hardware.

## Constraints

- **One host at a time.** While Aera holds the band, the vendor app cannot sync.
- **Transfer speed is device-paced.** Prior measurement found it unaffected by packet-size
  or connection-interval tuning. Design around it; do not fight it.
- **Firmware drift is real.** Always branch on the revision byte.
