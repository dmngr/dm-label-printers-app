import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseUtcTimestamp } from './utc-timestamp.ts';

test('legacy UTC job times stay UTC across summer/winter browser timezones', () => {
  const previous = process.env.TZ;
  try {
    for (const zone of ['Europe/Athens', 'America/New_York', 'UTC']) {
      process.env.TZ = zone;
      assert.equal(parseUtcTimestamp('2026-10-06T18:25:18.5112765'), Date.UTC(2026, 9, 6, 18, 25, 18, 511));
      assert.equal(parseUtcTimestamp('2026-01-15T08:00:00'), Date.UTC(2026, 0, 15, 8));
      assert.equal(parseUtcTimestamp('2026-07-15T08:00:00'), Date.UTC(2026, 6, 15, 8));
    }
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});

test('explicit timezone offsets keep their instant and invalid values stay invalid', () => {
  const expected = Date.UTC(2026, 9, 6, 18, 25, 18, 511);
  for (const timestamp of ['2026-10-06T18:25:18.511Z', '2026-10-06T21:25:18.511+03:00', '2026-10-06T14:25:18.511-04:00']) {
    assert.equal(parseUtcTimestamp(timestamp), expected);
  }
  assert.equal(parseUtcTimestamp(' 2026-10-06T18:25:18.511 '), expected);
  for (const timestamp of [null, undefined, '', ' ', 'not-a-date']) assert.ok(Number.isNaN(parseUtcTimestamp(timestamp)));
});
