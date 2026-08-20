/**
 * One sync session, from request to completion.
 *
 * This is where the pieces meet: notification bytes go into the reassembler,
 * frames come out and drive the transfer, and the transfer's instructions are
 * carried out against the injected ports. It owns no Bluetooth and no storage.
 *
 * The ordering rule the transfer makes unrepresentable is executed here, so this
 * is the one place it could still be got wrong at runtime: storage is awaited,
 * and only if it resolves is the batch reported stored. If it rejects, the
 * failure path runs, which sends nothing at all.
 *
 * Notifications are serialised. They arrive faster than storage completes, and
 * letting a second batch interleave with a first would mean confirming a batch
 * assembled from frames that belong to both.
 */

import {
  FrameStream,
  HistoryTransfer,
  decodeHeartRate,
  type Envelope,
  type TransferAction,
} from '@aera/protocol';

import type { Ports, SessionEvent } from './ports.ts';

export type SessionState = 'idle' | 'syncing' | 'complete' | 'aborted';

export type ReferenceSample = {
  /** Seconds since the epoch, taken by the host when the notification arrived. */
  readonly at: number;
  readonly bpm: number;
};

export type SessionSummary = {
  readonly state: SessionState;
  readonly batchesConfirmed: number;
  readonly recordsDecoded: number;
  readonly framesStored: number;
  readonly reference: readonly ReferenceSample[];
};

export class CollectorSession {
  readonly #ports: Ports;
  readonly #stream = new FrameStream();
  readonly #transfer = new HistoryTransfer();
  readonly #reference: ReferenceSample[] = [];

  #state: SessionState = 'idle';
  #framesStored = 0;
  #queue: Promise<void> = Promise.resolve();

  constructor(ports: Ports) {
    this.#ports = ports;
  }

  get state(): SessionState {
    return this.#state;
  }

  get summary(): SessionSummary {
    const stats = this.#transfer.stats;

    return {
      state: this.#state,
      batchesConfirmed: stats.batchesConfirmed,
      recordsDecoded: stats.recordsDecoded,
      framesStored: this.#framesStored,
      reference: [...this.#reference],
    };
  }

  /** Ask the band to begin releasing history. */
  async start(): Promise<void> {
    this.#state = 'syncing';
    await this.#perform(this.#transfer.begin());
    this.#emit({ kind: 'requested' });
  }

  /**
   * Feed one notification from the vendor characteristic.
   *
   * Serialised behind whatever is already in flight, so a batch cannot begin
   * being handled while the previous one is still being stored.
   */
  receive(chunk: Uint8Array): Promise<void> {
    this.#queue = this.#queue.then(() => this.#handle(chunk));
    return this.#queue;
  }

  /**
   * Feed one notification from the standard heart-rate characteristic.
   *
   * Kept entirely separate from the transfer. This is the independent reference,
   * and it is only independent for as long as nothing decoded from the vendor
   * protocol can influence it.
   */
  receiveReference(chunk: Uint8Array, at?: number): void {
    const result = decodeHeartRate(chunk);
    if (!result.ok) return;

    const sample = { at: at ?? this.#now(), bpm: result.measurement.bpm };
    this.#reference.push(sample);
    this.#emit({ kind: 'reference', at: sample.at, bpm: sample.bpm });
  }

  /**
   * The link dropped. Any partly received batch is discarded, here and in the
   * transfer, because the band's cursor never advanced past it and it will be
   * served again.
   */
  disconnected(): void {
    this.#stream.reset();
  }

  /** The link is back. Ask again from wherever the band's cursor sits. */
  async reconnected(): Promise<void> {
    this.#stream.reset();
    this.#state = 'syncing';
    await this.#perform(this.#transfer.reconnected());
  }

  async #handle(chunk: Uint8Array): Promise<void> {
    if (this.#state !== 'syncing') return;

    for (const frame of this.#stream.push(chunk)) {
      await this.#accept(frame);
    }
  }

  async #accept(frame: Envelope): Promise<void> {
    await this.#perform(this.#transfer.accept(frame));
  }

  async #perform(action: TransferAction): Promise<void> {
    switch (action.kind) {
      case 'send':
        await this.#ports.transport.write(action.frame);
        return;

      case 'store':
        await this.#store(action.batch.index, action.batch.frames);
        return;

      case 'complete':
        this.#state = 'complete';
        this.#emit({ kind: 'complete', batches: action.batches, records: action.records });
        return;

      case 'aborted':
        this.#state = 'aborted';
        this.#emit({ kind: 'aborted', reason: action.reason });
        return;

      case 'wait':
        return;
    }
  }

  /**
   * Store, then confirm. Never the other way round.
   *
   * The await is the whole point: the batch is only reported stored once the
   * store has actually resolved, and a rejection takes the path that sends
   * nothing, leaving the batch the band's to serve again.
   */
  async #store(batch: number, frames: readonly Uint8Array[]): Promise<void> {
    try {
      await this.#ports.store.append(frames);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      await this.#perform(this.#transfer.batchFailed(reason));
      return;
    }

    this.#framesStored += frames.length;
    this.#emit({ kind: 'stored', batch, frames: frames.length });

    await this.#perform(this.#transfer.batchStored());
    this.#emit({ kind: 'confirmed', batch });
  }

  #emit(event: SessionEvent): void {
    this.#ports.onEvent?.(event);
  }

  #now(): number {
    return this.#ports.now?.() ?? Math.floor(Date.now() / 1000);
  }
}
