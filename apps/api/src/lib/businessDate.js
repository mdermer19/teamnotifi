// All "today"/"tomorrow" logic must be anchored to the business timezone,
// not the server's clock (the droplet runs UTC). Otherwise, after ~8pm
// Eastern the server rolls to the next UTC day and today's absences drop
// off Today's Board even though they're correct in the log.

const TZ = process.env.BUSINESS_TZ || 'America/New_York';

// The business-timezone "today" as a Date at UTC midnight of that calendar
// date. shiftDate is a @db.Date (calendar date only), and Prisma stores/
// compares those at UTC midnight — so anchoring here keeps writes and reads
// consistent.
function businessToday() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const y = parts.find(p => p.type === 'year').value;
  const m = parts.find(p => p.type === 'month').value;
  const d = parts.find(p => p.type === 'day').value;
  return new Date(`${y}-${m}-${d}T00:00:00.000Z`);
}

// [start, end) covering the business-timezone current day, for range queries.
function businessDayBounds() {
  const start = businessToday();
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

// Build a UTC-midnight Date for an explicit calendar date (used for MM/DD
// input), so stored shiftDates are consistent with businessToday().
function calendarDate(year, month1to12, day) {
  return new Date(Date.UTC(year, month1to12 - 1, day));
}

module.exports = { TZ, businessToday, businessDayBounds, calendarDate };
