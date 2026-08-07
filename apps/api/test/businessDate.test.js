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

// ── Coverage windows ──────────────────────────────────────────────────────
// Coverage carries start/end TIMES, not just dates. Ignoring them made the
// dashboard show a window beginning tonight at 19:00 as already "in effect"
// at 16:00 the same day, disagreeing with the notification routing.
//
// These pin "now" to a fixed instant so the assertions never depend on when
// the suite happens to run.

// 2026-08-07 16:14 America/New_York (EDT, UTC-4).
const NOW = new Date('2026-08-07T20:14:00.000Z');
const D = (s) => new Date(`${s}T00:00:00.000Z`);

test('the reported case: a window starting tonight is not active this afternoon', () => {
  const psy = { startDate: D('2026-08-07'), startTime: '19:00', endDate: D('2026-08-10'), endTime: '06:30' };
  assert.strictEqual(b.coverageStatusNow(psy, tz, NOW), 'upcoming');
  assert.strictEqual(b.coverageActiveNow(psy, tz, NOW), false);
});

test('the same window is active once its start time passes', () => {
  const psy = { startDate: D('2026-08-07'), startTime: '19:00', endDate: D('2026-08-10'), endTime: '06:30' };
  const evening = new Date('2026-08-07T23:30:00.000Z'); // 19:30 EDT
  assert.strictEqual(b.coverageStatusNow(psy, tz, evening), 'active');
});

test('a multi-day window is active on the days in between', () => {
  const psy = { startDate: D('2026-08-07'), startTime: '19:00', endDate: D('2026-08-10'), endTime: '06:30' };
  const saturday = new Date('2026-08-08T18:00:00.000Z'); // Aug 8, 14:00 EDT
  assert.strictEqual(b.coverageStatusNow(psy, tz, saturday), 'active');
});

test('a window is past once its end time passes on the final day', () => {
  const psy = { startDate: D('2026-08-07'), startTime: '19:00', endDate: D('2026-08-10'), endTime: '06:30' };
  const beforeEnd = new Date('2026-08-10T10:00:00.000Z'); // Aug 10, 06:00 EDT
  const afterEnd  = new Date('2026-08-10T11:00:00.000Z'); // Aug 10, 07:00 EDT
  assert.strictEqual(b.coverageStatusNow(psy, tz, beforeEnd), 'active');
  assert.strictEqual(b.coverageStatusNow(psy, tz, afterEnd), 'past');
});

test('a same-day window respects both ends', () => {
  const c = { startDate: D('2026-08-07'), startTime: '09:00', endDate: D('2026-08-07'), endTime: '17:00' };
  assert.strictEqual(b.coverageStatusNow(c, tz, new Date('2026-08-07T12:00:00.000Z')), 'upcoming'); // 08:00 EDT
  assert.strictEqual(b.coverageStatusNow(c, tz, new Date('2026-08-07T16:00:00.000Z')), 'active');   // 12:00 EDT
  assert.strictEqual(b.coverageStatusNow(c, tz, new Date('2026-08-07T22:00:00.000Z')), 'past');     // 18:00 EDT
});

test('a wholly future window is upcoming', () => {
  const c = { startDate: D('2026-08-20'), startTime: '00:00', endDate: D('2026-08-25'), endTime: '23:59' };
  assert.strictEqual(b.coverageStatusNow(c, tz, NOW), 'upcoming');
});

test('missing times fall back to covering the whole day', () => {
  const c = { startDate: D('2026-08-07'), endDate: D('2026-08-07') };
  assert.strictEqual(b.coverageStatusNow(c, tz, NOW), 'active');
});
