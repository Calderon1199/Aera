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

/**
 * Packet kinds, at the first byte of the body. From ryanbr/noop docs/PROTOCOL.md.
 * Only the kinds this project reads are listed.
 */
export const PACKET_KIND = {
  COMMAND: 35,
  COMMAND_RESPONSE: 36,
  REALTIME_DATA: 40,
  HISTORICAL_DATA: 47,
  EVENT: 48,
  METADATA: 49,
} as const;

/**
 * The stored history record, layout version 18.
 *
 * Offsets are absolute frame offsets, exactly as the source states them, so that
 * this table can be compared against it line by line. They are NOT relative to
 * the body, and the version that selects this layout is the byte at offset 9,
 * not the framing format byte at offset 1.
 *
 * Source: ryanbr/noop docs/BLE_REVERSE_ENGINEERING.md, the current generation's
 * type-47 version-18 field map. Tier: Documented. Read the caveat in
 * docs/PROTOCOL.md before trusting any of it: the correlations behind these
 * names come from a single overnight capture of one still, sleeping subject,
 * and are not established for waking, exercise or off-wrist wear.
 */
export const HISTORY_RECORD_VERSION = 18;

/** Frame bytes a version 18 record occupies, confirmed across the source's corpus. */
export const HISTORY_RECORD_LENGTH = 124;

export const HISTORY_RECORD = {
  /** Selects the layout. Everything below is meaningless if this is not 18. */
  VERSION: 9,
  /** Lifetime counter, monotonic across records. */
  RECORD_INDEX: 11,
  /** Unix seconds as written by the device. */
  TIMESTAMP: 15,
  PULSE: 22,
  INTERBEAT_COUNT: 23,
  INTERBEAT_FIRST: 24,
  /** Motion with gravity removed. */
  MOTION_MAGNITUDE: 41,
  GRAVITY_X: 45,
  GRAVITY_Y: 49,
  GRAVITY_Z: 53,
  /** Cumulative and wrapping. Differences are steps; the value is not. */
  STEP_COUNTER: 57,
  /** Signed, divided by 10 for degrees Celsius. */
  AUX_TEMPERATURE_1: 69,
  AUX_TEMPERATURE_2: 71,
  /** Unsigned, divided by 100 for degrees Celsius. The divisor is the claim. */
  SKIN_TEMPERATURE: 73,
} as const;

/**
 * Positions whose meaning is not established. Read into `unverified` and keyed
 * by position and width, never by a physiological name, because a byte read at
 * the wrong offset still produces a number that looks like a measurement.
 *
 * What prior work suspects each of being, recorded here and nowhere the code can
 * act on it: 36 heart-rate quality flags, 37 a duplicate pulse agreeing with
 * offset 22 on 99.575% of its corpus, 40 a cardiac confidence score, 59 a
 * cadence-like value with no established unit, 63 a three-valued wear or
 * activity class, 75 to 79 packed status words, 81 a sleep state in bits 4 and
 * 5, 82 a saturation candidate whose evidence conflicts across devices, 106 to
 * 109 optical baselines and amplitudes where 128 reads as a sentinel rather
 * than a measurement, and 113 an unidentified quality metric.
 */
export const HISTORY_RECORD_UNVERIFIED = [
  { offset: 36, width: 1 },
  { offset: 37, width: 1 },
  { offset: 40, width: 1 },
  { offset: 59, width: 1 },
  { offset: 63, width: 1 },
  { offset: 75, width: 2 },
  { offset: 77, width: 2 },
  { offset: 79, width: 2 },
  { offset: 81, width: 1 },
  { offset: 82, width: 1 },
  { offset: 106, width: 1 },
  { offset: 107, width: 1 },
  { offset: 108, width: 1 },
  { offset: 109, width: 1 },
  { offset: 113, width: 4 },
] as const;

/**
 * Interbeat intervals run from INTERBEAT_FIRST up to the next mapped field, so
 * the layout itself bounds how many a record can carry.
 */
export const INTERBEAT_MAX = (36 - HISTORY_RECORD.INTERBEAT_FIRST) / 2;

/**
 * Commands this project sends. Deliberately partial.
 *
 * Every command here is reversible and safe to send twice, which is the bar
 * docs/PROTOCOL.md sets. Source: ryanbr/noop docs/PROTOCOL.md.
 */
export const COMMAND = {
  /** Ask the band to start releasing stored history. Payload [0x00]. */
  REQUEST_HISTORY: 22,
  /** Tell the band a batch is safely stored. Payload [0x01] then the token. */
  CONFIRM_HISTORY: 23,
} as const;

/**
 * Reachable on this protocol, excluded by design, recorded so they can be
 * refused rather than so they can be sent.
 *
 * A decoding library should not contain the means to brick hardware. These
 * numbers exist here only to give `encodeCommand` something to check against,
 * and nothing in this codebase may send them. See rule 6 of the working
 * agreement, which admits no exceptions.
 */
export const NEVER_SEND: Readonly<Record<number, string>> = {
  25: 'cursor reset, would discard history the band has not yet released',
  29: 'reboot',
  32: 'power cycle',
};

/**
 * Metadata subtypes, at the opcode position of a metadata packet, which is frame
 * offset 10. These bracket a history transfer.
 */
export const METADATA = {
  HISTORY_START: 1,
  HISTORY_END: 2,
  HISTORY_COMPLETE: 3,
} as const;

/**
 * The position token carried by a history-end packet, which the confirmation
 * echoes back byte for byte.
 *
 * Prior work describes the confirmation payload as [0x01] followed by eight
 * bytes of the end data, and describes the end payload as beginning at frame
 * offset 11. Which eight bytes is not stated unambiguously, so this takes the
 * payload's first eight and copies them verbatim.
 *
 * Copying rather than rebuilding is what makes that uncertainty survivable. The
 * bytes go back exactly as they arrived, so a wrong reading of their internal
 * structure cannot corrupt them. Only the extent could be wrong, and that is one
 * constant to change once a capture settles it. Never rebuild this token from
 * decoded numbers.
 */
export const HISTORY_END = {
  PAYLOAD: 11,
  TOKEN_LENGTH: 8,
  /** Recorded for completeness. Not used: the token is echoed, not interpreted. */
  TRIM_CURSOR: 21,
} as const;

/**
 * The standard Bluetooth heart-rate service, which the band exposes alongside
 * its vendor-specific one.
 *
 * These are not reverse-engineered. They are assigned numbers from the Bluetooth
 * SIG's public specification, which is a stronger kind of documented than
 * anything else in this file: a published standard rather than a community
 * measurement. The service needs no pairing, which is what makes it usable as an
 * independent reference before anything else works.
 */
export const STANDARD_HEART_RATE = {
  SERVICE: '0000180d-0000-1000-8000-00805f9b34fb',
  MEASUREMENT: '00002a37-0000-1000-8000-00805f9b34fb',
} as const;

/** Flag bits of a heart-rate measurement, per the SIG specification. */
export const HEART_RATE_FLAGS = {
  /** 0 means the rate is a u8, 1 means u16 LE. */
  WIDE_VALUE: 0b0000_0001,
  CONTACT_DETECTED: 0b0000_0010,
  CONTACT_SUPPORTED: 0b0000_0100,
  ENERGY_PRESENT: 0b0000_1000,
  INTERVALS_PRESENT: 0b0001_0000,
} as const;

/** Beat intervals are transmitted in units of 1/1024 second. */
export const INTERVAL_UNITS_PER_SECOND = 1024;
