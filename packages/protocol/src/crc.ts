/**
 * Configurable CRC engines.
 *
 * The frame envelope carries a 16-bit checksum over its header and a 32-bit
 * checksum over its body, but which CRC variant produces them is not recorded
 * anywhere in this repository. So this module implements the algorithm rather
 * than a choice: give it parameters, get a checksum function.
 *
 * The parameters below are the published Rocksoft-model catalogue, standard
 * algorithm definitions rather than observations about this device. That is why
 * they live here and not in spec.ts, which holds protocol constants only. Each
 * carries its catalogue check value, the CRC of the ASCII digits "123456789",
 * and the test suite verifies every one of them, so a mistyped polynomial fails
 * loudly instead of silently returning plausible numbers.
 */

export type CrcParameters = {
  readonly width: 16 | 32;
  readonly polynomial: number;
  readonly initial: number;
  readonly reflectInput: boolean;
  readonly reflectOutput: boolean;
  readonly finalXor: number;
  /** CRC of "123456789" under these parameters, per the published catalogue. */
  readonly check: number;
};

export type Crc = (bytes: Uint8Array) => number;

const REFLECTED_BYTES = buildReflectedBytes();

/** Build a checksum function. The lookup table is built once, here. */
export function createCrc(parameters: CrcParameters): Crc {
  const { width, polynomial, initial, reflectInput, reflectOutput, finalXor } = parameters;
  const mask = width === 32 ? 0xffffffff : 0xffff;
  const topBit = width === 32 ? 0x80000000 : 0x8000;
  const table = buildTable(polynomial, width, topBit, mask);

  return (bytes: Uint8Array): number => {
    let register = initial >>> 0;

    for (const raw of bytes) {
      const byte = reflectInput ? (REFLECTED_BYTES[raw] as number) : raw;
      const index = ((register >>> (width - 8)) ^ byte) & 0xff;
      register = (((register << 8) >>> 0) ^ (table[index] as number)) & mask;
      // Coerced unsigned at every step: a shift that sets bit 31 is a large
      // positive number here, never a negative one.
      register = register >>> 0;
    }

    const output = reflectOutput ? reflect(register, width) : register;
    return ((output ^ finalXor) & mask) >>> 0;
  };
}

function buildTable(polynomial: number, width: number, topBit: number, mask: number): Uint32Array {
  const table = new Uint32Array(256);

  for (let index = 0; index < 256; index += 1) {
    let register = ((index << (width - 8)) >>> 0) & mask;

    for (let bit = 0; bit < 8; bit += 1) {
      const overflow = (register & topBit) !== 0;
      register = ((register << 1) >>> 0) & mask;
      if (overflow) register = (register ^ polynomial) >>> 0;
    }

    table[index] = register >>> 0;
  }

  return table;
}

function reflect(value: number, width: number): number {
  let out = 0;
  for (let bit = 0; bit < width; bit += 1) {
    if ((value & ((1 << bit) >>> 0)) !== 0) out = (out | ((1 << (width - 1 - bit)) >>> 0)) >>> 0;
  }
  return out >>> 0;
}

function buildReflectedBytes(): Uint8Array {
  const table = new Uint8Array(256);
  for (let value = 0; value < 256; value += 1) table[value] = reflect(value, 8);
  return table;
}

/**
 * Common variants, as candidates to test a real frame against. None of these is
 * claimed to be the one the band uses; identifying that needs a captured frame
 * and is what `identifyCrc` is for.
 */
export const CRC_CATALOGUE = {
  'CRC-16/ARC': {
    width: 16, polynomial: 0x8005, initial: 0x0000,
    reflectInput: true, reflectOutput: true, finalXor: 0x0000, check: 0xbb3d,
  },
  'CRC-16/MODBUS': {
    width: 16, polynomial: 0x8005, initial: 0xffff,
    reflectInput: true, reflectOutput: true, finalXor: 0x0000, check: 0x4b37,
  },
  'CRC-16/KERMIT': {
    width: 16, polynomial: 0x1021, initial: 0x0000,
    reflectInput: true, reflectOutput: true, finalXor: 0x0000, check: 0x2189,
  },
  'CRC-16/XMODEM': {
    width: 16, polynomial: 0x1021, initial: 0x0000,
    reflectInput: false, reflectOutput: false, finalXor: 0x0000, check: 0x31c3,
  },
  'CRC-16/IBM-3740': {
    width: 16, polynomial: 0x1021, initial: 0xffff,
    reflectInput: false, reflectOutput: false, finalXor: 0x0000, check: 0x29b1,
  },
  'CRC-32/ISO-HDLC': {
    width: 32, polynomial: 0x04c11db7, initial: 0xffffffff,
    reflectInput: true, reflectOutput: true, finalXor: 0xffffffff, check: 0xcbf43926,
  },
  'CRC-32/BZIP2': {
    width: 32, polynomial: 0x04c11db7, initial: 0xffffffff,
    reflectInput: false, reflectOutput: false, finalXor: 0xffffffff, check: 0xfc891918,
  },
  'CRC-32/MPEG-2': {
    width: 32, polynomial: 0x04c11db7, initial: 0xffffffff,
    reflectInput: false, reflectOutput: false, finalXor: 0x00000000, check: 0x376e6e7,
  },
} as const satisfies Record<string, CrcParameters>;

export type CrcName = keyof typeof CRC_CATALOGUE;

/**
 * Return every catalogue variant of the given width that maps `bytes` to
 * `expected`. Run against a real frame, this is what turns "which CRC is it?"
 * from a guess into a measurement. An empty result means none of the common
 * variants fits and the answer lies outside the catalogue.
 */
export function identifyCrc(bytes: Uint8Array, expected: number, width: 16 | 32): CrcName[] {
  const names = Object.keys(CRC_CATALOGUE) as CrcName[];
  return names.filter((name) => {
    const parameters = CRC_CATALOGUE[name];
    if (parameters.width !== width) return false;
    return createCrc(parameters)(bytes) === (expected >>> 0);
  });
}
