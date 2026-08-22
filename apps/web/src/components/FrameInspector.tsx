/**
 * The raw-frame inspector.
 *
 * It earns its place twice over: it is how a decoding problem gets diagnosed,
 * and it is the only place the archive is visible as what it actually is, which
 * is bytes the band sent rather than an architectural claim about permanence.
 *
 * The frames worth looking at first are the ones that failed, so they can be
 * listed alone.
 */

import { useEffect, useState } from 'react';

import { api, type FrameDetail, type FrameSummary } from '../api';

/** Colour the envelope: marker, then the header the first checksum covers. */
function HexDump({ hex }: { hex: string }) {
  const bytes = hex.match(/../g) ?? [];

  return (
    <div className="hex">
      {bytes.map((byte, index) => (
        <span
          key={index}
          className={index === 0 ? 'marker' : index < 8 ? 'header' : undefined}
        >
          {byte}{(index + 1) % 16 === 0 ? <br /> : ' '}
        </span>
      ))}
    </div>
  );
}

export function FrameInspector() {
  const [frames, setFrames] = useState<FrameSummary[]>([]);
  const [only, setOnly] = useState<'all' | 'undecodable'>('all');
  const [selected, setSelected] = useState<FrameDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .frames(only === 'undecodable' ? 'undecodable' : undefined)
      .then((result) => setFrames(result.frames))
      .catch((thrown: Error) => setError(thrown.message));
  }, [only]);

  return (
    <section className="card">
      <h2>Raw frames</h2>
      <p className="caption">
        Every frame exactly as the band sent it. Decoded rows are a projection of these and can be
        rebuilt from them at any time.
      </p>

      <div className="controls">
        <button onClick={() => setOnly('all')} aria-pressed={only === 'all'}>All</button>
        <button onClick={() => setOnly('undecodable')} aria-pressed={only === 'undecodable'}>
          Refused only
        </button>
      </div>

      {error ? <p style={{ color: 'var(--serious)' }}>{error}</p> : null}

      <div className="scroller" style={{ maxHeight: 320, overflowY: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>Received</th>
              <th>Hash</th>
              <th>Source</th>
              <th>State</th>
            </tr>
          </thead>
          <tbody>
            {frames.map((frame) => (
              <tr
                key={frame.id}
                className="selectable"
                onClick={() => {
                  setSelected(null);
                  api.frame(frame.id).then(setSelected).catch((e: Error) => setError(e.message));
                }}
              >
                <td>{new Date(frame.received_at).toLocaleString()}</td>
                <td style={{ fontFamily: 'ui-monospace, monospace' }}>{frame.content_hash}</td>
                <td>{frame.device_id ?? 'unknown'}</td>
                <td>
                  {frame.decode_error === null
                    ? <span className="pill">decoded</span>
                    : <span className="pill warn">{frame.decode_error}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected ? (
        <div style={{ marginTop: 18, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
          <h2 style={{ fontSize: 15 }}>
            Frame {selected.frame.id} · {selected.frame.length} bytes
          </h2>
          <p className="caption">
            The first byte is the marker; the next seven are the header its checksum covers.
          </p>
          <HexDump hex={selected.frame.bytes} />

          {selected.reading === null ? (
            <p style={{ color: 'var(--warning)', fontSize: 14 }}>
              Not decoded: {selected.frame.decode_error ?? 'no reason recorded'}. The bytes are kept, so
              a later decoder can read them.
            </p>
          ) : (
            <div className="scroller" style={{ marginTop: 14 }}>
              <table>
                <tbody>
                  {Object.entries(selected.reading)
                    .filter(([key]) => !['id', 'raw_frame_id', 'unverified'].includes(key))
                    .map(([key, value]) => (
                      <tr key={key}>
                        <th style={{ width: 200 }}>{key.replaceAll('_', ' ')}</th>
                        <td>{value === null ? '—' : JSON.stringify(value)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}
