import { useState, useEffect, useCallback } from 'react';
import { useApi } from '../lib/api';
import ConversationModal from '../components/ConversationModal';
import { formatShiftRange } from '../lib/dates';
import { useTimezone } from '../lib/timezone';

// Status chip colors — mapped by reason code
// SICK → blue, EMERG → red, LATE → amber, OTHER → slate
const REASON_CHIP = {
  SICK:  'badge-blue',
  EMERG: 'badge-red',
  LATE:  'badge-amber',
  OTHER: 'badge-slate',
};

// Left accent bar color by reason code
const REASON_ACCENT = {
  SICK:  'border-l-blue-400',
  EMERG: 'border-l-red-400',
  LATE:  'border-l-amber-400',
  OTHER: 'border-l-slate-300',
};

const DAY_MS = 24 * 60 * 60 * 1000;

function ymd(iso) {
  return new Date(iso).toISOString().slice(0, 10);
}

function bucketLabel(key, today) {
  const d = new Date(key + 'T00:00:00Z');
  const long = d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' });
  const tomorrow = ymd(new Date(new Date(today + 'T00:00:00Z').getTime() + DAY_MS).toISOString());
  if (key === today) return `Today · ${long}`;
  if (key === tomorrow) return `Tomorrow · ${long}`;
  return long;
}

// Inline circular refresh icon
function RefreshIcon({ spinning }) {
  return (
    <svg
      className={`w-4 h-4 ${spinning ? 'animate-spin' : ''}`}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.75}
      stroke="currentColor"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
    </svg>
  );
}

