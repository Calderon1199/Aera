/**
 * Talking to the API.
 *
 * The token is read from the environment at build time and never committed. In
 * development Vite proxies /api, so this is always a same-origin call and there
 * is no CORS configuration to get wrong.
 */

const token = import.meta.env.VITE_AERA_TOKEN ?? '';

export type Status = {
  frames: { total: number; undecodable: number; last_received: string | null };
  readings: {
    total: number;
    days: number;
    first_recorded: string | null;
    last_recorded: string | null;
    busiest_day: string | null;
  };
  layouts: { layout_version: number; total: number }[];
  evidence: string;
};

export type SeriesPoint = {
  at: string;
  pulse_avg: string | null;
  pulse_min: number | null;
  pulse_max: number | null;
  temperature_avg: string | null;
  motion_avg: string | null;
  steps: number | null;
  samples: number;
};

export type FrameSummary = {
  id: number;
  content_hash: string;
  device_id: string | null;
  received_at: string;
  decode_error: string | null;
};

export type FrameDetail = {
  frame: {
    id: number;
    content_hash: string;
    received_at: string;
    decode_error: string | null;
    bytes: string;
    length: number;
  };
  reading: Record<string, unknown> | null;
};

async function get<T>(path: string): Promise<T> {
  const response = await fetch(path, {
    headers: { accept: 'application/json', authorization: `Bearer ${token}` },
  });

  if (response.status === 401) {
    throw new Error('The API refused the token. Set VITE_AERA_TOKEN in apps/web/.env');
  }
  if (!response.ok) {
    throw new Error(`${path} answered ${response.status}`);
  }

  return (await response.json()) as T;
}

/**
 * Postgres hands back "2026-04-19 17:00:00+00". That is not ISO 8601: it needs a
 * T, and the offset needs both halves. Left as-is it parses to Invalid Date, and
 * an invalid date becomes NaN coordinates rather than a visible error.
 */
export function parseTimestamp(value: string): Date {
  return new Date(value.replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00'));
}

export const api = {
  status: () => get<Status>('/api/status'),
  series: (from: string, to: string, bucket: 'minute' | 'hour' | 'day') =>
    get<{ bucket: string; points: SeriesPoint[] }>(
      `/api/series?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&bucket=${bucket}`,
    ),
  frames: (only?: 'undecodable') =>
    get<{ frames: FrameSummary[] }>(`/api/frames?limit=40${only ? `&only=${only}` : ''}`),
  frame: (id: number) => get<FrameDetail>(`/api/frames/${id}`),
};
