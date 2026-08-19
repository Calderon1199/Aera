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
