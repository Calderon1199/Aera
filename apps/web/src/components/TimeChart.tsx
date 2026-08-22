/**
 * One measure over time.
 *
 * Deliberately one measure. Two series on two scales in one frame is the single
 * most misleading thing a dashboard can do, so pulse and temperature get a chart
 * each rather than a shared axis with two meanings.
 *
 * The band behind the line is the minimum and maximum within each bucket. A mean
 * alone hides exactly the excursions a reader is looking for, and drawing the
 * spread keeps the aggregation honest about what it threw away.
 */

import { useMemo, useRef, useState } from 'react';

export type ChartPoint = {
  at: Date;
  value: number | null;
  low?: number | null;
  high?: number | null;
};

type Props = {
  points: ChartPoint[];
  color: string;
  unit: string;
  label: string;
  /** Formats the value in the tooltip and the axis. */
  format?: (value: number) => string;
};

const WIDTH = 900;
const HEIGHT = 220;
const PAD = { top: 12, right: 16, bottom: 26, left: 44 };

export function TimeChart({ points, color, unit, label, format = (v) => v.toFixed(0) }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const svg = useRef<SVGSVGElement>(null);

  const drawn = useMemo(() => points.filter((p) => p.value !== null), [points]);

  const scale = useMemo(() => {
    if (drawn.length === 0) return null;

    const times = drawn.map((p) => p.at.getTime());
    const values = drawn.flatMap((p) => [p.value ?? 0, p.low ?? p.value ?? 0, p.high ?? p.value ?? 0]);

    const t0 = Math.min(...times);
    const t1 = Math.max(...times);
    const lo = Math.min(...values);
    const hi = Math.max(...values);
    const pad = (hi - lo) * 0.12 || 1;

    const x = (t: number) =>
      PAD.left + ((t - t0) / Math.max(t1 - t0, 1)) * (WIDTH - PAD.left - PAD.right);
    const y = (v: number) =>
      HEIGHT - PAD.bottom - ((v - lo + pad) / (hi - lo + pad * 2)) * (HEIGHT - PAD.top - PAD.bottom);

    return { x, y, t0, t1, lo: lo - pad, hi: hi + pad };
  }, [drawn]);

  if (scale === null) {
    return <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>No readings in this window.</p>;
  }

  const line = drawn
    .map((p, index) => `${index === 0 ? 'M' : 'L'}${scale.x(p.at.getTime()).toFixed(1)},${scale.y(p.value as number).toFixed(1)}`)
    .join(' ');

  const hasBand = drawn.some((p) => p.low != null && p.high != null);
  const band = hasBand
    ? [
        ...drawn.map((p, i) => `${i === 0 ? 'M' : 'L'}${scale.x(p.at.getTime()).toFixed(1)},${scale.y(p.high ?? (p.value as number)).toFixed(1)}`),
        ...[...drawn].reverse().map((p) => `L${scale.x(p.at.getTime()).toFixed(1)},${scale.y(p.low ?? (p.value as number)).toFixed(1)}`),
        'Z',
      ].join(' ')
    : '';

  const ticks = [scale.lo, (scale.lo + scale.hi) / 2, scale.hi];
  const active = hover === null ? null : drawn[hover];

  const onMove = (event: React.MouseEvent<SVGSVGElement>) => {
    const rect = svg.current?.getBoundingClientRect();
    if (!rect) return;

    const px = ((event.clientX - rect.left) / rect.width) * WIDTH;
    let nearest = 0;
    let best = Infinity;
    drawn.forEach((p, index) => {
      const distance = Math.abs(scale.x(p.at.getTime()) - px);
      if (distance < best) { best = distance; nearest = index; }
    });
    setHover(nearest);
  };

  return (
    <figure style={{ margin: 0, position: 'relative' }}>
      <svg
        ref={svg}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        width="100%"
        height={HEIGHT}
        role="img"
        aria-label={`${label} over time, in ${unit}`}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        {ticks.map((value) => (
          <g key={value}>
            <line
              x1={PAD.left} x2={WIDTH - PAD.right}
              y1={scale.y(value)} y2={scale.y(value)}
              stroke="var(--grid)" strokeWidth={1}
            />
            <text x={PAD.left - 8} y={scale.y(value) + 4} textAnchor="end" fontSize={11} fill="var(--text-muted)">
              {format(value)}
            </text>
          </g>
        ))}

        <text x={PAD.left} y={HEIGHT - 8} fontSize={11} fill="var(--text-muted)">
          {new Date(scale.t0).toLocaleString()}
        </text>
        <text x={WIDTH - PAD.right} y={HEIGHT - 8} fontSize={11} fill="var(--text-muted)" textAnchor="end">
          {new Date(scale.t1).toLocaleString()}
        </text>

        {hasBand ? <path d={band} fill={color} opacity={0.14} /> : null}
        <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

        {active ? (
          <g>
            <line
              x1={scale.x(active.at.getTime())} x2={scale.x(active.at.getTime())}
              y1={PAD.top} y2={HEIGHT - PAD.bottom}
              stroke="var(--text-muted)" strokeWidth={1} strokeDasharray="3 3"
            />
            <circle
              cx={scale.x(active.at.getTime())} cy={scale.y(active.value as number)}
              r={4.5} fill={color} stroke="var(--surface-1)" strokeWidth={2}
            />
          </g>
        ) : null}
      </svg>

      {active ? (
        <div
          style={{
            position: 'absolute', top: 0,
            left: `calc(${((scale.x(active.at.getTime()) / WIDTH) * 100).toFixed(2)}% + 8px)`,
            background: 'var(--surface-2)', border: '1px solid var(--border)',
            borderRadius: 8, padding: '6px 10px', fontSize: 12.5, pointerEvents: 'none',
            color: 'var(--text-primary)', whiteSpace: 'nowrap',
          }}
        >
          <strong>{format(active.value as number)} {unit}</strong>
          {active.low != null && active.high != null ? (
            <span style={{ color: 'var(--text-secondary)' }}> · {format(active.low)} to {format(active.high)}</span>
          ) : null}
          <div style={{ color: 'var(--text-secondary)' }}>{active.at.toLocaleString()}</div>
        </div>
      ) : null}
    </figure>
  );
}
