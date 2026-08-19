/**
 * @aera/protocol
 *
 * Bytes in, typed values out. No Bluetooth, no filesystem, no network, no
 * database, so the same build runs in React Native, in Node and in CI.
 */

export {
  decodeBodyHeader,
  decodeEnvelope,
  decodeHeader,
  frameLengthOf,
  type BodyHeader,
  type Envelope,
  type EnvelopeError,
  type EnvelopeResult,
  type FrameHeader,
  type HeaderResult,
} from './envelope.ts';
export {
  CRC_CATALOGUE,
  createCrc,
  identifyCrc,
  type Crc,
  type CrcName,
  type CrcParameters,
} from './crc.ts';
export { FrameStream, type StreamStats } from './stream.ts';
export * as spec from './spec.ts';
