/**
 * @aera/collector
 *
 * Drives a sync session. Imports no platform API: Bluetooth, storage and the
 * clock all arrive as injected ports, which is what lets a whole transfer be
 * exercised in tests with no phone and no band.
 */

export { CollectorSession, type ReferenceSample as SessionReference, type SessionState, type SessionSummary } from './session.ts';
export type { FrameStore, Ports, SessionEvent, Transport } from './ports.ts';
