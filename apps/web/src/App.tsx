/**
 * The dashboard.
 *
 * Two things it deliberately does not do. It does not show sleep staging,
 * because the sleep-state byte is not established and rule 3 says an
 * unestablished field is never displayed. And it does not present any of this as
 * validated: the API reports its own evidence tier and the page repeats it,
 * because a chart is exactly where a Documented number gets mistaken for a
 * measured one.
 */

import { useEffect, useMemo, useState } from 'react';

import { api, parseTimestamp, type SeriesPoint, type Status } from './api';
import { FrameInspector } from './components/FrameInspector';
import { StatTile } from './components/StatTile';
import { TimeChart, type ChartPoint } from './components/TimeChart';

type Bucket = 'minute' | 'hour' | 'day';

const number = (value: number): string => value.toLocaleString();

export default function App() {
  const [status, setStatus] = useState<Status | null>(null);
  const [points, setPoints] = useState<SeriesPoint[]>([]);
  const [bucket, setBucket] = useState<Bucket>('hour');
  const [day, setDay] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .status()
      .then((result) => {
        setStatus(result);
        // Open on the day that actually has data. The newest day is often a
        // few seconds of a sync in progress, and an empty chart teaches nothing.
        if (day === '') {
          setDay(result.readings.busiest_day ?? result.readings.last_recorded?.slice(0, 10) ?? '');
        }
      })
      .catch((thrown: Error) => setError(thrown.message));
  }, []);

  useEffect(() => {
    if (day === '') return;

    api
      .series(`${day}T00:00:00Z`, `${day}T23:59:59Z`, bucket)
      .then((result) => setPoints(result.points))
      .catch((thrown: Error) => setError(thrown.message));
  }, [day, bucket]);

  const pulse = useMemo<ChartPoint[]>(
    () =>
      points.map((point) => ({
        at: parseTimestamp(point.at),
        value: point.pulse_avg === null ? null : Number(point.pulse_avg),
        low: point.pulse_min,
        high: point.pulse_max,
      })),
    [points],
  );

  const temperature = useMemo<ChartPoint[]>(
    () =>
      points.map((point) => ({
        at: parseTimestamp(point.at),
        value: point.temperature_avg === null ? null : Number(point.temperature_avg),
      })),
    [points],
  );

  return (
    <div className="page">
      <header className="masthead">
        <h1>Aera</h1>
        <p>Your band, your data, your hardware.</p>
      </header>

      {error ? (
        <div className="notice" style={{ borderLeftColor: 'var(--serious)' }}>
          <strong>{error}</strong>
        </div>
      ) : null}

      <div className="notice">
        <strong>Nothing here is verified.</strong> These readings decode against field positions
        published by community reverse engineering and confirmed only as far as checksums and
        physical plausibility allow. Until a decoded pulse is cross-checked against the band's
        standard heart-rate characteristic on real hardware, treat every number as provisional.
        Sleep staging is absent for the same reason: that field's meaning is not established.
      </div>

      <div className="tiles">
        <StatTile
          label="Frames archived"
          value={status ? number(status.frames.total) : '—'}
          note="raw, permanent, the source of truth"
        />
        <StatTile
          label="Readings decoded"
          value={status ? number(status.readings.total) : '—'}
          note="a projection, rebuildable from raw"
        />
        <StatTile
          label="Frames refused"
          value={status ? number(status.frames.undecodable) : '—'}
          note="unknown layout, kept for later"
        />
        <StatTile
          label="Days covered"
          value={status ? number(status.readings.days) : '—'}
          note={status ? `latest ${status.readings.last_recorded?.slice(0, 10) ?? 'none'}` : undefined}
        />
      </div>

      <div className="controls">
        <label htmlFor="day" style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Day</label>
        <input id="day" type="date" value={day} onChange={(event) => setDay(event.target.value)} />
        {(['minute', 'hour', 'day'] as Bucket[]).map((option) => (
          <button key={option} onClick={() => setBucket(option)} aria-pressed={bucket === option}>
            {option}
          </button>
        ))}
        <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>
          {points.length} buckets
        </span>
      </div>

      <section className="card">
        <h2>Pulse</h2>
        <p className="caption">
          Beats per minute. The line is the average within each {bucket}; the band behind it is the
          lowest and highest reading in that {bucket}.
        </p>
        <TimeChart points={pulse} color="var(--series-pulse)" unit="bpm" label="Pulse" />
      </section>

      <section className="card">
        <h2>Skin temperature</h2>
        <p className="caption">
          Degrees Celsius, on its own axis. Two measures of different scale never share one.
        </p>
        <TimeChart
          points={temperature}
          color="var(--series-temperature)"
          unit="C"
          label="Skin temperature"
          format={(value) => value.toFixed(1)}
        />
      </section>

      <FrameInspector />
    </div>
  );
}
