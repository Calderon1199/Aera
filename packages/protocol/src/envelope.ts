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

/**
 * The fixed 8-byte prefix. Separated from the whole frame because it is
 * self-describing: eight bytes are enough to know how long the frame is and,
 * once the checksum variant is known, whether this is a frame start at all.
 * That is what lets a reader confirm a candidate before waiting for its body.
 */
export type FrameHeader = {
  readonly revision: number;
  /** As written on the wire: body plus its 4-byte trailer. */
  readonly declaredLength: number;
  readonly routing: Uint8Array;
  /** The two bytes at offset 6, unverified. */
  readonly headerChecksum: number;
  /** Offsets 0..5, the exact range the header checksum covers. */
  readonly headerChecksummed: Uint8Array;
  /** Total bytes this frame occupies on the wire. */
  readonly frameLength: number;
};

export type Envelope = FrameHeader & {
  /** The whole frame, so that frame-absolute field offsets can be read directly. */
  readonly frame: Uint8Array;
  readonly body: Uint8Array;
  /** The four bytes after the body, unverified. */
  readonly bodyChecksum: number;
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

export type HeaderResult =
  | { readonly ok: true; readonly header: FrameHeader }
  | { readonly ok: false; readonly error: EnvelopeError };

/** Bytes a frame occupies on the wire, given its declared length. */
export function frameLengthOf(declaredLength: number): number {
  return declaredLength + HEADER_LENGTH;
}

/**
 * Decode the 8-byte header at `offset`. Needs only those eight bytes, so a
 * candidate frame start can be judged before the rest of it has arrived.
 */
export function decodeHeader(bytes: Uint8Array, offset = 0): HeaderResult {
  const available = bytes.length - offset;

  if (available < HEADER_LENGTH) {
    const marker = bytes[offset];
    if (marker !== undefined && marker !== FRAME_MARKER) {
      return { ok: false, error: { kind: 'not-a-frame', marker } };
    }
    return { ok: false, error: { kind: 'incomplete', have: Math.max(available, 0), need: HEADER_LENGTH } };
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

  return {
    ok: true,
    header: {
      revision: bytes[offset + FRAME.REVISION] as number,
      declaredLength,
      routing: bytes.subarray(offset + FRAME.ROUTING, offset + FRAME.ROUTING + ROUTING_LENGTH),
      headerChecksum: view.getUint16(FRAME.HEADER_CHECKSUM, true),
      headerChecksummed: bytes.subarray(offset, offset + HEADER_CHECKSUMMED_LENGTH),
      frameLength: frameLengthOf(declaredLength),
    },
  };
}

/**
 * Decode one frame starting at `offset`. Trailing bytes beyond the frame are
 * ignored, so this is safe to call on a buffer holding several frames.
 */
export function decodeEnvelope(bytes: Uint8Array, offset = 0): EnvelopeResult {
  const decoded = decodeHeader(bytes, offset);
  if (!decoded.ok) return decoded;

  const { header } = decoded;
  const available = bytes.length - offset;

  if (available < header.frameLength) {
    return { ok: false, error: { kind: 'incomplete', have: available, need: header.frameLength } };
  }

  const bodyStart = offset + FRAME.BODY;
  const bodyEnd = bodyStart + header.declaredLength - BODY_CHECKSUM_LENGTH;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.length);

  return {
    ok: true,
    envelope: {
      ...header,
      frame: bytes.subarray(offset, offset + header.frameLength),
      body: bytes.subarray(bodyStart, bodyEnd),
      // Coerced unsigned: a checksum with the top bit set is a large positive
      // number, never a negative one.
      bodyChecksum: view.getUint32(bodyEnd, true) >>> 0,
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
