/**
 * The collector, as one screen.
 *
 * Deliberately plain. Everything interesting happens in packages/collector,
 * which is tested without a phone; this is the shell that binds Bluetooth,
 * storage and the network to it, and shows what happened.
 *
 * The verdict at the bottom is the point of the whole milestone. It compares
 * what was decoded from stored history against the standard heart-rate
 * characteristic read live over the same window. Until that says agree, nothing
 * in this project is Verified.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { CollectorSession, compareWithReference, type Comparison, type DecodedSample } from '@aera/collector';
import type { HistoryRecord } from '@aera/protocol';

import { BandLink } from './src/bluetooth.ts';
import { config, configured } from './src/config.ts';
import { FrameBuffer } from './src/storage.ts';
import { syncPending } from './src/sync.ts';

type Progress = {
  status: string;
  batches: number;
  frames: number;
  records: number;
  reference: number;
  pending: number;
};

const EMPTY: Progress = { status: 'Idle', batches: 0, frames: 0, records: 0, reference: 0, pending: 0 };

export default function App() {
  const [progress, setProgress] = useState<Progress>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [comparison, setComparison] = useState<Comparison | undefined>();
  const [error, setError] = useState<string | undefined>();

  const link = useRef<BandLink | undefined>(undefined);
  const decoded = useRef<DecodedSample[]>([]);

  const sync = useCallback(async () => {
    setBusy(true);
    setError(undefined);
    setComparison(undefined);
    decoded.current = [];

    const band = new BandLink();
    link.current = band;

    try {
      const buffer = await FrameBuffer.open();
      setProgress({ ...EMPTY, status: 'Looking for the band' });

      const session = new CollectorSession({
        transport: band.transport(),
        store: buffer,
        onRecords: (records) => keepOverlapping(decoded.current, records),
        onEvent: (event) => {
          setProgress((current) => reduce(current, event));
        },
      });

      await band.connect({
        onFrames: (chunk) => void session.receive(chunk),
        onReference: (chunk) => session.receiveReference(chunk),
        onDisconnect: () => session.disconnected(),
      });

      setProgress((current) => ({ ...current, status: 'Connected, asking for history' }));
      await session.start();

      await waitUntil(() => session.state === 'complete' || session.state === 'aborted');

      const summary = session.summary;
      const counts = await buffer.counts();

      setProgress((current) => ({
        ...current,
        status: session.state === 'complete' ? 'Sync finished' : 'Sync aborted',
        pending: counts.pending,
      }));

      // The cross-check. Only the reference samples collected during this
      // session count, because only those were observed independently.
      setComparison(
        compareWithReference(decoded.current, summary.reference, {
          searchOffsetSeconds: 30,
          minimumOverlap: 10,
        }),
      );
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : String(thrown));
      setProgress((current) => ({ ...current, status: 'Stopped' }));
    } finally {
      await band.disconnect();
      band.destroy();
      setBusy(false);
    }
  }, []);

  const upload = useCallback(async () => {
    setBusy(true);
    setError(undefined);

    try {
      const buffer = await FrameBuffer.open();
      const result = await syncPending(buffer, 'phone');

      setProgress((current) => ({
        ...current,
        status: `Uploaded ${result.sent}, ${result.duplicates} already held`,
        pending: result.remaining,
      }));
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : String(thrown));
    } finally {
      setBusy(false);
    }
  }, []);

  const verdict = useMemo(() => describe(comparison), [comparison]);

  return (
    <View style={styles.screen}>
      <StatusBar style="auto" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Aera</Text>
        <Text style={styles.subtitle}>Your band, your data, your hardware.</Text>

        <Text style={styles.status}>{progress.status}</Text>
        {busy ? <ActivityIndicator style={styles.spinner} /> : null}

        <View style={styles.rows}>
          <Row label="Batches confirmed" value={progress.batches} />
          <Row label="Frames stored" value={progress.frames} />
          <Row label="Records decoded" value={progress.records} />
          <Row label="Reference samples" value={progress.reference} />
          <Row label="Waiting to upload" value={progress.pending} />
        </View>

        {comparison ? (
          <View style={[styles.verdict, verdict.style]}>
            <Text style={styles.verdictTitle}>{verdict.title}</Text>
            <Text style={styles.verdictBody}>{verdict.body}</Text>
          </View>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Button label="Sync from band" onPress={sync} disabled={busy} />
        <Button
          label={configured() ? 'Upload to server' : 'Server not configured'}
          onPress={upload}
          disabled={busy || !configured()}
        />

        {configured() ? <Text style={styles.hint}>{config.apiUrl}</Text> : null}
      </ScrollView>
    </View>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

function Button({ label, onPress, disabled }: { label: string; onPress: () => void; disabled: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.button, disabled && styles.buttonOff, pressed && styles.buttonDown]}
    >
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

/**
 * Keep only what the cross-check can use.
 *
 * A fortnight of records will not fit in memory and does not need to: the
 * reference signal only exists for the minutes this session has been running,
 * so records outside that window can never be compared against anything.
 */
