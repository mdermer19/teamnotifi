// All "today"/"tomorrow" logic must be anchored to a real timezone, not the
// server's clock (the droplet runs UTC). Each location carries its own IANA
// timezone, so "today" is computed per-location — correct for nationwide use.
// When no tz is given we fall back to DEFAULT_TZ.

const DEFAULT_TZ = process.env.BUSINESS_TZ || 'America/New_York';

// 'YYYY-MM-DD' for the current calendar date in the given timezone.
function localDateStr(tz = DEFAULT_TZ) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

// 'HH:MM' (24h) for the current time in the given timezone.
function localTimeStr(tz = DEFAULT_TZ) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date());
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

// Is a coverage record active right now, in the given timezone? Compares the
// current local date/time against the coverage's date range and HH:MM bounds.
function coverageActiveNow(c, tz = DEFAULT_TZ) {
  const nowDate = localDateStr(tz);
  const nowTime = localTimeStr(tz);
  const startDate = dateStr(c.startDate);
  const endDate = dateStr(c.endDate);

  if (nowDate < startDate || nowDate > endDate) return false;
  if (nowDate === startDate && nowTime < (c.startTime || '00:00')) return false;
  if (nowDate === endDate && nowTime > (c.endTime || '23:59')) return false;
  return true;
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
};
