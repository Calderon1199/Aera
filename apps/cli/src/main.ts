#!/usr/bin/env node
/**
 * Sync the band from a Linux laptop.
 *
 * This exists because iOS needs a paid Apple account and the validation does
 * not. Decision record 5 covers the reasoning. It reuses everything: the same
 * decoder, the same transfer, the same session, the same cross-check. Only the
 * Bluetooth binding is new.
 *
 *   aera scan
 *   aera pair --address AA:BB:CC:DD:EE:FF
      Bond with the band. Needed once, before the vendor channels will say anything.

  aera sync --address AA:BB:CC:DD:EE:FF
 *   aera upload --api http://127.0.0.1:8000 --token ...
 */

import { parseArgs } from 'node:util';

import { CollectorSession, compareWithReference, type Comparison, type DecodedSample } from '@aera/collector';
import { spec, type HistoryRecord } from '@aera/protocol';

import { BandLink } from './bluetooth.ts';
import { pair } from './pairing.ts';
import { FrameStore } from './store.ts';
import { upload } from './upload.ts';

const DEFAULT_DB = 'aera.db';

async function main(): Promise<number> {
  const [command] = process.argv.slice(2);

  const { values } = parseArgs({
    args: process.argv.slice(3),
    options: {
      address: { type: 'string' },
      db: { type: 'string', default: DEFAULT_DB },
      api: { type: 'string' },
      token: { type: 'string' },
      seconds: { type: 'string', default: '12' },
      upload: { type: 'boolean', default: false },
    },
    allowPositionals: true,
  });

  switch (command) {
    case 'scan':
      return scan(Number(values.seconds));
    case 'pair':
      return bond(values.address);
    case 'sync':
      return sync(values);
    case 'upload':
      return send(values);
    default:
      usage();
      return command === undefined || command === 'help' ? 0 : 1;
  }
}

function usage(): void {
  console.log(`
  aera scan [--seconds 12]
      List what is nearby. The band is flagged if it advertises the vendor service.

  aera sync --address AA:BB:CC:DD:EE:FF [--db aera.db] [--upload --api URL --token T]
      Drain stored history into the local buffer, reading the standard heart-rate
      characteristic at the same time, then compare the two.

  aera upload --api URL --token T [--db aera.db]
      Send buffered frames to the API. Safe to run repeatedly.
`);
}

async function bond(address?: string): Promise<number> {
  if (address === undefined) {
    console.error('Which band? Run "aera scan" first, then pass --address.');
    return 1;
  }

  console.log(`Bonding with ${address}`);
  const result = await pair(address);

  if (result.paired) {
    console.log('  bonded. The vendor channels will talk now.');
    return 0;
  }

  console.error(`  failed: ${result.detail}`);
  console.error('  Check the band is awake and that no phone is holding it.');
  return 1;
}

async function scan(seconds: number): Promise<number> {
  console.log(`Scanning for ${seconds} seconds. Make sure the band is awake and not syncing with the vendor app.\n`);

  const candidates = await BandLink.scan(seconds);
  if (candidates.length === 0) {
    console.log('Nothing found. Is Bluetooth on?');
    return 1;
  }

  for (const candidate of candidates) {
    const mark = candidate.looksLikeTheBand ? '  <- this is the band' : '';
    console.log(`  ${candidate.address}  ${candidate.name.padEnd(24)}${mark}`);
  }

  const found = candidates.filter((candidate) => candidate.looksLikeTheBand);
  console.log(
    found.length > 0
      ? `\nRun: aera sync --address ${found[0]?.address}`
      : '\nNo device advertised the vendor service. The band may be asleep, out of range, or already connected to the vendor app.',
  );

  return found.length > 0 ? 0 : 1;
}

