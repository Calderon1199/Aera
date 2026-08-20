/**
 * The whole adapter, as string in and string out.
 *
 * Kept separate from the process plumbing in cli.ts so that every decision this
 * makes is testable without spawning anything or touching a stream.
 *
 * The wire format is one JSON object per line, in both directions, because a
 * rebuild streams an entire archive through this and an array would have to be
 * held whole at both ends.
 *
 *   in   {"id":"...","frame":"<base64>"}
 *   out  {"id":"...","ok":true,"record":{...}}
 *        {"id":"...","ok":false,"error":"..."}
 */

import { decodeEnvelope, decodeHistoryRecord, verifyEnvelope } from '@aera/protocol';

export type DecodeRequest = {
  readonly id: string;
  /** One raw frame, base64 encoded, exactly as it was archived. */
  readonly frame: string;
};

export type DecodeReply =
  | { readonly id: string; readonly ok: true; readonly record: unknown }
  | { readonly id: string; readonly ok: false; readonly error: string };

/**
 * Decode one line.
 *
 * Every failure is reported against the id it belongs to rather than thrown,
 * because one unreadable frame in an archive must not abort the rebuild of
 * everything after it. A caller that silently treated these as zero rows would
 * be hiding exactly what this is meant to surface, so the reason is always
 * carried back.
 */
export function translate(line: string): string | undefined {
  const trimmed = line.trim();
  if (trimmed === '') return undefined;

  let request: DecodeRequest;
  try {
    request = JSON.parse(trimmed) as DecodeRequest;
  } catch {
    return JSON.stringify({ id: '', ok: false, error: 'malformed request line' });
  }

  return JSON.stringify(decodeOne(request));
}

export function decodeOne(request: DecodeRequest): DecodeReply {
  const { id } = request;

  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(Buffer.from(request.frame, 'base64'));
  } catch {
    return { id, ok: false, error: 'frame is not base64' };
  }

  const envelope = decodeEnvelope(bytes);
  if (!envelope.ok) return { id, ok: false, error: `frame: ${envelope.error.kind}` };

  // An archived frame that no longer satisfies its own checksums is corruption
  // in the archive, not a decoder gap, and the two must not look alike.
  const verdict = verifyEnvelope(envelope.envelope);
  if (!verdict.ok) return { id, ok: false, error: `checksum: ${verdict.failed}` };

  const record = decodeHistoryRecord(envelope.envelope);
  if (!record.ok) return { id, ok: false, error: `record: ${record.error.kind}` };

  return { id, ok: true, record: record.record };
}
