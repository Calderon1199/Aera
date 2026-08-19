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
  bodyChecksum,
  headerChecksum,
  verifyEnvelope,
  type VerifyResult,
} from './checksums.ts';
export {
  CRC_CATALOGUE,
  createCrc,
  identifyCrc,
  type Crc,
  type CrcName,
  type CrcParameters,
} from './crc.ts';
export {
  assertSendable,
  encodeCommand,
  encodeFrame,
  encodeHistoryRequest,
  type FrameFields,
} from './encode.ts';
export {
  decodeHistoryRecord,
  findImplausibilities,
  type Gravity,
  type HistoryRecord,
  type Implausibility,
  type RecordError,
  type RecordResult,
} from './record.ts';
export {
  HistoryTransfer,
  type Batch,
  type TransferAction,
  type TransferState,
  type TransferStats,
} from './transfer.ts';
export { FrameStream, type FrameStreamOptions, type StreamStats } from './stream.ts';
export * as spec from './spec.ts';
