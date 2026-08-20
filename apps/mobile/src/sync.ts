/**
 * Sending buffered frames to the API.
 *
 * Opportunistic by design: if the API is unreachable this fails quietly and the
 * frames stay buffered, because collection must not depend on the server being
 * up. Nothing is marked synced until the API has answered.
 *
 * Frames go up raw. The phone decodes for its own display, but the API decodes
 * what it stores, so the archive never depends on a device that may be replaced.
 */

import { config } from './config.ts';
import type { FrameBuffer } from './storage.ts';

export type SyncResult = {
  readonly sent: number;
  readonly stored: number;
  readonly duplicates: number;
  readonly remaining: number;
};

export async function syncPending(buffer: FrameBuffer, deviceId: string): Promise<SyncResult> {
  let sent = 0;
  let stored = 0;
  let duplicates = 0;

  for (;;) {
    const batch = await buffer.pending();
    if (batch.length === 0) break;

    const response = await fetch(`${config.apiUrl}/api/ingest`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        authorization: `Bearer ${config.ingestToken}`,
      },
      body: JSON.stringify({
        device_id: deviceId,
        frames: batch.map((row) => row.frame),
      }),
    });

    if (!response.ok) {
      throw new Error(`ingest refused with ${response.status}`);
    }

    const summary = (await response.json()) as { stored?: number; duplicates?: number };

    // Only now. A frame marked synced that never arrived is a frame nothing
    // will ever retry.
    await buffer.markSynced(batch.map((row) => row.id));

    sent += batch.length;
    stored += summary.stored ?? 0;
    duplicates += summary.duplicates ?? 0;
  }

  const counts = await buffer.counts();

  return { sent, stored, duplicates, remaining: counts.pending };
}
