import { createContext, useContext, useState, useCallback } from 'react';

const TZ_KEY = 'teamnotifi_display_tz';
const browserTz = (() => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York'; }
  catch { return 'America/New_York'; }
})();

// Curated list — the US zones most shops will use. The viewer's own browser
// zone is added automatically if it isn't already here.
export const COMMON_TIMEZONES = [
  { value: 'America/New_York', label: 'Eastern — New York' },
  { value: 'America/Chicago', label: 'Central — Chicago' },
  { value: 'America/Denver', label: 'Mountain — Denver' },
  { value: 'America/Phoenix', label: 'Mountain (no DST) — Phoenix' },
  { value: 'America/Los_Angeles', label: 'Pacific — Los Angeles' },
  { value: 'America/Anchorage', label: 'Alaska — Anchorage' },
  { value: 'Pacific/Honolulu', label: 'Hawaii — Honolulu' },
];

const TimezoneContext = createContext(null);

const fallback = {
  tz: browserTz,
  setTz: () => {},
  fmtTime: (d) => (d ? new Date(d).toLocaleTimeString() : '—'),
  fmtDateTime: (d) => (d ? new Date(d).toLocaleString() : '—'),
  fmtDate: (d) => (d ? new Date(d).toLocaleDateString() : '—'),
  localDateStr: () => new Date().toISOString().slice(0, 10),
};

export function TimezoneProvider({ children }) {
  const [tz, setTzState] = useState(() => {
    try { return localStorage.getItem(TZ_KEY) || browserTz; } catch { return browserTz; }
  });

  const setTz = useCallback((next) => {
    setTzState(next);
    try { localStorage.setItem(TZ_KEY, next); } catch { /* ignore */ }
  }, []);

  const fmtTime = useCallback(
    (d) => (d ? new Date(d).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: tz }) : '—'),
    [tz]
  );
  const fmtDateTime = useCallback(
    (d) => (d ? new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: tz }) : '—'),
    [tz]
  );
  const fmtDate = useCallback(
    (d) => (d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: tz }) : '—'),
    [tz]
  );
  // 'YYYY-MM-DD' for "now" in the selected zone (for "today" comparisons).
  const localDateStr = useCallback(
    () => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()),
    [tz]
  );

  return (
    <TimezoneContext.Provider value={{ tz, setTz, fmtTime, fmtDateTime, fmtDate, localDateStr }}>
      {children}
    </TimezoneContext.Provider>
  );
}

export function useTimezone() {
  return useContext(TimezoneContext) || fallback;
}

export function TimezonePicker({ dark = false }) {
  const { tz, setTz } = useTimezone();
  const options = COMMON_TIMEZONES.some(o => o.value === tz)
    ? COMMON_TIMEZONES
    : [{ value: tz, label: tz.replace(/_/g, ' ') }, ...COMMON_TIMEZONES];

  return (
    <select
      value={tz}
      onChange={(e) => setTz(e.target.value)}
      aria-label="Display time zone"
      className={
        dark
          ? 'w-full text-xs rounded-md bg-white/10 text-white border border-white/20 px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-white/40'
          : 'input text-sm'
      }
    >
      {options.map(o => (
        <option key={o.value} value={o.value} className="text-slate-900">
          {o.label}
        </option>
      ))}
    </select>
  );
}
