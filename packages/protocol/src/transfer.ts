/**
 * The bulk history transfer.
 *
 * The band releases stored data in batches and waits for confirmation before
 * sending more. Confirming tells it the batch is safely yours and it will not
 * resend, so confirming before the write commits loses those records with no way
 * to ask for them again. The rule is store, then confirm.
 *
 * The natural way to write this loop puts the confirmation exactly where the
 * batch-close frame arrives, which is before any storage has happened. So the
 * shape here is deliberate: accepting a batch-close returns a *store this*
 * instruction and nothing else, and the function that builds the confirmation
 * frame is private to this module. `batchStored` is its only caller, and it
 * refuses to run in any other state.
 *
 * The unsafe ordering is not discouraged. There is no expression for it.
 *
 * Nothing here touches Bluetooth or storage. It consumes frames and returns
 * instructions, which is what lets the whole transfer be driven to completion in
 * tests with no device involved.
 */

import { encodeCommand, encodeHistoryRequest } from './encode.ts';
import { decodeBodyHeader, type Envelope } from './envelope.ts';
import { decodeHistoryRecord, type HistoryRecord } from './record.ts';
import { COMMAND, HISTORY_END, METADATA, PACKET_KIND } from './spec.ts';

export type Batch = {
  /** Position in this session, from 1. */
  readonly index: number;
  /**
   * The raw frames, exactly as they arrived. These are the source of truth and
   * are what must be durable before the batch is confirmed. Decoded records are
   * a projection and can be rebuilt from these at any time.
   */
  readonly frames: readonly Uint8Array[];
  /** Frames this decoder understood. Never more authoritative than `frames`. */
  readonly records: readonly HistoryRecord[];
  /** Frames it did not, which ride along raw rather than being dropped. */
  readonly undecoded: number;
};

export type TransferAction =
  | { readonly kind: 'send'; readonly frame: Uint8Array; readonly why: string }
  /** Persist `batch.frames`, then call batchStored. Confirming is not available until you do. */
  | { readonly kind: 'store'; readonly batch: Batch }
  | { readonly kind: 'wait' }
  | { readonly kind: 'complete'; readonly batches: number; readonly records: number }
  | { readonly kind: 'aborted'; readonly reason: string };

export type TransferState =
  | 'idle'
  | 'requested'
  | 'receiving'
  | 'awaiting-storage'
  | 'complete'
  | 'aborted';

export type TransferStats = {
  readonly batchesConfirmed: number;
  readonly recordsDecoded: number;
  readonly framesUndecoded: number;
  /** Frames arriving while storage was outstanding, ignored rather than acted on. */
  readonly framesIgnored: number;
};

export class HistoryTransfer {
  #state: TransferState = 'idle';
  #sequence = 0;
  #batchIndex = 0;
  #frames: Uint8Array[] = [];
  #records: HistoryRecord[] = [];
  #undecoded = 0;
  #token: Uint8Array | undefined;

  #batchesConfirmed = 0;
  #recordsDecoded = 0;
  #framesUndecoded = 0;
  #framesIgnored = 0;

  get state(): TransferState {
    return this.#state;
  }

  get stats(): TransferStats {
    return {
      batchesConfirmed: this.#batchesConfirmed,
      recordsDecoded: this.#recordsDecoded,
      framesUndecoded: this.#framesUndecoded,
      framesIgnored: this.#framesIgnored,
    };
  }