async function sync(values: {
  address?: string | undefined;
  db?: string | undefined;
  api?: string | undefined;
  token?: string | undefined;
  upload?: boolean | undefined;
}): Promise<number> {
  if (values.address === undefined) {
    console.error('Which band? Run "aera scan" first, then pass --address.');
    return 1;
  }

  const store = new FrameStore(values.db ?? DEFAULT_DB);
  const link = new BandLink();
  const decoded: DecodedSample[] = [];
  const startedAt = Math.floor(Date.now() / 1000);

  let finished = false;
  let lastActivity = Date.now();
  let connected = false;

  const session = new CollectorSession({
    transport: link.transport(),
    store,
    onRecords: (records) => keepComparable(decoded, records, startedAt),
    onEvent: (event) => {
      lastActivity = Date.now();

      switch (event.kind) {
        case 'requested':
          console.log('  asked for history, waiting for the first batch');
          break;
        case 'stored':
          process.stdout.write(`\r  batch ${event.batch}: ${event.frames} frames stored   `);
          break;
        case 'confirmed':
          process.stdout.write(`\r  batch ${event.batch}: confirmed              `);
          break;
        case 'complete':
          finished = true;
          console.log(`\n  finished: ${event.batches} batches, ${event.records} records`);
          break;
        case 'aborted':
          finished = true;
          console.log(`\n  aborted: ${event.reason}`);
          break;
        case 'reference':
          break;
      }
    },
  });

  /**
   * Keep going across dropped links.
   *
   * The band drops the connection every so often, and a fortnight of history
   * takes far longer than it stays up. Reconnecting is safe because the cursor
   * only advanced for batches that were confirmed, so the band re-serves
   * whatever was in flight, and the archive deduplicates the repeats.
   */
  let attempt = 0;
  const maxAttempts = 200;

  while (!finished && attempt < maxAttempts) {
    try {
      console.log(attempt === 0 ? `Connecting to ${values.address}` : `  reconnecting (attempt ${attempt})`);

      await link.connect(values.address, {
        onFrames: (chunk) => void session.receive(chunk),
        onReference: (chunk) => session.receiveReference(chunk),
        onDisconnect: () => {
          connected = false;
          session.disconnected();
        },
      });

      connected = true;
      lastActivity = Date.now();

      // The session opener, every time. A reconnected link is a new session as
      // far as the band is concerned.
      await link.transport().write(spec.OPENING_FRAME);

      if (attempt === 0) {
        console.log('Connected. Reading the reference signal while history drains.\n');
        await session.start();
      } else {
        await session.reconnected();
      }

      await waitFor(() => finished || !connected, () => lastActivity, 10 * 60 * 1000);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(`\n  link trouble: ${message}`);
      if (process.env.AERA_DEBUG === '1' && error instanceof Error) console.error(error.stack);
    }

    if (finished) break;

    await link.disconnect().catch(() => undefined);
    attempt += 1;

    if (attempt < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }

  if (!finished) {
    console.log(`\n  stopped after ${attempt} reconnection attempts. Everything received is stored.`);
  }

  await link.disconnect();

  const summary = session.summary;
  console.log(`\n  reference samples collected: ${summary.reference.length}`);
  console.log(`  frames buffered locally:     ${store.counts().total}`);

  report(compareWithReference(decoded, summary.reference, { searchOffsetSeconds: 30, minimumOverlap: 10 }));

  if (values.upload === true) {
    await send({ ...values, db: values.db });
  }

  store.close();
  return 0;
}

async function send(values: {
  db?: string | undefined;
  api?: string | undefined;
  token?: string | undefined;
}): Promise<number> {
  if (values.api === undefined || values.token === undefined) {
    console.error('Uploading needs --api and --token.');
    return 1;
  }

  const store = new FrameStore(values.db ?? DEFAULT_DB);

  try {
    const result = await upload(store, {
      apiUrl: values.api,
      token: values.token,
      deviceId: 'laptop',
    });

    console.log(
      `\n  uploaded ${result.sent} frames: ${result.stored} new, ${result.duplicates} already held, ${result.remaining} still waiting`,
    );
    return 0;
  } catch (error) {
    console.error(`\n  upload failed: ${error instanceof Error ? error.message : String(error)}`);
    console.error('  The frames are still buffered locally. Nothing is lost.');
    return 1;
  } finally {
    store.close();
  }
}

/** The verdict this whole project has been arranged around. */
function report(comparison: Comparison): void {
  const skew =
    comparison.offsetSeconds === 0
      ? ''
      : ` after correcting a ${comparison.offsetSeconds} second clock offset`;

  console.log('');

  if (comparison.verdict === 'agree') {
    console.log(`  AGREES WITH THE REFERENCE`);
    console.log(`  All ${comparison.compared} overlapping samples matched${skew}.`);
    console.log('  This is the only real evidence the field positions are right on your firmware.');
    return;
  }

  if (comparison.verdict === 'disagree') {
    console.log(`  DISAGREES WITH THE REFERENCE`);
    console.log(`  ${comparison.agreed} of ${comparison.compared} matched${skew}.`);
    console.log('  The decoded data should not be trusted. The offsets are wrong for this firmware.');

    for (const problem of comparison.disagreements.slice(0, 5)) {
      console.log(`    at ${new Date(problem.at * 1000).toISOString()}: decoded ${problem.pulse}, reference ${problem.bpm}`);
    }
    return;
  }

  console.log('  NOT ENOUGH OVERLAP TO SAY');
  console.log(`  Only ${comparison.compared} samples could be compared.`);
  console.log('  Wear the band for a few minutes, then sync again so the two windows overlap.');
}

/**
 * Keep only records the reference could possibly cover.
 *
 * A fortnight of per-second records will not fit in memory and does not need to:
 * the reference signal only exists for however long this run has been going.
 */
function keepComparable(into: DecodedSample[], records: readonly HistoryRecord[], since: number): void {
  const now = Math.floor(Date.now() / 1000);

  for (const record of records) {
    if (record.timestamp >= since - 60 && record.timestamp <= now + 60) {
      into.push({ at: record.timestamp, pulse: record.pulse });
    }
  }
}

function waitFor(
  done: () => boolean,
  lastActivity: () => number,
  idleTimeoutMs: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setInterval(() => {
      if (done()) {
        clearInterval(timer);
        resolve();
        return;
      }

      if (Date.now() - lastActivity() > idleTimeoutMs) {
        clearInterval(timer);
        reject(
          new Error(
            `the band sent nothing for ${idleTimeoutMs / 60000} minutes. Whatever it did send is stored`,
          ),
        );
      }
    }, 250);
  });
}

process.exitCode = await main();
