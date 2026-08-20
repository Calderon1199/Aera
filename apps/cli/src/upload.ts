/**
 * Sending buffered frames to the API.
 *
 * Frames go up raw. The API decodes what it stores, so the archive never depends
 * on whichever machine happened to collect it.
 */

import type { FrameStore } from './store.ts';

export type UploadResult = {
  readonly sent: number;
  readonly stored: number;
  readonly duplicates: number;
  readonly remaining: number;
};

export async function upload(
  store: FrameStore,
  options: { apiUrl: string; token: string; deviceId: string },
): Promise<UploadResult> {
  let sent = 0;
  let stored = 0;
  let duplicates = 0;

  for (;;) {
    const batch = store.pending();
    if (batch.length === 0) break;

    const response = await fetch(`${options.apiUrl}/api/ingest`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        authorization: `Bearer ${options.token}`,
      },
      body: JSON.stringify({
        device_id: options.deviceId,
        frames: batch.map((row) => row.frame),
      }),
    });

    if (!response.ok) {
      throw new Error(`ingest refused with ${response.status}: ${await response.text()}`);
    }

    const summary = (await response.json()) as { stored?: number; duplicates?: number };

    // Only now, and never optimistically.
    store.markSynced(batch.map((row) => row.id));

    sent += batch.length;
    stored += summary.stored ?? 0;
    duplicates += summary.duplicates ?? 0;
  }

  return { sent, stored, duplicates, remaining: store.counts().pending };
}
