const { test } = require('node:test');
const assert = require('node:assert');
const b = require('../src/lib/businessDate');

const tz = 'America/New_York';

// Build a UTC-midnight Date offset from today's local calendar date.
function dayOffset(off) {
  const today = b.localDateStr(tz);
  const y = parseInt(today.slice(0, 4));
  const m = parseInt(today.slice(5, 7));
  const d = parseInt(today.slice(8, 10));
  return new Date(Date.UTC(y, m - 1, d + off));
}

test('calendarDate returns UTC midnight of the given date', () => {
  assert.strictEqual(b.calendarDate(2026, 7, 4).toISOString(), '2026-07-04T00:00:00.000Z');
});

test('dateStr extracts the calendar date of a stored value', () => {
  assert.strictEqual(b.dateStr(new Date('2026-07-01T00:00:00.000Z')), '2026-07-01');
});

test('localToday is UTC midnight of the local calendar date', () => {
  assert.match(b.localToday(tz).toISOString(), /T00:00:00\.000Z$/);
  assert.strictEqual(b.dateStr(b.localToday(tz)), b.localDateStr(tz));
});

test('localDayBounds spans exactly one day', () => {
  const { start, end } = b.localDayBounds(tz);
  assert.strictEqual(end.getTime() - start.getTime(), 24 * 60 * 60 * 1000);
});

test('coverageActiveNow: all-day coverage for today is active', () => {
  assert.strictEqual(
    b.coverageActiveNow({ startDate: dayOffset(0), endDate: dayOffset(0), startTime: '00:00', endTime: '23:59' }, tz),
    true
  );
});

test('coverageActiveNow: future coverage is not active', () => {
  assert.strictEqual(
    b.coverageActiveNow({ startDate: dayOffset(2), endDate: dayOffset(3), startTime: '00:00', endTime: '23:59' }, tz),
    false
  );
});

test('coverageActiveNow: past coverage is not active', () => {
  assert.strictEqual(
    b.coverageActiveNow({ startDate: dayOffset(-3), endDate: dayOffset(-1), startTime: '00:00', endTime: '23:59' }, tz),
    false
  );
});

test('coverageActiveNow: a multi-day span covering today is active', () => {
  assert.strictEqual(
    b.coverageActiveNow({ startDate: dayOffset(-1), endDate: dayOffset(1), startTime: '00:00', endTime: '23:59' }, tz),
    true
  );
});
