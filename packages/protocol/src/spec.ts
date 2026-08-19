/**
 * Every protocol constant in the project. Nothing here is retyped anywhere else:
 * a duplicated offset drifts, and a drifted offset decodes to plausible nonsense
 * rather than to an obvious error.
 *
 * Source: docs/PROTOCOL.md, "Frame envelope". Evidence tier: Documented. These
 * positions are published by prior community reverse-engineering and have not yet
 * been re-checked against hardware by this project.
 *
 * Provenance. The envelope positions come from docs/PROTOCOL.md. The checksum
 * variants and the opening frame come from the prior community work that
 * document credits, specifically ryanbr/noop docs/PROTOCOL.md, and are recorded
 * here as facts about bytes on a wire rather than as anyone's code.
 *
 * Evidence tier: Documented throughout. Nothing here has been checked against
 * hardware by this project, which is what Verified means in docs/PROTOCOL.md.
 * The framing does have unusually strong corroboration: the opening frame below
 * satisfies both checksums under exactly one catalogue variant each, and a wrong
 * offset or a wrong variant would not produce that agreement. Strong is still
 * not Verified.
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

/**
 * Checksum variants, named in prior work and confirmed against OPENING_FRAME:
 * of the whole catalogue, exactly one variant of each width reproduces that
 * frame's two checksums.
 */
export const HEADER_CHECKSUM_VARIANT = 'CRC-16/MODBUS';
export const BODY_CHECKSUM_VARIANT = 'CRC-32/ISO-HDLC';

/**
 * The opening frame the host writes to begin a session on the current
 * generation, published by ryanbr/noop as a static constant.
 *
 * Its value is that nobody on this project chose it. It is the one piece of
 * evidence here that this decoder reads real bytes correctly rather than reading
 * its own assumptions back to itself.
 */
export const OPENING_FRAME = Uint8Array.from([
  0xaa, 0x01, 0x08, 0x00, 0x00, 0x01, 0xe6, 0x71, 0x23, 0x01, 0x91, 0x01, 0x36, 0x3e, 0x5c, 0x8d,
]);
