/**
 * FIXTURES ARE SYNTHETIC. Every frame here is built by src/testing/synthetic.ts.
 * No device is involved, which is what the milestone asks for: the transfer has
 * to be provable without hardware, because the failure it guards against loses
 * data permanently and cannot be tested by trying it.
 */

import { deepStrictEqual, strictEqual, throws } from 'node:assert/strict';
import { describe, it } from 'node:test';

import { decodeBodyHeader, decodeEnvelope, type Envelope } from './envelope.ts';
import { COMMAND, METADATA, PACKET_KIND } from './spec.ts';
import { HistoryTransfer, type TransferAction } from './transfer.ts';
import { buildBatchClose, buildHistoryFrame, buildMetadataFrame } from './testing/synthetic.ts';

function envelopeOf(bytes: Uint8Array): Envelope {
  const result = decodeEnvelope(bytes);
  if (!result.ok) throw new Error(`fixture does not decode: ${result.error.kind}`);
  return result.envelope;
}

const start = (): Envelope => envelopeOf(buildMetadataFrame(METADATA.HISTORY_START));
const done = (): Envelope => envelopeOf(buildMetadataFrame(METADATA.HISTORY_COMPLETE));
const close = (token: readonly number[]): Envelope => envelopeOf(buildBatchClose(token));
const record = (pulse: number): Envelope => envelopeOf(buildHistoryFrame({ pulse }));

const TOKEN_A = [0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88];
const TOKEN_B = [0xde, 0xad, 0xbe, 0xef, 0x01, 0x02, 0x03, 0x04];

function sent(action: TransferAction): { opcode: number; data: number[] } {
  if (action.kind !== 'send') throw new Error(`expected a send, got ${action.kind}`);
  const body = decodeBodyHeader(envelopeOf(action.frame).body);
  if (body === undefined) throw new Error('sent frame has no body');
  strictEqual(body.kind, PACKET_KIND.COMMAND);
  return { opcode: body.opcode, data: [...body.data] };
}

describe('HistoryTransfer', () => {
  it('asks for history to begin', () => {
    strictEqual(sent(new HistoryTransfer().begin()).opcode, COMMAND.REQUEST_HISTORY);
  });

  it('asks for storage when a batch closes, and nothing else', () => {
    const transfer = new HistoryTransfer();
    transfer.begin();
    transfer.accept(start());
    transfer.accept(record(58));

    const action = transfer.accept(close(TOKEN_A));
    strictEqual(action.kind, 'store');
    if (action.kind !== 'store') return;
    strictEqual(action.batch.records.length, 1);
    strictEqual(action.batch.frames.length, 1);
    strictEqual(transfer.state, 'awaiting-storage');
  });

  it('confirms only after storage is reported, echoing the token byte for byte', () => {
    const transfer = new HistoryTransfer();
    transfer.begin();
    transfer.accept(start());
    transfer.accept(record(60));
    transfer.accept(close(TOKEN_A));

    const { opcode, data } = sent(transfer.batchStored());
    strictEqual(opcode, COMMAND.CONFIRM_HISTORY);
    deepStrictEqual(data, [0x01, ...TOKEN_A]);
  });

  it('cannot produce a confirmation without a batch outstanding', () => {
    const transfer = new HistoryTransfer();
    transfer.begin();

    throws(() => transfer.batchStored(), /no batch outstanding/);
    transfer.accept(start());
    transfer.accept(record(61));
    throws(() => transfer.batchStored(), /no batch outstanding/);
  });

  it('sends nothing at all when storage fails', () => {
    const transfer = new HistoryTransfer();
    transfer.begin();
    transfer.accept(start());
    transfer.accept(record(62));
    transfer.accept(close(TOKEN_A));

    const action = transfer.batchFailed('disk full');
    strictEqual(action.kind, 'aborted');
    strictEqual(transfer.stats.batchesConfirmed, 0);
  });

  it('keeps the raw frame of a record it cannot decode', () => {
    const transfer = new HistoryTransfer();
    transfer.begin();
    transfer.accept(start());
    transfer.accept(envelopeOf(buildHistoryFrame({ version: 99 })));

    const action = transfer.accept(close(TOKEN_A));
    if (action.kind !== 'store') throw new Error('expected a store');
    strictEqual(action.batch.frames.length, 1);
    strictEqual(action.batch.records.length, 0);
    strictEqual(action.batch.undecoded, 1);
  });

  it('ignores frames arriving while storage is outstanding', () => {
    const transfer = new HistoryTransfer();
    transfer.begin();
    transfer.accept(start());
    transfer.accept(close(TOKEN_A));

    strictEqual(transfer.accept(record(70)).kind, 'wait');
    strictEqual(transfer.stats.framesIgnored, 1);

    const { data } = sent(transfer.batchStored());
    deepStrictEqual(data, [0x01, ...TOKEN_A]);
  });

  it('discards a half-received batch on reconnect rather than confirming it', () => {
    const transfer = new HistoryTransfer();
    transfer.begin();
    transfer.accept(start());
    transfer.accept(record(58));

    strictEqual(sent(transfer.reconnected()).opcode, COMMAND.REQUEST_HISTORY);
    throws(() => transfer.batchStored(), /no batch outstanding/);
  });

  /**
   * The milestone's acceptance line: several batches, a storage failure and a
   * reconnect in the middle, driven to completion with no device involved.
   */
  it('drives a multi-batch transfer through failure and reconnection', () => {
    const transfer = new HistoryTransfer();
    const confirmations: number[][] = [];

    const confirm = (): void => {
      const action = transfer.batchStored();
      confirmations.push(sent(action).data);
    };

    transfer.begin();

    // Batch one: stored and confirmed.
    transfer.accept(start());
    transfer.accept(record(58));
    transfer.accept(record(59));
    strictEqual(transfer.accept(close(TOKEN_A)).kind, 'store');
    confirm();

    // Batch two: storage fails, so nothing is confirmed and the transfer aborts.
    transfer.accept(start());
    transfer.accept(record(60));
    strictEqual(transfer.accept(close(TOKEN_B)).kind, 'store');
    strictEqual(transfer.batchFailed('write rejected').kind, 'aborted');

    // Read into a local: asserting on the array's length directly would narrow
    // its type for the rest of the test.
    const afterFailure = confirmations.length;
    strictEqual(afterFailure, 1);

    // Reconnect. The band's cursor never advanced past batch two, so it serves
    // it again, and this time storage holds.
    transfer.reconnected();
    transfer.accept(start());
    transfer.accept(record(60));
    transfer.accept(record(61));
    strictEqual(transfer.accept(close(TOKEN_B)).kind, 'store');
    confirm();

    // Batch three, then the band reports it has nothing left.
    transfer.accept(start());
    transfer.accept(record(62));
    strictEqual(transfer.accept(close(TOKEN_A)).kind, 'store');
    confirm();

    const finished = transfer.accept(done());
    strictEqual(finished.kind, 'complete');
    if (finished.kind !== 'complete') return;

    strictEqual(finished.batches, 3);
    // Five, not six: the record in the failed batch was discarded, and the
    // band re-served that batch with two.
    strictEqual(finished.records, 5);
    strictEqual(transfer.state, 'complete');
    strictEqual(transfer.stats.batchesConfirmed, 3);

    // The failed batch was never confirmed, and the batch that replaced it was
    // confirmed with the same token the band sent.
    const total = confirmations.length;
    strictEqual(total, 3);
    deepStrictEqual(confirmations[0], [0x01, ...TOKEN_A]);
    deepStrictEqual(confirmations[1], [0x01, ...TOKEN_B]);
  });
});
