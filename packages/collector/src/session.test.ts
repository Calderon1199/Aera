/**
 * FIXTURES ARE SYNTHETIC, and so is every port. No phone, no band, no network.
 *
 * That is the point of the design rather than a limitation of the test: the
 * milestone this belongs to is the riskiest one, and everything except the
 * Bluetooth binding itself is provable before any hardware is involved.
 */

import { deepStrictEqual, ok, rejects, strictEqual } from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  bodyChecksum,
  decodeBodyHeader,
  decodeEnvelope,
  encodeFrame,
  headerChecksum,
  spec,
} from '@aera/protocol';

import { CollectorSession } from './session.ts';
import type { SessionEvent } from './ports.ts';

/** A history record frame, laid out at the offsets spec.ts states. */
function recordFrame(pulse: number, timestamp: number): Uint8Array {
  const bytes = new Uint8Array(spec.HISTORY_RECORD_LENGTH);
  const view = new DataView(bytes.buffer);

  bytes[spec.FRAME.MARKER] = spec.FRAME_MARKER;
  bytes[spec.FRAME.REVISION] = 0x01;
  view.setUint16(spec.FRAME.DECLARED_LENGTH, bytes.length - 8, true);
  bytes[spec.FRAME.BODY] = spec.PACKET_KIND.HISTORICAL_DATA;
  bytes[spec.HISTORY_RECORD.VERSION] = spec.HISTORY_RECORD_VERSION;
  view.setUint32(spec.HISTORY_RECORD.TIMESTAMP, timestamp, true);
  view.setUint8(spec.HISTORY_RECORD.PULSE, pulse);
  view.setFloat32(spec.HISTORY_RECORD.GRAVITY_Z, 1, true);

  return sign(bytes);
}

function metadataFrame(subtype: number, payload: number[] = []): Uint8Array {
  return encodeFrame({
    kind: spec.PACKET_KIND.METADATA,
    variant: 0,
    opcode: subtype,
    data: Uint8Array.from(payload),
  });
}

/** Signed with the same checksums everything else uses. */
function sign(bytes: Uint8Array): Uint8Array {
  const view = new DataView(bytes.buffer);
  const end = bytes.length - 4;
  view.setUint32(end, bodyChecksum(bytes.subarray(spec.FRAME.BODY, end)), true);
  view.setUint16(spec.FRAME.HEADER_CHECKSUM, headerChecksum(bytes.subarray(0, 6)), true);
  return bytes;
}

const TOKEN = [0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88];

type Harness = {
  session: CollectorSession;
  written: Uint8Array[];
  stored: Uint8Array[][];
  events: SessionEvent[];
};

function harness(options: { failStore?: () => boolean } = {}): Harness {
  const written: Uint8Array[] = [];
  const stored: Uint8Array[][] = [];
  const events: SessionEvent[] = [];

  const session = new CollectorSession({
    transport: {
      write: async (frame) => {
        written.push(frame);
      },
    },
    store: {
      append: async (frames) => {
        if (options.failStore?.()) throw new Error('disk full');
        stored.push([...frames]);
      },
    },
    onEvent: (event) => events.push(event),
    now: () => 1_755_000_000,
  });

  return { session, written, stored, events };
}

function opcodesOf(frames: readonly Uint8Array[]): number[] {
  return frames.map((frame) => {
    const envelope = decodeEnvelope(frame);
    if (!envelope.ok) throw new Error('a written frame does not decode');
    return decodeBodyHeader(envelope.envelope.body)?.opcode ?? -1;
  });
}

async function runBatch(h: Harness, records: readonly [number, number][]): Promise<void> {
  await h.session.receive(metadataFrame(spec.METADATA.HISTORY_START));
  for (const [pulse, at] of records) {
    await h.session.receive(recordFrame(pulse, at));
  }
  await h.session.receive(metadataFrame(spec.METADATA.HISTORY_END, TOKEN));
}

