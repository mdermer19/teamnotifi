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

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function Absences() {
  const api = useApi();
  const [data, setData] = useState({ absences: [], total: 0 });
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [ackingId, setAckingId] = useState(null);
  const [viewing, setViewing] = useState(null);

  const [filters, setFilters] = useState({
    startDate: '',
    endDate: '',
    locationId: '',
    reasonCode: '',
    reviewed: '',
    search: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        startDate: filters.startDate || undefined,
        endDate: filters.endDate || undefined,
        locationId: filters.locationId || undefined,
        reasonCode: filters.reasonCode || undefined,
        reviewed: filters.reviewed !== '' ? filters.reviewed : undefined,
        limit: '200',
      };
      const [result, locs] = await Promise.all([
        api.getAbsences(params),
        locations.length ? Promise.resolve(locations) : api.getLocations(),
      ]);
      setData(result);
      if (!locations.length) setLocations(locs);
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [filters]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  async function handleAck(id) {
    setAckingId(id);
    try {
      const updated = await api.ackAbsence(id);
      setData(prev => ({
        ...prev,
        absences: prev.absences.map(a => a.id === id ? updated : a),
      }));
    } catch (e) {
      alert('Failed to mark as reviewed: ' + e.message);
    } finally {
      setAckingId(null);
    }
  }

  function setFilter(key, val) {
    setFilters(f => ({ ...f, [key]: val }));
  }

  // Client-side name search
  const displayed = filters.search
    ? data.absences.filter(a => {
        const q = filters.search.toLowerCase();
        return (
          a.employee.firstName.toLowerCase().includes(q) ||
          a.employee.lastName.toLowerCase().includes(q)
        );
      })
    : data.absences;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Absence Log</h1>
          <p className="text-sm text-slate-500 mt-0.5">{data.total} total records</p>
        </div>
      </div>

      {/* Filters */}
      <div className="card p-4 mb-5">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <div>
            <label className="label">Employee</label>
            <input
              type="text"
              className="input"
              placeholder="Search name…"
              value={filters.search}
              onChange={e => setFilter('search', e.target.value)}
            />
          </div>
          <div>
            <label className="label">Start date</label>
            <input
              type="date"
              className="input"
              value={filters.startDate}
              onChange={e => setFilter('startDate', e.target.value)}
            />
          </div>
          <div>
            <label className="label">End date</label>
            <input
              type="date"
              className="input"
              value={filters.endDate}
              onChange={e => setFilter('endDate', e.target.value)}
            />
          </div>
          <div>
            <label className="label">Location</label>
            <select className="input" value={filters.locationId} onChange={e => setFilter('locationId', e.target.value)}>
              <option value="">All locations</option>
              {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Reason</label>
            <select className="input" value={filters.reasonCode} onChange={e => setFilter('reasonCode', e.target.value)}>
              <option value="">All reasons</option>
              <option value="SICK">Sick</option>
              <option value="EMERG">Emergency</option>
              <option value="LATE">Late</option>
              <option value="OTHER">Other</option>
            </select>
          </div>
          <div>
            <label className="label">Status</label>
            <select className="input" value={filters.reviewed} onChange={e => setFilter('reviewed', e.target.value)}>
              <option value="">All</option>
              <option value="false">Unreviewed</option>
              <option value="true">Reviewed</option>
            </select>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 mb-4 text-sm">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400">Loading…</div>
        ) : displayed.length === 0 ? (
          <div className="p-12 text-center text-slate-400">No absences match your filters</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Employee</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Location</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Date</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Reason</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Details</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {displayed.map(absence => {
                  const details = [];
                  if (absence.drNotePromised === true) details.push('Dr. note promised');
                  if (absence.drNotePromised === false) details.push('No dr. note — 2 pts');
                  if (absence.proofPromised === true) details.push('Proof promised');
                  if (absence.proofPromised === false) details.push('No proof');
                  if (absence.notes) details.push(absence.notes);

                  return (
                    <tr key={absence.id} onClick={() => setViewing(absence)} className={`hover:bg-slate-50 cursor-pointer ${!absence.managerAcked ? 'bg-amber-50/40' : ''}`}>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">
                          {absence.employee.firstName} {absence.employee.lastName}
                        </div>
                        {absence.employee.role && (
                          <div className="text-xs text-slate-400 capitalize">{absence.employee.role.replace('_', ' ')}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{absence.location.name}</td>
                      <td className="px-4 py-3 text-slate-600 tabular-nums whitespace-nowrap">
                        {formatShiftRange(absence.shiftDate, absence.returnDate)}
                        {absence.returnDate && <span className="ml-1 badge bg-blue-100 text-blue-700">Multi-day</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={REASON_COLORS[absence.reason.code] || 'badge-slate'}>
                          {absence.reason.label}
                        </span>
                        {absence.lateCallout && (
                          <span className="ml-1 badge bg-orange-100 text-orange-700">Late notice</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-500 max-w-xs truncate">
                        {details.join(' · ') || '—'}
                      </td>
                      <td className="px-4 py-3">
                        {absence.managerAcked ? (
                          <span className="badge-green">Reviewed</span>
                        ) : (
                          <span className="badge-amber">Pending</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {!absence.managerAcked && (
                          <button
                            onClick={() => handleAck(absence.id)}
                            disabled={ackingId === absence.id}
                            className="btn-ghost text-forest font-medium"
                          >
                            {ackingId === absence.id ? 'Saving…' : 'Mark Reviewed'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {displayed.length > 0 && (
        <p className="text-xs text-slate-400 mt-3 text-right">
          Showing {displayed.length} of {data.total} records · Click any row to view conversation
        </p>
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
