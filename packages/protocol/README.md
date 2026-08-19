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
| Checksums | Not implemented |
| Record decoder | Not started |

## What is not claimed

**No checksum is verified.** The envelope decoder extracts both checksum fields and the
exact byte ranges they cover, and stops there. The algorithms are not recorded in
[`docs/PROTOCOL.md`](../../docs/PROTOCOL.md), and checking against a guessed polynomial
would reject valid frames while looking like a working check. Until the parameters are
sourced, a frame that decodes is a frame that parsed, not a frame that is intact.

**Resynchronisation is not yet checksum-gated.** A payload byte equal to the frame marker
can be mistaken for a frame start, and if the bytes at the length position read as a large
length, the stream waits for data that never arrives and loses every frame behind it.
[`docs/PROTOCOL.md`](../../docs/PROTOCOL.md) names the defence, which is that the header
checksum covers the declared length and can confirm a candidate before the stream commits
to it, so this closes when the checksum layer lands. The failing case is recorded as a
`todo` test in [`src/stream.test.ts`](src/stream.test.ts) rather than hidden behind a
guessed maximum frame length.

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
