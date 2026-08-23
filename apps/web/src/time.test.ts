import { strictEqual } from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseTimestamp } from './time.ts';

describe('parseTimestamp', () => {
  it('reads what Postgres actually sends', () => {
    strictEqual(parseTimestamp('2026-04-19 17:00:00+00').toISOString(), '2026-04-19T17:00:00.000Z');
  });

  it('does not produce an invalid date, which is how this failed before', () => {
    strictEqual(Number.isNaN(parseTimestamp('2026-04-19 17:00:00+00').getTime()), false);
  });

  it('keeps an offset that is already complete', () => {
    strictEqual(parseTimestamp('2026-04-19 17:00:00+02:00').toISOString(), '2026-04-19T15:00:00.000Z');
  });

  it('handles a negative offset', () => {
    strictEqual(parseTimestamp('2026-04-19 12:00:00-05').toISOString(), '2026-04-19T17:00:00.000Z');
  });

  it('accepts proper ISO unchanged', () => {
    strictEqual(parseTimestamp('2026-04-19T17:00:00Z').toISOString(), '2026-04-19T17:00:00.000Z');
  });
});
