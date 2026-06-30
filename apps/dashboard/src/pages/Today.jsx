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

function AbsenceRow({ absence, onView }) {
  const details = [];
  if (absence.drNotePromised === true) details.push('Dr. note promised');
  if (absence.drNotePromised === false) details.push('No dr. note — 2 pts');
  if (absence.proofPromised === true) details.push('Proof promised');
  if (absence.proofPromised === false) details.push('No proof provided');
  if (absence.notes) details.push(absence.notes);

  const shiftDate = formatShiftRange(absence.shiftDate, absence.returnDate);
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
          {absence.employee.role && (
            <span className="text-xs text-slate-500 capitalize">{absence.employee.role.replace('_', ' ')}</span>
          )}
          <span className={REASON_COLORS[absence.reason.code] || 'badge-slate'}>
            {absence.reason.label}
          </span>
          {absence.lateCallout && (
            <span className="badge bg-orange-100 text-orange-700">Late notice</span>
          )}
        </div>
        <div className="flex items-center gap-3 mt-1">
          <p className="text-sm font-medium text-slate-700">
            {multiDay ? `Out: ${shiftDate}` : `Shift date: ${shiftDate}`}
          </p>
          {details.length > 0 && (
            <p className="text-sm text-slate-500">{details.join(' · ')}</p>
          )}
        </div>
        <p className="text-xs text-slate-400 mt-0.5">
          Reported {absence.reportedAt ? new Date(absence.reportedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'} · Click to view conversation
        </p>
      </div>
    </div>
  );
}

function LocationCard({ name, brand, absences, onView }) {
  const [open, setOpen] = useState(true);

  return (
    <div className="card overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between p-5 hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-forest/10 rounded-lg flex items-center justify-center">
            <span className="text-forest font-bold text-lg">{absences.length}</span>
          </div>
          <div className="text-left">
            <div className="font-semibold text-slate-900">{name}</div>
            <div className="text-xs text-slate-500">{brand}</div>
          </div>
        </div>
        <svg className={`w-4 h-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && absences.length > 0 && (
        <div className="border-t border-slate-100 p-4 space-y-2">
          {absences.map(a => (
            <AbsenceRow key={a.id} absence={a} onView={onView} />
          ))}
        </div>
      )}

      {open && absences.length === 0 && (
        <div className="border-t border-slate-100 p-5 text-sm text-slate-400 text-center">
          All clear today
        </div>
      )}
    </div>
  );
}

export default function Today() {
  const api = useApi();
  const [absences, setAbsences] = useState([]);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [viewing, setViewing] = useState(null);

  const load = useCallback(async () => {
    try {
      const [abs, locs] = await Promise.all([
        api.getTodaysAbsences(),
        api.getLocations(),
      ]);
      setAbsences(abs);
      setLocations(locs);
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

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const total = absences.length;

  // Group absences by location
  const byLocation = locations.map(loc => ({
    ...loc,
    absences: absences.filter(a => a.location.id === loc.id),
  }));

  // Also catch absences with no matching location in the list
  const knownLocIds = new Set(locations.map(l => l.id));
  const ungrouped = absences.filter(a => !knownLocIds.has(a.location.id));

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
          <p className="text-sm text-slate-500 mt-0.5">{today}</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-2xl font-bold text-forest tabular-nums">{total}</div>
            <div className="text-xs text-slate-500">out today</div>
          </div>
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

      {total === 0 && !error ? (
        <div className="card p-12 text-center">
          <div className="text-4xl mb-3">✅</div>
          <div className="font-semibold text-slate-700">No absences reported today</div>
          <div className="text-sm text-slate-400 mt-1">The board updates every 30 seconds</div>
        </div>
      ) : (
        <div className="space-y-4">
          {byLocation.filter(l => l.absences.length > 0 || locations.length <= 5).map(loc => (
            <LocationCard
              key={loc.id}
              name={loc.name}
              brand={loc.brand}
              absences={loc.absences}
              onView={setViewing}
            />
          ))}
          {ungrouped.length > 0 && (
            <LocationCard
              key="other"
              name="Other"
              brand=""
              absences={ungrouped}
              onView={setViewing}
            />
          )}
        </div>
      )}

      <p className="text-xs text-slate-400 mt-4 text-center">
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
