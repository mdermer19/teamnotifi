// All "today"/"tomorrow" logic must be anchored to a real timezone, not the
// server's clock (the droplet runs UTC). Each location carries its own IANA
// timezone, so "today" is computed per-location — correct for nationwide use.
// When no tz is given we fall back to DEFAULT_TZ.

const DEFAULT_TZ = process.env.BUSINESS_TZ || 'America/New_York';

// 'YYYY-MM-DD' for a calendar date in the given timezone (defaults to now).
// `now` is injectable so time-dependent behaviour can be tested deterministically.
function localDateStr(tz = DEFAULT_TZ, now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}

// 'HH:MM' (24h) for a time in the given timezone (defaults to now).
function localTimeStr(tz = DEFAULT_TZ, now = new Date()) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(now);
}

// The timezone-local "today" as a Date at UTC midnight of that calendar date.
// shiftDate is a @db.Date (calendar date only) and Prisma stores/compares
// those at UTC midnight — so anchoring here keeps writes and reads consistent.
function localToday(tz = DEFAULT_TZ) {
  return new Date(`${localDateStr(tz)}T00:00:00.000Z`);
}

// [start, end) covering the timezone-local current day, for range queries.
function localDayBounds(tz = DEFAULT_TZ) {
  const start = localToday(tz);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

// Build a UTC-midnight Date for an explicit calendar date (used for MM/DD
// input), so stored shiftDates are consistent with localToday().
function calendarDate(year, month1to12, day) {
  return new Date(Date.UTC(year, month1to12 - 1, day));
}

// 'YYYY-MM-DD' for a stored @db.Date value (Prisma returns it at UTC midnight).
function dateStr(d) {
  return new Date(d).toISOString().slice(0, 10);
}

// Where a coverage window sits relative to now: 'upcoming' | 'active' | 'past'.
//
// Coverage carries both a date range and HH:MM bounds, so the times matter:
// a window starting today at 19:00 is NOT active at 16:00 today. This is the
// single source of truth — the API, the notification routing and the dashboard
// all derive their answer from here rather than each doing their own date math.
function coverageStatusNow(c, tz = DEFAULT_TZ, now = new Date()) {
  const nowDate = localDateStr(tz, now);
  const nowTime = localTimeStr(tz, now);
  const startDate = dateStr(c.startDate);
  const endDate = dateStr(c.endDate);
  const startTime = c.startTime || '00:00';
  const endTime = c.endTime || '23:59';

  if (nowDate < startDate) return 'upcoming';
  if (nowDate === startDate && nowTime < startTime) return 'upcoming';
  if (nowDate > endDate) return 'past';
  if (nowDate === endDate && nowTime > endTime) return 'past';
  return 'active';
}

// Is a coverage record active right now, in the given timezone?
function coverageActiveNow(c, tz = DEFAULT_TZ, now = new Date()) {
  return coverageStatusNow(c, tz, now) === 'active';
}

module.exports = {
  DEFAULT_TZ,
  localDateStr,
  localTimeStr,
  localToday,
  localDayBounds,
  calendarDate,
  dateStr,
  coverageActiveNow,
  coverageStatusNow,
};
