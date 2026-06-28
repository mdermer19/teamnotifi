import { useState, useEffect, useCallback } from 'react';
import { useApi } from '../lib/api';

export default function Employees() {
  const api = useApi();
  const [employees, setEmployees] = useState([]);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [filterLocation, setFilterLocation] = useState('');
  const [togglingId, setTogglingId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { active: 'true' };
      if (filterLocation) params.locationId = filterLocation;
      const [emps, locs] = await Promise.all([
        api.getEmployees(params),
        locations.length ? Promise.resolve(locations) : api.getLocations(),
      ]);
      setEmployees(emps);
      if (!locations.length) setLocations(locs);
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [filterLocation]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  async function toggleManager(emp) {
    if (!confirm(`Are you sure you want to change ${emp.firstName} ${emp.lastName}'s manager status?`)) return;
    setTogglingId(emp.id);
    try {
      const updated = await fetch(`/api/employees/${emp.id}/manager`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isManager: !emp.isManager }),
      }).then(r => r.json());
      setEmployees(prev => prev.map(e => e.id === emp.id ? { ...e, isManager: updated.isManager } : e));
    } catch (e) {
      alert('Failed to update: ' + e.message);
    } finally {
      setTogglingId(null);
    }
  }

  const displayed = search
    ? employees.filter(e => {
        const q = search.toLowerCase();
        return (
          e.firstName.toLowerCase().includes(q) ||
          e.lastName.toLowerCase().includes(q) ||
          (e.phone || '').includes(q) ||
          (e.employeeCode || '').toLowerCase().includes(q)
        );
      })
    : employees;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Roster</h1>
          <p className="text-sm text-slate-500 mt-0.5">{displayed.length} active employees · synced from roster spreadsheet</p>
        </div>
      </div>

      {/* Filters */}
      <div className="card p-4 mb-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="label">Search</label>
            <input
              type="text"
              className="input"
              placeholder="Name, phone, or EE ID…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Location</label>
            <select className="input" value={filterLocation} onChange={e => setFilterLocation(e.target.value)}>
              <option value="">All locations</option>
              {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 mb-4 text-sm">{error}</div>
      )}

      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400">Loading…</div>
        ) : displayed.length === 0 ? (
          <div className="p-12 text-center text-slate-400">No employees found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Name</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Location</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Assigned Manager</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Role</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Phone</th>
                  <th className="text-center px-4 py-3 font-medium text-slate-600">Manager</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {displayed.map(emp => (
                  <tr key={emp.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{emp.firstName} {emp.lastName}</div>
                      {emp.employeeCode && <div className="text-xs text-slate-400">ID: {emp.employeeCode}</div>}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{emp.location?.name || '—'}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {emp.manager ? `${emp.manager.firstName} ${emp.manager.lastName}` : <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-600 capitalize">{emp.role?.replace(/_/g, ' ') || '—'}</td>
                    <td className="px-4 py-3 text-slate-500 tabular-nums">{emp.phone}</td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => toggleManager(emp)}
                        disabled={togglingId === emp.id}
                        title={emp.isManager ? 'Remove manager flag' : 'Mark as manager'}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
                          emp.isManager ? 'bg-forest' : 'bg-slate-200'
                        } ${togglingId === emp.id ? 'opacity-50' : ''}`}
                      >
                        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                          emp.isManager ? 'translate-x-4' : 'translate-x-0.5'
                        }`} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