  /** Ask the band to start releasing history. */
  begin(): TransferAction {
    this.#state = 'requested';
    return { kind: 'send', frame: encodeHistoryRequest(this.#nextSequence()), why: 'request history' };
  }

  /**
   * Resume after a dropped link.
   *
   * Any partly received batch is discarded rather than kept. The band's cursor
   * only advances on confirmation, so an unconfirmed batch is still the band's
   * to re-serve, and keeping a half-batch across a reconnect risks confirming
   * something that was never completely received.
   */
  reconnected(): TransferAction {
    this.#discardBatch();
    return this.begin();
  }

  /** Feed one verified frame. */
  accept(envelope: Envelope): TransferAction {
    if (this.#state === 'complete' || this.#state === 'aborted') return { kind: 'wait' };

    // While storage is outstanding the band should be waiting. Anything arriving
    // now is a retransmission, and acting on it would mean confirming a batch
    // built from frames counted twice.
    if (this.#state === 'awaiting-storage') {
      this.#framesIgnored += 1;
      return { kind: 'wait' };
    }

    const body = decodeBodyHeader(envelope.body);
    if (body === undefined) return { kind: 'wait' };

    if (body.kind === PACKET_KIND.METADATA) return this.#acceptMetadata(envelope, body.opcode);
    if (body.kind === PACKET_KIND.HISTORICAL_DATA) return this.#acceptRecord(envelope);

    return { kind: 'wait' };
  }

  /**
   * Report that every frame in the batch is durable.
   *
   * This is the only path to a confirmation frame. It refuses to run unless a
   * batch is actually outstanding, so a confirmation cannot be produced by
   * calling things in a different order.
   */
  batchStored(): TransferAction {
    if (this.#state !== 'awaiting-storage' || this.#token === undefined) {
      throw new Error(
        `batchStored called while ${this.#state}: there is no batch outstanding to confirm`,
      );
    }

    // Echoed byte for byte, never rebuilt from decoded numbers.
    const frame = encodeConfirmation(this.#token, this.#nextSequence());

    this.#batchesConfirmed += 1;
    this.#recordsDecoded += this.#records.length;
    this.#framesUndecoded += this.#undecoded;
    this.#discardBatch();
    this.#state = 'receiving';

    return { kind: 'send', frame, why: `confirm batch ${this.#batchIndex}` };
  }

  /**
   * Report that storage failed.
   *
   * No confirmation is sent, which is the entire point. The band's cursor stays
   * where it is and it will serve this batch again on the next session, so the
   * records are still the band's. Losing them requires confirming, and this path
   * cannot confirm.
   */
  batchFailed(reason: string): TransferAction {
    this.#discardBatch();
    this.#state = 'aborted';
    return { kind: 'aborted', reason };
  }

  #acceptMetadata(envelope: Envelope, subtype: number): TransferAction {
    if (subtype === METADATA.HISTORY_START) {
      this.#discardBatch();
      this.#batchIndex += 1;
      this.#state = 'receiving';
      return { kind: 'wait' };
    }

    if (subtype === METADATA.HISTORY_END) {
      const token = readToken(envelope);
      if (token === undefined) {
        return this.batchFailed('batch close carried no usable position token');
      }

      this.#token = token;
      this.#state = 'awaiting-storage';
      return {
        kind: 'store',
        batch: {
          index: this.#batchIndex,
          frames: this.#frames,
          records: this.#records,
          undecoded: this.#undecoded,
        },
      };
    }

    if (subtype === METADATA.HISTORY_COMPLETE) {
      this.#state = 'complete';
      return { kind: 'complete', batches: this.#batchesConfirmed, records: this.#recordsDecoded };
    }

    return { kind: 'wait' };
  }

  #acceptRecord(envelope: Envelope): TransferAction {
    if (this.#state === 'requested') {
      this.#batchIndex += 1;
      this.#state = 'receiving';
    }

    // The raw frame is kept whatever happens to the decode. A record this build
    // cannot read is a decoder gap, not a reason to lose the bytes.
    this.#frames.push(envelope.frame.slice());

    const result = decodeHistoryRecord(envelope);
    if (result.ok) this.#records.push(result.record);
    else this.#undecoded += 1;

    return { kind: 'wait' };
  }

  #discardBatch(): void {
    this.#frames = [];
    this.#records = [];
    this.#undecoded = 0;
    this.#token = undefined;
  }

  #nextSequence(): number {
    this.#sequence = (this.#sequence + 1) & 0xff;
    return this.#sequence;
  }
}

/**
 * Private on purpose. Exporting this would put a confirmation frame within reach
 * of any caller holding a token, which is exactly the ordering this module
 * exists to make unreachable.
 */
function encodeConfirmation(token: Uint8Array, sequence: number): Uint8Array {
  const payload = new Uint8Array(1 + token.length);
  payload[0] = 0x01;
  payload.set(token, 1);
  return encodeCommand(COMMAND.CONFIRM_HISTORY, sequence, payload);
}

/** Copy the token out of a batch-close frame, verbatim. */
function readToken(envelope: Envelope): Uint8Array | undefined {
  const start = HISTORY_END.PAYLOAD;
  const end = start + HISTORY_END.TOKEN_LENGTH;
  if (envelope.frame.length < end) return undefined;

  return envelope.frame.slice(start, end);
}
