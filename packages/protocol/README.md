# protocol

Pure TypeScript decoder for the band's wire protocol. No I/O, no platform bindings: bytes in, typed values out. Runs unchanged in React Native, Node and CI.

**Status:** in progress, see [`docs/PLAN.md`](../../docs/PLAN.md) (milestone M1, M2).

Constraints that apply here are in [`docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md)
and [`docs/PROTOCOL.md`](../../docs/PROTOCOL.md).

## What works

| Piece | State |
|---|---|
| Frame envelope | Header, body and both checksum fields decoded |
| Frame stream | Fragmentation, several frames per notification, and resynchronisation past damage |
| Checksums | Engine and catalogue done, tested against published check values |
| Record decoder | Not started |

## What is not claimed

**The band's checksum variant is unidentified.** [`src/crc.ts`](src/crc.ts) implements the
algorithm rather than a choice: give it parameters, get a checksum function. What is
missing is which variant the band uses, and guessing would reject valid frames while
looking like a working check. So there is no default anywhere, and a frame that decodes is
a frame that parsed, not a frame that is intact.

`identifyCrc` is the way out. Run a captured frame's header bytes and its checksum through
the catalogue and it names every variant that reproduces the value. That turns the open
question into a measurement, and it needs one real frame.

**Resynchronisation is only safe when you supply a checksum.** Construct `FrameStream`
with a `headerChecksum` and a candidate frame start is confirmed from its first eight bytes
before the reader commits to it. Construct it without one and any marker byte is taken at
face value, so a payload byte equal to the marker can park the stream on a length read out
of the payload behind it. Since the band's variant is unidentified, production code has
nothing to pass yet. Both behaviours have tests, and the gap is a `todo` in
[`src/stream.test.ts`](src/stream.test.ts) rather than a guessed maximum frame length.

`npm run example` shows the difference on one byte stream: one frame recovered and 26 bytes
stranded without a checksum, both valid frames and nothing stranded with one.

**Every fixture is synthetic.** The frames in the test suite are built by
[`src/testing/synthetic.ts`](src/testing/synthetic.ts) from the layout the specification
states. They demonstrate that the decoder reads the positions it is told to read. They
demonstrate nothing about what firmware writes, and no field here is Verified in the sense
[`docs/PROTOCOL.md`](../../docs/PROTOCOL.md) defines.

## Running it

```bash
npm test          # node's built-in runner, no build step
npm run typecheck
```
