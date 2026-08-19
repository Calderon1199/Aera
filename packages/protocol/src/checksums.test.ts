/**
 * THE OPENING FRAME IS NOT SYNTHETIC. It is a published protocol constant,
 * recorded in spec.ts with its source. Nobody on this project chose its bytes,
 * which is the whole reason it is worth testing against: a decoder that reads
 * its own assumptions back to itself cannot fail, and proves nothing.
 *
 * It is still not evidence about hardware. Nothing here has been checked against
 * a device, and docs/PROTOCOL.md reserves Verified for exactly that.
 */

import { deepStrictEqual, strictEqual } from 'node:assert/strict';
import { describe, it } from 'node:test';

import { identifyCrc } from './crc.ts';
import { decodeBodyHeader, decodeEnvelope } from './envelope.ts';
import { headerChecksum, verifyEnvelope } from './checksums.ts';
import { BODY_CHECKSUM_VARIANT, HEADER_CHECKSUM_VARIANT, OPENING_FRAME } from './spec.ts';

const decoded = decodeEnvelope(OPENING_FRAME);
if (!decoded.ok) throw new Error(`the opening frame does not decode: ${decoded.error.kind}`);
const { envelope } = decoded;

describe('the opening frame', () => {
  it('declares its own length correctly', () => {
    strictEqual(envelope.frameLength, OPENING_FRAME.length);
    strictEqual(envelope.declaredLength, 8);
  });

  it('satisfies both checksums', () => {
    deepStrictEqual(verifyEnvelope(envelope), { ok: true });
  });

  it('is matched by exactly one catalogue variant per checksum', () => {
    deepStrictEqual(identifyCrc(envelope.headerChecksummed, envelope.headerChecksum, 16), [
      HEADER_CHECKSUM_VARIANT,
    ]);
    deepStrictEqual(identifyCrc(envelope.body, envelope.bodyChecksum, 32), [BODY_CHECKSUM_VARIANT]);
  });

  it('decodes to the expected packet kind', () => {
    // 0x23 is the command packet kind. Named in spec.ts once the packet
    // constants land; asserted numerically here so this test stands alone.
    strictEqual(decodeBodyHeader(envelope.body)?.kind, 0x23);
  });
});

describe('verifyEnvelope', () => {
  it('names the header when the header sum is wrong', () => {
    const damaged = { ...envelope, headerChecksum: 0x0000 };
    const result = verifyEnvelope(damaged);

    strictEqual(result.ok, false);
    if (result.ok) return;
    strictEqual(result.failed, 'header');
    strictEqual(result.actual, headerChecksum(envelope.headerChecksummed));
  });

  it('names the body when only the body sum is wrong', () => {
    const result = verifyEnvelope({ ...envelope, bodyChecksum: 0x00000000 });

    strictEqual(result.ok, false);
    if (result.ok) return;
    strictEqual(result.failed, 'body');
  });

  it('rejects a frame with a flipped payload bit', () => {
    const bytes = OPENING_FRAME.slice();
    bytes[10] = (bytes[10] as number) ^ 0b0000_0001;

    const reread = decodeEnvelope(bytes);
    if (!reread.ok) throw new Error('expected a decodable frame');
    strictEqual(verifyEnvelope(reread.envelope).ok, false);
  });
});
