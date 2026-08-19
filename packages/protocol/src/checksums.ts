/**
 * The band's own checksums, and frame verification built on them.
 *
 * spec.ts names which catalogue variants these are and records how they were
 * confirmed. This module is where that naming turns into functions, so nothing
 * else in the codebase has to know or repeat the parameters.
 */

import { CRC_CATALOGUE, createCrc, type Crc } from './crc.ts';
import type { Envelope } from './envelope.ts';
import { BODY_CHECKSUM_VARIANT, HEADER_CHECKSUM_VARIANT } from './spec.ts';

/** Covers the first six bytes of a frame, which include the declared length. */
export const headerChecksum: Crc = createCrc(CRC_CATALOGUE[HEADER_CHECKSUM_VARIANT]);

/** Covers the body, which is the payload between the header and the trailer. */
export const bodyChecksum: Crc = createCrc(CRC_CATALOGUE[BODY_CHECKSUM_VARIANT]);

export type VerifyResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly failed: 'header' | 'body';
      readonly expected: number;
      readonly actual: number;
    };

/**
 * Check both sums. A frame that passes has been parsed at the right offsets and
 * arrived undamaged, which is what turns "did I read this correctly?" from a
 * judgement call into a boolean.
 */
export function verifyEnvelope(envelope: Envelope): VerifyResult {
  const header = headerChecksum(envelope.headerChecksummed);
  if (header !== envelope.headerChecksum) {
    return { ok: false, failed: 'header', expected: envelope.headerChecksum, actual: header };
  }

  const body = bodyChecksum(envelope.body);
  if (body !== envelope.bodyChecksum) {
    return { ok: false, failed: 'body', expected: envelope.bodyChecksum, actual: body };
  }

  return { ok: true };
}
