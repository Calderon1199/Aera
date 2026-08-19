/**
 * @aera/protocol
 *
 * Bytes in, typed values out. No Bluetooth, no filesystem, no network, no
 * database, so the same build runs in React Native, in Node and in CI.
 */

export {
  decodeBodyHeader,
  decodeEnvelope,
  frameLengthOf,
  type BodyHeader,
  type Envelope,
  type EnvelopeError,
  type EnvelopeResult,
} from './envelope.ts';
export { FrameStream, type StreamStats } from './stream.ts';
export * as spec from './spec.ts';
