# 3. The server decodes by running the decoder

**Status:** accepted · 2026-08-19

## Context

Decision 2 made decoded tables a projection that must be rebuildable from raw frames
alone, and milestone M3 holds the API to exactly that: drop the decoded tables, rebuild
them from raw, get the same rows back.

That obligation lands somewhere awkward. The decoder is TypeScript, deliberately pure, and
the durable tier is PHP. So the server has to decode, and it has no decoder.

Doing nothing is not an option. If only the phone can decode, then a decoder fix means
recollecting history that is already in the archive, which is the outcome decision 2 exists
to prevent.

## Decision

**The API decodes server-side by running the TypeScript decoder as a subprocess.**
`packages/protocol` gains a thin command-line entry point that reads raw frames and writes
decoded rows as JSON. PHP invokes it, in batches, and writes what comes back.

Two consequences of that are worth stating as rules rather than leaving implied:

- **The phone posts raw frames only.** It still decodes locally, for its own display and
  for the M4 validation check, but nothing it decodes is authoritative. The API decodes
  what it stores.
- **Ingest and rebuild are the same code path.** Rebuilding is re-running the projection
  over frames already held, so the property M3 tests is exercised on every single ingest,
  not only when someone remembers to test it.

## Consequences

**Easier.** One decoder, which is the whole point of rule 1. A field that gets validated
later, or a layout that gets corrected, is fixed in one file and replayed over the entire
archive. Nothing can drift between the phone's reading and the server's, because there is
only one reading.

**Harder.** The API now depends on Node at runtime, which is a real operational cost: two
runtimes to install, two to keep versioned, and a subprocess boundary that can fail in ways
a function call cannot. Failures there must be visible rather than silently producing zero
rows. Spawning per frame would be absurd, so frames are streamed through one process per
batch.

**Committed to.** PHP does not learn to decode. A field offset appearing in PHP is a bug
by definition, and rule 5 already says so.

## Alternatives

**Reimplement the decoder in PHP.** Rejected outright. It puts protocol constants in two
places, which rule 5 forbids and for good reason: the two copies drift, and a drifted
offset fails silently rather than loudly. It also doubles the surface that every future
protocol correction has to touch.

**Trust the phone's decoded rows.** Simplest, and needs no Node on the server. Rejected
because it breaks the rebuild invariant: with no server-side decoder, decoded tables can
only be rebuilt by asking phones to re-send, and a phone that has been replaced cannot.
The archive would depend on a device outliving it.

**A separate decoding service over HTTP.** More operationally honest at scale, and the
right answer if this ever runs for more than one person. Rejected as premature: it is the
same subprocess with a network hop, a deployment and a failure mode added, for one user's
band.