function AbsenceCard({ absence, onView }) {
  const { fmtDateTime, fmtTime } = useTimezone();

  const accentClass = REASON_ACCENT[absence.reason.code] || 'border-l-slate-300';
  const chipClass = REASON_CHIP[absence.reason.code] || 'badge-slate';

  const details = [];
  if (absence.drNotePromised === true) details.push('Dr. note promised');
  if (absence.drNotePromised === false) details.push('No dr. note — 2 pts');
  if (absence.proofPromised === true) details.push('Proof promised');
  if (absence.proofPromised === false) details.push('No proof provided');
  if (absence.notes) details.push(absence.notes);

  const multiDay = !!absence.returnDate;

  // Show labeled times — prefer shiftDate-derived start; reportedAt as "Reported"
  const reportedLabel = absence.reportedAt
    ? `Reported ${fmtDateTime(absence.reportedAt)}`
    : null;

  return (
    <div
      onClick={() => onView(absence)}
      className={`flex items-stretch rounded-lg border border-slate-100 bg-white cursor-pointer hover:bg-slate-50 hover:shadow-sm transition-all border-l-4 ${accentClass}`}
    >
      <div className="flex-1 min-w-0 px-4 py-3">
        {/* Name + location row */}
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-sm font-semibold text-slate-900">
            {absence.employee.firstName} {absence.employee.lastName}
          </span>
          <span className="text-xs text-slate-500">{absence.location.name}</span>
        </div>

        {/* Badges row */}
        <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
          <span className={chipClass}>{absence.reason.label}</span>
          {multiDay && (
            <span className="badge bg-blue-100 text-blue-700">{formatShiftRange(absence.shiftDate, absence.returnDate)}</span>
          )}
          {absence.lateCallout && (
            <span className="badge bg-orange-100 text-orange-700">Late notice</span>
          )}
        </div>

        {/* Details */}
        {details.length > 0 && (
          <p className="text-xs text-slate-500 mt-1.5">{details.join(' · ')}</p>
        )}

        {/* Reported time + conversation link */}
        <div className="flex items-center gap-3 mt-1.5">
          {reportedLabel && (
            <p className="text-xs text-slate-400">{reportedLabel}</p>
          )}
          <button
            onClick={e => { e.stopPropagation(); onView(absence); }}
            className="text-xs text-forest font-medium hover:underline"
          >
            View conversation
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Today() {
  const api = useApi();
  const { fmtTime, localDateStr } = useTimezone();
  const [absences, setAbsences] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [viewing, setViewing] = useState(null);
  const [activeTab, setActiveTab] = useState('today'); // 'today' | 'upcoming'

  const load = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    try {
      const abs = await api.getTodaysAbsences();
      setAbsences(abs);
      setLastRefresh(new Date());
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
      if (manual) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(() => load(), 30000);
    return () => clearInterval(interval);
  }, [load]);

  const today = localDateStr();
  const todayLong = new Date(today + 'T00:00:00Z').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });

  // Bucket absences by date
  const buckets = {};
  for (const a of absences) {
    const start = ymd(a.shiftDate);
    const key = start < today ? today : start;
    (buckets[key] = buckets[key] || []).push(a);
  }
  const orderedKeys = Object.keys(buckets).sort();

  const outToday = (buckets[today] || []).length;
  const upcoming = absences.length - outToday;

  // Tab filtering
  const visibleKeys = activeTab === 'today'
    ? orderedKeys.filter(k => k === today)
    : orderedKeys.filter(k => k !== today);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400">
        Loading…
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Today's Board</h1>
          <p className="text-sm text-slate-500 mt-0.5">{todayLong}</p>
        </div>

        {/* Refresh button + last refresh inline */}
        <div className="flex items-center gap-2 self-start sm:self-center">
          <span className="text-xs text-slate-400">Updated {fmtTime(lastRefresh)}</span>
          <button
            onClick={() => load(true)}
            disabled={refreshing}
            title="Refresh now"
            className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors disabled:opacity-50"
          >
            <RefreshIcon spinning={refreshing} />
          </button>
        </div>
      </div>

      {/* Segmented tab control + inline counts */}
      <div className="flex items-center gap-4 mb-5">
        <div className="flex items-center bg-slate-100 rounded-lg p-0.5 gap-0.5">
          <button
            onClick={() => setActiveTab('today')}
            className={`px-3.5 py-1.5 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'today'
                ? 'bg-white text-forest shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Out Today
            {outToday > 0 && (
              <span className={`ml-1.5 text-xs font-semibold tabular-nums ${activeTab === 'today' ? 'text-forest' : 'text-slate-400'}`}>
                {outToday}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('upcoming')}
            className={`px-3.5 py-1.5 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'upcoming'
                ? 'bg-white text-forest shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Upcoming
            {upcoming > 0 && (
              <span className={`ml-1.5 text-xs font-semibold tabular-nums ${activeTab === 'upcoming' ? 'text-forest' : 'text-slate-400'}`}>
                {upcoming}
              </span>
            )}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 mb-4 text-sm">
          Could not load data: {error}
        </div>
      )}

      {/* Empty state */}
      {absences.length === 0 && !error ? (
        <div className="card p-12 text-center">
          <svg className="w-10 h-10 mx-auto mb-3 text-green-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
          </svg>
          <div className="font-semibold text-slate-700">No absences today or upcoming</div>
          <div className="text-sm text-slate-400 mt-1">The board updates every 30 seconds</div>
        </div>
      ) : visibleKeys.length === 0 ? (
        <div className="card p-10 text-center">
          <div className="font-medium text-slate-500">
            {activeTab === 'today' ? 'No one out today' : 'No upcoming absences'}
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {visibleKeys.map(key => (
            <div key={key}>
              <div className="flex items-center gap-2 mb-2.5">
                <h2 className={`text-xs font-semibold uppercase tracking-wide ${key === today ? 'text-forest' : 'text-slate-500'}`}>
                  {bucketLabel(key, today)}
                </h2>
                <span className="text-xs text-slate-400">({buckets[key].length})</span>
              </div>
              <div className="space-y-2">
                {buckets[key].map(a => (
                  <AbsenceCard key={a.id} absence={a} onView={setViewing} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {viewing && (
        <ConversationModal
          absence={viewing}
          onClose={() => setViewing(null)}
        />
      )}
    </div>
  );
}
