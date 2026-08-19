/**
 * Frame envelope: the fixed 8-byte header, the body it declares, and the two
 * checksum fields.
 *
 * This layer does not verify checksums. The algorithms behind them are not yet
 * recorded in docs/PROTOCOL.md, and verification against a guessed polynomial
 * would reject valid frames while looking like a working check. Both fields and
 * the exact byte ranges they cover are exposed so that the checksum layer can
 * verify them once the parameters are sourced.
 */

import {
  BODY,
  BODY_CHECKSUM_LENGTH,
  FRAME,
  FRAME_MARKER,
  HEADER_CHECKSUMMED_LENGTH,
  HEADER_LENGTH,
  MIN_DECLARED_LENGTH,
  ROUTING_LENGTH,
} from './spec.ts';

export type Envelope = {
  readonly revision: number;
  /** As written on the wire: body plus its 4-byte trailer. */
  readonly declaredLength: number;
  readonly routing: Uint8Array;
  /** The two bytes at offset 6, unverified. */
  readonly headerChecksum: number;
  /** Offsets 0..5, the exact range the header checksum covers. */
  readonly headerChecksummed: Uint8Array;
  readonly body: Uint8Array;
  /** The four bytes after the body, unverified. */
  readonly bodyChecksum: number;
  /** Total bytes this frame occupies on the wire. */
  readonly frameLength: number;
};

/**
 * Why a decode failed. The stream reassembler has to tell "wait for more bytes"
 * apart from "this cannot be a frame, resynchronise", and a nullable return
 * cannot carry that distinction.
 */
export type EnvelopeError =
  | { readonly kind: 'not-a-frame'; readonly marker: number }
  | { readonly kind: 'incomplete'; readonly have: number; readonly need: number }
  | { readonly kind: 'implausible-length'; readonly declaredLength: number };

export type EnvelopeResult =
  | { readonly ok: true; readonly envelope: Envelope }
  | { readonly ok: false; readonly error: EnvelopeError };

/** Bytes a frame occupies on the wire, given its declared length. */
export function frameLengthOf(declaredLength: number): number {
  return declaredLength + HEADER_LENGTH;
}

/**
 * Decode one frame starting at `offset`. Trailing bytes beyond the frame are
 * ignored, so this is safe to call on a buffer holding several frames.
 */
export function decodeEnvelope(bytes: Uint8Array, offset = 0): EnvelopeResult {
  const available = bytes.length - offset;

  if (available < FRAME.BODY) {
    if (available > 0 && bytes[offset] !== FRAME_MARKER) {
      return { ok: false, error: { kind: 'not-a-frame', marker: bytes[offset] ?? -1 } };
    }
    return { ok: false, error: { kind: 'incomplete', have: available, need: HEADER_LENGTH } };
  }

  const marker = bytes[offset + FRAME.MARKER] as number;
  if (marker !== FRAME_MARKER) {
    return { ok: false, error: { kind: 'not-a-frame', marker } };
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset + offset, available);
  const declaredLength = view.getUint16(FRAME.DECLARED_LENGTH, true);

  if (declaredLength < MIN_DECLARED_LENGTH) {
    return { ok: false, error: { kind: 'implausible-length', declaredLength } };
  }

  const frameLength = frameLengthOf(declaredLength);
  if (available < frameLength) {
    return { ok: false, error: { kind: 'incomplete', have: available, need: frameLength } };
  }

  const bodyStart = offset + FRAME.BODY;
  const bodyLength = declaredLength - BODY_CHECKSUM_LENGTH;
  const bodyEnd = bodyStart + bodyLength;

  return {
    ok: true,
    envelope: {
      revision: bytes[offset + FRAME.REVISION] as number,
      declaredLength,
      routing: bytes.subarray(offset + FRAME.ROUTING, offset + FRAME.ROUTING + ROUTING_LENGTH),
      headerChecksum: view.getUint16(FRAME.HEADER_CHECKSUM, true),
      headerChecksummed: bytes.subarray(offset, offset + HEADER_CHECKSUMMED_LENGTH),
      body: bytes.subarray(bodyStart, bodyEnd),
      // Coerced unsigned: a checksum with the top bit set is a large positive
      // number, never a negative one.
      bodyChecksum: view.getUint32(bodyEnd - offset, true) >>> 0,
      frameLength,
    },
  };
}

export type BodyHeader = {
  readonly kind: number;
  readonly variant: number;
  readonly opcode: number;
  readonly data: Uint8Array;
};

/**
 * Split a decoded body into its routing triple and payload. Returns undefined
 * when the body is too short to carry one, which a checksum-verified frame
 * cannot be.
 */
export function decodeBodyHeader(body: Uint8Array): BodyHeader | undefined {
  if (body.length < BODY.DATA) return undefined;
  return {
    kind: body[BODY.KIND] as number,
    variant: body[BODY.VARIANT] as number,
    opcode: body[BODY.OPCODE] as number,
    data: body.subarray(BODY.DATA),
  };
}
