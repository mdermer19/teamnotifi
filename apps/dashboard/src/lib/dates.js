export function formatShiftRange(shiftDate, returnDate) {
  const start = new Date(shiftDate);

  if (!returnDate) {
    return start.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }

  // Last absent day = returnDate - 1
  const last = new Date(returnDate);
  last.setDate(last.getDate() - 1);

  const startStr = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const lastStr = last.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  return `${startStr} – ${lastStr}`;
}

export function formatShiftRangeLong(shiftDate, returnDate) {
  const start = new Date(shiftDate);

  if (!returnDate) {
    return start.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  }

  const last = new Date(returnDate);
  last.setDate(last.getDate() - 1);

  const startStr = start.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const lastStr = last.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  return `${startStr} – ${lastStr}`;
}