function keepOverlapping(into: DecodedSample[], records: readonly HistoryRecord[]): void {
  const now = Math.floor(Date.now() / 1000);
  const oldest = now - 6 * 60 * 60;

  for (const record of records) {
    if (record.timestamp >= oldest && record.timestamp <= now + 60) {
      into.push({ at: record.timestamp, pulse: record.pulse });
    }
  }
}

function reduce(current: Progress, event: Parameters<NonNullable<ConstructorParameters<typeof CollectorSession>[0]['onEvent']>>[0]): Progress {
  switch (event.kind) {
    case 'requested':
      return { ...current, status: 'Waiting for the first batch' };
    case 'stored':
      return { ...current, status: `Stored batch ${event.batch}`, frames: current.frames + event.frames };
    case 'confirmed':
      return { ...current, batches: current.batches + 1 };
    case 'reference':
      return { ...current, reference: current.reference + 1 };
    case 'complete':
      return { ...current, status: 'Sync finished', records: event.records };
    case 'aborted':
      return { ...current, status: `Aborted: ${event.reason}` };
  }
}

function describe(comparison: Comparison | undefined) {
  if (comparison === undefined) return { title: '', body: '', style: styles.unknown };

  const skew = comparison.offsetSeconds === 0 ? '' : ` after correcting a ${comparison.offsetSeconds}s clock offset`;

  if (comparison.verdict === 'agree') {
    return {
      title: 'Agrees with the reference',
      body: `All ${comparison.compared} overlapping samples matched${skew}. This is the only real evidence the field positions are right on your firmware.`,
      style: styles.agree,
    };
  }

  if (comparison.verdict === 'disagree') {
    return {
      title: 'Disagrees with the reference',
      body: `${comparison.agreed} of ${comparison.compared} matched${skew}. A decoded pulse that does not match the standard characteristic means the offsets are wrong for this firmware. Do not trust the decoded data.`,
      style: styles.disagree,
    };
  }

  return {
    title: 'Not enough overlap to say',
    body: `Only ${comparison.compared} samples could be compared. Wear the band and sync again after a few minutes so the two overlap.`,
    style: styles.unknown,
  };
}

function waitUntil(done: () => boolean, timeoutMs = 30 * 60 * 1000): Promise<void> {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const timer = setInterval(() => {
      if (done()) {
        clearInterval(timer);
        resolve();
        return;
      }

      if (Date.now() - startedAt > timeoutMs) {
        clearInterval(timer);
        reject(new Error('the transfer stopped making progress'));
      }
    }, 250);
  });
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0f1115' },
  content: { padding: 24, paddingTop: 72, gap: 12 },
  title: { color: '#f5f7fa', fontSize: 34, fontWeight: '700' },
  subtitle: { color: '#8b93a1', fontSize: 15, marginBottom: 12 },
  status: { color: '#c8d0dc', fontSize: 16 },
  spinner: { alignSelf: 'flex-start' },
  rows: { marginVertical: 12, gap: 6 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  rowLabel: { color: '#8b93a1', fontSize: 15 },
  rowValue: { color: '#f5f7fa', fontSize: 15, fontVariant: ['tabular-nums'] },
  verdict: { borderRadius: 10, padding: 16, marginVertical: 8, borderLeftWidth: 4 },
  verdictTitle: { fontSize: 17, fontWeight: '600', marginBottom: 6, color: '#f5f7fa' },
  verdictBody: { fontSize: 14, lineHeight: 20, color: '#c8d0dc' },
  agree: { backgroundColor: '#122a1c', borderLeftColor: '#3fa96a' },
  disagree: { backgroundColor: '#2c1417', borderLeftColor: '#d05a68' },
  unknown: { backgroundColor: '#1b1f27', borderLeftColor: '#6b7488' },
  error: { color: '#d05a68', fontSize: 14, marginVertical: 8 },
  button: { backgroundColor: '#2a63d8', borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 10 },
  buttonOff: { backgroundColor: '#2a3040' },
  buttonDown: { opacity: 0.8 },
  buttonText: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
  hint: { color: '#5d6577', fontSize: 12, textAlign: 'center', marginTop: 8 },
});
