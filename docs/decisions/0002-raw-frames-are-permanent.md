# 2. Raw frames are permanent

**Status:** accepted · 2026-08-18

## Context

The device record contains fields nobody has decoded: the optical channels in particular,
and a disputed blood-oxygen candidate whose evidence conflicts across devices.

Existing implementations prune raw frames aggressively (one prunes after 24 hours or 50 MB)
because they run on phones and laptops where storage is scarce. Aera's durable tier is a
server, where it is not.

## Decision

Store every raw frame permanently. Treat decoded tables as a **projection** that can be
dropped and rebuilt from raw at any time.

A year of per-second frames is a few gigabytes.

## Consequences

**Easier.** When the optical channels are worked out, years of history can be re-decoded
rather than collected again from scratch. Decoder bugs become an afternoon's re-run
instead of permanent data loss. The raw layer also makes a genuinely useful debugging
surface in the dashboard.

**Harder.** More storage, and a migration path to maintain, and the rebuild must actually
work, which means it needs testing, not just intending. Raw frames may contain device
identifiers, so the archive is sensitive and must never enter git.

**Committed to.** The rebuild-from-raw property is now an invariant. A change that breaks
it is the wrong change.

## Alternatives

**Prune raw after N days.** Cheaper, and standard practice for phone-resident apps.
Rejected because the storage saving is trivial at this scale and the loss is irreversible.

**Decode-only, no raw.** Simplest schema. Rejected for the same reason, more strongly: it
makes the single most interesting open problem in the protocol permanently
uninvestigatable on your own data.
