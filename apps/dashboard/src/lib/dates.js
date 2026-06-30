// Absence dates are calendar dates stored at UTC midnight. Always format them
// in UTC so the day never shifts based on the viewer's timezone.
const UTC = 'UTC';

export function formatShiftRange(shiftDate, returnDate) {
  const start = new Date(shiftDate);

  if (!returnDate) {
    return start.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: UTC });
  }

  // Last absent day = returnDate - 1
  const last = new Date(new Date(returnDate).getTime() - 24 * 60 * 60 * 1000);

  const startStr = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: UTC });
  const lastStr = last.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: UTC });

  return `${startStr} – ${lastStr}`;
}

export function formatShiftRangeLong(shiftDate, returnDate) {
  const start = new Date(shiftDate);

  if (!returnDate) {
    return start.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: UTC });
  }

  const last = new Date(new Date(returnDate).getTime() - 24 * 60 * 60 * 1000);

  const startStr = start.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: UTC });
  const lastStr = last.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: UTC });

  return `${startStr} – ${lastStr}`;
}
