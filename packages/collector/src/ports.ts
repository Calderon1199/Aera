/**
 * What the platform has to provide.
 *
 * Everything the collector needs from the outside world is one of these, and it
 * imports none of them. That is what keeps this package testable without a
 * phone, a band, or a network, and it is the same discipline that keeps the
 * decoder testable without hardware.
 */

import type { HistoryRecord } from '@aera/protocol';

/** Writing to the band's command characteristic. */
export type Transport = {
  write(frame: Uint8Array): Promise<void>;
};

/**
 * Durable local storage for raw frames.
 *
 * The contract here is the whole safety property of a transfer, so it is stated
 * rather than implied: `append` must not resolve until the frames are safe
 * against the process dying. Resolving early tells the band it may forget them.
 */
export type FrameStore = {
  append(frames: readonly Uint8Array[]): Promise<void>;
};

export type SessionEvent =
  | { readonly kind: 'requested' }
  | { readonly kind: 'stored'; readonly batch: number; readonly frames: number }
  | { readonly kind: 'confirmed'; readonly batch: number }
  | { readonly kind: 'complete'; readonly batches: number; readonly records: number }
  | { readonly kind: 'aborted'; readonly reason: string }
  | { readonly kind: 'reference'; readonly at: number; readonly bpm: number };

export type Ports = {
  readonly transport: Transport;
  readonly store: FrameStore;
  /**
   * Decoded records from each stored batch, streamed rather than accumulated.
   *
   * A full sync is a fortnight of per-second records, so the session holds none
   * of them: the consumer decides what is worth keeping. For the reference
   * cross-check that is only the handful whose timestamps fall inside the window
   * the reference signal was actually recorded over.
   */
  readonly onRecords?: (records: readonly HistoryRecord[]) => void;
  /** Optional, and never load bearing. Progress reporting only. */
  readonly onEvent?: (event: SessionEvent) => void;
  /** Seconds since the epoch. Injected so tests are not at the mercy of a clock. */
  readonly now?: () => number;
};