describe('CollectorSession', () => {
  it('asks for history when it starts', async () => {
    const h = harness();
    await h.session.start();

    deepStrictEqual(opcodesOf(h.written), [spec.COMMAND.REQUEST_HISTORY]);
  });

  it('stores a batch before confirming it', async () => {
    const h = harness();
    await h.session.start();
    await runBatch(h, [[58, 1_755_000_000], [59, 1_755_000_001]]);

    deepStrictEqual(h.stored.map((batch) => batch.length), [2]);
    deepStrictEqual(opcodesOf(h.written), [
      spec.COMMAND.REQUEST_HISTORY,
      spec.COMMAND.CONFIRM_HISTORY,
    ]);

    // Order, not just presence. Storing has to happen first.
    const storedFirst = h.events.findIndex((event) => event.kind === 'stored');
    const confirmedAfter = h.events.findIndex((event) => event.kind === 'confirmed');
    ok(storedFirst >= 0 && storedFirst < confirmedAfter);
  });

  it('confirms nothing when storage fails', async () => {
    const h = harness({ failStore: () => true });
    await h.session.start();
    await runBatch(h, [[58, 1_755_000_000]]);

    deepStrictEqual(opcodesOf(h.written), [spec.COMMAND.REQUEST_HISTORY]);
    strictEqual(h.session.state, 'aborted');
    strictEqual(h.session.summary.batchesConfirmed, 0);
  });

  it('reassembles frames split across notifications', async () => {
    const h = harness();
    await h.session.start();
    await h.session.receive(metadataFrame(spec.METADATA.HISTORY_START));

    const frame = recordFrame(60, 1_755_000_000);
    for (let at = 0; at < frame.length; at += 20) {
      await h.session.receive(frame.subarray(at, at + 20));
    }
    await h.session.receive(metadataFrame(spec.METADATA.HISTORY_END, TOKEN));

    deepStrictEqual(h.stored.map((batch) => batch.length), [1]);
  });

  it('recovers a batch that was interrupted by a dropped link', async () => {
    const h = harness();
    await h.session.start();

    await h.session.receive(metadataFrame(spec.METADATA.HISTORY_START));
    await h.session.receive(recordFrame(58, 1_755_000_000));

    h.session.disconnected();
    await h.session.reconnected();

    await runBatch(h, [[58, 1_755_000_000], [59, 1_755_000_001]]);
    await h.session.receive(metadataFrame(spec.METADATA.HISTORY_COMPLETE));

    // The half batch was dropped, the band served it again, and only the
    // complete one was ever stored or confirmed.
    deepStrictEqual(h.stored.map((batch) => batch.length), [2]);
    strictEqual(h.session.state, 'complete');
    strictEqual(h.session.summary.batchesConfirmed, 1);
  });

  it('drives several batches to completion', async () => {
    const h = harness();
    await h.session.start();

    await runBatch(h, [[58, 1_755_000_000], [59, 1_755_000_001]]);
    await runBatch(h, [[60, 1_755_000_002]]);
    await h.session.receive(metadataFrame(spec.METADATA.HISTORY_COMPLETE));

    strictEqual(h.session.state, 'complete');
    strictEqual(h.session.summary.batchesConfirmed, 2);
    strictEqual(h.session.summary.framesStored, 3);
    strictEqual(h.session.summary.recordsDecoded, 3);
  });

  it('collects the reference signal without letting it touch the transfer', async () => {
    const h = harness();
    await h.session.start();

    h.session.receiveReference(Uint8Array.from([0x00, 62]), 1_755_000_000);
    h.session.receiveReference(Uint8Array.from([0x00, 63]), 1_755_000_001);
    h.session.receiveReference(Uint8Array.from([]), 1_755_000_002);

    deepStrictEqual(h.session.summary.reference, [
      { at: 1_755_000_000, bpm: 62 },
      { at: 1_755_000_001, bpm: 63 },
    ]);
    strictEqual(h.session.summary.batchesConfirmed, 0);
  });

  it('serialises notifications so batches cannot interleave', async () => {
    const h = harness();
    await h.session.start();

    // Fired without awaiting, the way a notification handler delivers them.
    const inFlight = [
      h.session.receive(metadataFrame(spec.METADATA.HISTORY_START)),
      h.session.receive(recordFrame(58, 1_755_000_000)),
      h.session.receive(metadataFrame(spec.METADATA.HISTORY_END, TOKEN)),
      h.session.receive(metadataFrame(spec.METADATA.HISTORY_START)),
      h.session.receive(recordFrame(59, 1_755_000_001)),
      h.session.receive(metadataFrame(spec.METADATA.HISTORY_END, TOKEN)),
    ];
    await Promise.all(inFlight);

    deepStrictEqual(h.stored.map((batch) => batch.length), [1, 1]);
    strictEqual(h.session.summary.batchesConfirmed, 2);
  });

  it('hands decoded records to the consumer as each batch is stored', async () => {
    const seen: number[] = [];
    const session = new CollectorSession({
      transport: { write: async () => {} },
      store: { append: async () => {} },
      onRecords: (records) => {
        for (const record of records) seen.push(record.pulse);
      },
    });

    await session.start();
    await session.receive(metadataFrame(spec.METADATA.HISTORY_START));
    await session.receive(recordFrame(58, 1_755_000_000));
    await session.receive(recordFrame(59, 1_755_000_001));
    await session.receive(metadataFrame(spec.METADATA.HISTORY_END, TOKEN));

    // Streamed rather than accumulated: the session keeps none of them.
    deepStrictEqual(seen, [58, 59]);
    deepStrictEqual(Object.keys(session.summary).includes('records'), false);
  });

  it('hands over nothing when the batch was not stored', async () => {
    const seen: number[] = [];
    const session = new CollectorSession({
      transport: { write: async () => {} },
      store: { append: async () => { throw new Error('disk full'); } },
      onRecords: (records) => { for (const record of records) seen.push(record.pulse); },
    });

    await session.start();
    await session.receive(metadataFrame(spec.METADATA.HISTORY_START));
    await session.receive(recordFrame(58, 1_755_000_000));
    await session.receive(metadataFrame(spec.METADATA.HISTORY_END, TOKEN));

    deepStrictEqual(seen, []);
  });

  it('ignores notifications once a session has finished', async () => {
    const h = harness();
    await h.session.start();
    await h.session.receive(metadataFrame(spec.METADATA.HISTORY_COMPLETE));

    await h.session.receive(recordFrame(58, 1_755_000_000));

    strictEqual(h.session.state, 'complete');
    strictEqual(h.session.summary.framesStored, 0);
  });

  it('surfaces a transport failure rather than swallowing it', async () => {
    const session = new CollectorSession({
      transport: { write: async () => { throw new Error('link lost'); } },
      store: { append: async () => {} },
    });

    await rejects(() => session.start(), /link lost/);
  });
});
