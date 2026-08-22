/**
 * The local buffer, on disk.
 *
 * Same contract as the phone's: `append` must not resolve until the frames are
 * safe against the process dying, because it is what the transfer waits on
 * before telling the band a batch is stored. Hence synchronous FULL, which
 * trades throughput for exactly the guarantee being relied on.
 *
 * SQLite comes with Node, so this adds no dependency at all.
 */

import { DatabaseSync } from 'node:sqlite';

import type { FrameStore as CollectorFrameStore } from '@aera/collector';

export type PendingFrame = {
  readonly id: number;
  readonly frame: string;
};

export class FrameStore implements CollectorFrameStore {
  readonly #database: DatabaseSync;

  constructor(path: string) {
    this.#database = new DatabaseSync(path);

    this.#database.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = FULL;

      -- Collecting and uploading are separate processes on one file, so a
      -- writer has to wait for the other rather than failing outright. Without
      -- this, an upload started during a sync dies on "database is locked".
      PRAGMA busy_timeout = 30000;
      CREATE TABLE IF NOT EXISTS frames (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        frame TEXT NOT NULL,
        received_at INTEGER NOT NULL,
        synced_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS frames_pending ON frames (synced_at);
    `);
  }

  async append(frames: readonly Uint8Array[]): Promise<void> {
    if (frames.length === 0) return;

    const insert = this.#database.prepare(
      'INSERT INTO frames (frame, received_at) VALUES (?, ?)',
    );
    const now = Date.now();

    this.#database.exec('BEGIN');
    try {
      for (const frame of frames) {
        insert.run(Buffer.from(frame).toString('base64'), now);
      }
      this.#database.exec('COMMIT');
    } catch (error) {
      this.#database.exec('ROLLBACK');
      throw error;
    }
  }

  pending(limit = 500): PendingFrame[] {
    return this.#database
      .prepare('SELECT id, frame FROM frames WHERE synced_at IS NULL ORDER BY id LIMIT ?')
      .all(limit) as unknown as PendingFrame[];
  }

  /** Only ever after the API has answered. A frame marked sent is never retried. */
  markSynced(ids: readonly number[]): void {
    if (ids.length === 0) return;

    const places = ids.map(() => '?').join(',');
    this.#database
      .prepare(`UPDATE frames SET synced_at = ? WHERE id IN (${places})`)
      .run(Date.now(), ...ids);
  }

  counts(): { total: number; pending: number } {
    const row = this.#database
      .prepare(
        'SELECT COUNT(*) AS total, COALESCE(SUM(CASE WHEN synced_at IS NULL THEN 1 ELSE 0 END), 0) AS pending FROM frames',
      )
      .get() as { total: number; pending: number };

    return { total: Number(row.total), pending: Number(row.pending) };
  }

  close(): void {
    this.#database.close();
  }
}
