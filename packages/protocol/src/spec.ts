/**
 * Every protocol constant in the project. Nothing here is retyped anywhere else:
 * a duplicated offset drifts, and a drifted offset decodes to plausible nonsense
 * rather than to an obvious error.
 *
 * Source: docs/PROTOCOL.md, "Frame envelope". Evidence tier: Documented. These
 * positions are published by prior community reverse-engineering and have not yet
 * been re-checked against hardware by this project.
 *
 * Checksum parameters are deliberately absent. They are not recorded in
 * docs/PROTOCOL.md, and a guessed polynomial produces confident nonsense, so the
 * envelope decoder extracts both checksum fields and verifies neither.
 */

/** First byte of every frame. Start of frame, and the resynchronisation anchor. */
export const FRAME_MARKER = 0xaa;

/** Absolute byte positions within a frame. */
export const FRAME = {
  MARKER: 0,
  REVISION: 1,
  /** u16 LE. Counts the body plus its 4-byte checksum trailer, not the header. */
  DECLARED_LENGTH: 2,
  ROUTING: 4,
  /** u16 LE checksum over offsets 0..5 inclusive. */
  HEADER_CHECKSUM: 6,
  BODY: 8,
} as const;

/** Bytes before the body: marker, revision, length, routing, header checksum. */
export const HEADER_LENGTH = 8;

/** Routing occupies the two bytes between the declared length and the header checksum. */
export const ROUTING_LENGTH = FRAME.HEADER_CHECKSUM - FRAME.ROUTING;

/** The header checksum covers everything preceding it. */
export const HEADER_CHECKSUMMED_LENGTH = FRAME.HEADER_CHECKSUM;

/** u32 LE checksum of the body, immediately after the body. */
export const BODY_CHECKSUM_LENGTH = 4;

/** Positions within the body, relative to FRAME.BODY. */
export const BODY = {
  KIND: 0,
  VARIANT: 1,
  OPCODE: 2,
  DATA: 3,
} as const;

/**
 * Smallest declared length that can describe a usable frame: a body carrying kind,
 * variant and opcode, plus the trailer the declared length also counts.
 */
export const MIN_DECLARED_LENGTH = BODY.DATA + BODY_CHECKSUM_LENGTH;
