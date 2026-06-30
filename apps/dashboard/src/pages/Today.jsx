import { useState, useEffect, useCallback } from 'react';
import { useApi } from '../lib/api';
import ConversationModal from '../components/ConversationModal';
import { formatShiftRange } from '../lib/dates';

const REASON_COLORS = {
  SICK: 'badge-red',
  EMERG: 'badge-amber',
  LATE: 'badge-slate',
  OTHER: 'badge-slate',
};

const DAY_MS = 24 * 60 * 60 * 1000;

// Calendar-date string (YYYY-MM-DD) for a stored shiftDate (UTC midnight).
function ymd(iso) {
  return new Date(iso).toISOString().slice(0, 10);
}

// Today's local calendar date as YYYY-MM-DD.
function todayYmd() {
  const n = new Date();
  const p = x => String(x).padStart(2, '0');
  return `${n.getFullYear()}-${p(n.getMonth() + 1)}-${p(n.getDate())}`;
}

// Friendly header for a date bucket, relative to today.
function bucketLabel(key, today) {
  const d = new Date(key + 'T00:00:00Z');
  const long = d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' });
  const tomorrow = ymd(new Date(new Date(today + 'T00:00:00Z').getTime() + DAY_MS).toISOString());
  if (key === today) return `Today · ${long}`;
  if (key === tomorrow) return `Tomorrow · ${long}`;
  return long;
}

function AbsenceRow({ absence, onView }) {
  const details = [];
  if (absence.drNotePromised === true) details.push('Dr. note promised');
  if (absence.drNotePromised === false) details.push('No dr. note — 2 pts');
  if (absence.proofPromised === true) details.push('Proof promised');
  if (absence.proofPromised === false) details.push('No proof provided');
  if (absence.notes) details.push(absence.notes);

  const multiDay = !!absence.returnDate;

  return (
    <div
      onClick={() => onView(absence)}
      className="flex items-start gap-4 p-4 rounded-lg border border-slate-100 bg-white cursor-pointer hover:shadow-sm transition-shadow"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-slate-900">
            {absence.employee.firstName} {absence.employee.lastName}
          </span>
          <span className="text-xs text-slate-500">{absence.location.name}</span>
          <span className={REASON_COLORS[absence.reason.code] || 'badge-slate'}>
            {absence.reason.label}
          </span>
          {multiDay && (
            <span className="badge bg-blue-100 text-blue-700">{formatShiftRange(absence.shiftDate, absence.returnDate)}</span>
          )}
          {absence.lateCallout && (
            <span className="badge bg-orange-100 text-orange-700">Late notice</span>
          )}
        </div>
        {details.length > 0 && (
          <p className="text-sm text-slate-500 mt-1">{details.join(' · ')}</p>
        )}
        <p className="text-xs text-slate-400 mt-0.5">
          Reported {absence.reportedAt ? new Date(absence.reportedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'} · Click to view conversation
        </p>
      </div>
    </div>
  );
}

export default function Today() {
  const api = useApi();
  const [absences, setAbsences] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [viewing, setViewing] = useState(null);

  const load = useCallback(async () => {
    try {
      const abs = await api.getTodaysAbsences();
      setAbsences(abs);
      setLastRefresh(new Date());
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [load]);

  const today = todayYmd();
  const todayLong = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  // Bucket absences by date — a multi-day absence that began before today
  // shows under Today (they're out now); everything else under its start date.
  const buckets = {};
  for (const a of absences) {
    const start = ymd(a.shiftDate);
    const key = start < today ? today : start;
    (buckets[key] = buckets[key] || []).push(a);
  }
  const orderedKeys = Object.keys(buckets).sort();

  const outToday = (buckets[today] || []).length;
  const upcoming = absences.length - outToday;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400">
        Loading…
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Today's Board</h1>
          <p className="text-sm text-slate-500 mt-0.5">{todayLong}</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-2xl font-bold text-forest tabular-nums">{outToday}</div>
            <div className="text-xs text-slate-500">out today</div>
          </div>
          {upcoming > 0 && (
            <div className="text-right">
              <div className="text-2xl font-bold text-slate-400 tabular-nums">{upcoming}</div>
              <div className="text-xs text-slate-500">upcoming</div>
            </div>
          )}
          <button onClick={load} className="btn-ghost" title="Refresh">
            ↻ Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 mb-4 text-sm">
          Could not load data: {error}
        </div>
      )}

      {absences.length === 0 && !error ? (
        <div className="card p-12 text-center">
          <div className="text-4xl mb-3">✅</div>
          <div className="font-semibold text-slate-700">No absences today or upcoming</div>
          <div className="text-sm text-slate-400 mt-1">The board updates every 30 seconds</div>
        </div>
      ) : (
        <div className="space-y-6">
          {orderedKeys.map(key => (
            <div key={key}>
              <div className="flex items-center gap-2 mb-2">
                <h2 className={`text-sm font-semibold ${key === today ? 'text-forest' : 'text-slate-600'}`}>
                  {bucketLabel(key, today)}
                </h2>
                <span className="text-xs text-slate-400">({buckets[key].length})</span>
              </div>
              <div className="space-y-2">
                {buckets[key].map(a => (
                  <AbsenceRow key={a.id} absence={a} onView={setViewing} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-slate-400 mt-6 text-center">
        Last refreshed {lastRefresh.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })} · auto-refreshes every 30s
      </p>

      {viewing && (
        <ConversationModal
          absence={viewing}
          onClose={() => setViewing(null)}
        />
      )}
    </div>
  );
}
