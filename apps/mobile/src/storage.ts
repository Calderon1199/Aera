/**
 * The local buffer.
 *
 * This is what "local-first" means in practice: the phone is a functioning node
 * on its own, not a pipe to a server. Collection continues whether or not the
 * API is reachable, and frames leave here only once the API has confirmed them.
 *
 * The durability settings are not tuning. `append` is what the transfer waits on
 * before telling the band a batch is safe, so if it resolves before the write is
 * on disk, a crash at the wrong moment loses records the band has already
 * forgotten. Hence synchronous FULL, which trades throughput for exactly the
 * guarantee being relied on.
 */

import * as SQLite from 'expo-sqlite';

import type { FrameStore } from '@aera/collector';

import { toBase64 } from './base64.ts';

export type PendingFrame = {
  readonly id: number;
  readonly frame: string;
};

export class FrameBuffer implements FrameStore {
  private constructor(private database: SQLite.SQLiteDatabase) {}

  static async open(name = 'aera.db'): Promise<FrameBuffer> {
    const database = await SQLite.openDatabaseAsync(name);

    await database.execAsync(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = FULL;
      CREATE TABLE IF NOT EXISTS frames (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        frame TEXT NOT NULL,
        received_at INTEGER NOT NULL,
        synced_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS frames_pending ON frames (synced_at);
    `);

    return new FrameBuffer(database);
  }

  /** Durable before it resolves. The transfer's safety depends on that. */
  async append(frames: readonly Uint8Array[]): Promise<void> {
    if (frames.length === 0) return;

    const now = Date.now();

    await this.database.withExclusiveTransactionAsync(async (transaction) => {
      for (const frame of frames) {
        await transaction.runAsync(
          'INSERT INTO frames (frame, received_at) VALUES (?, ?)',
          toBase64(frame),
          now,
        );
      }
    });
  }

  async pending(limit = 500): Promise<PendingFrame[]> {
    return this.database.getAllAsync<PendingFrame>(
      'SELECT id, frame FROM frames WHERE synced_at IS NULL ORDER BY id LIMIT ?',
      limit,
    );
  }

  /**
   * Mark frames as accepted by the API.
   *
   * Only ever called after the API has answered, never optimistically. A frame
   * marked synced that never arrived is a frame nothing will retry.
   */
  async markSynced(ids: readonly number[]): Promise<void> {
    if (ids.length === 0) return;

    const places = ids.map(() => '?').join(',');
    await this.database.runAsync(
      `UPDATE frames SET synced_at = ? WHERE id IN (${places})`,
      Date.now(),
      ...ids,
    );
  }

  async counts(): Promise<{ total: number; pending: number }> {
    const row = await this.database.getFirstAsync<{ total: number; pending: number }>(
      'SELECT COUNT(*) AS total, SUM(CASE WHEN synced_at IS NULL THEN 1 ELSE 0 END) AS pending FROM frames',
    );

    return { total: row?.total ?? 0, pending: row?.pending ?? 0 };
  }
}
