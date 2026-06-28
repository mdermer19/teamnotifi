import { useState, useEffect, useCallback, useRef } from 'react';
import { useApi } from '../lib/api';
import { usePermissions } from '../hooks/usePermissions';
import EmployeeModal from '../components/EmployeeModal';

export default function Employees() {
  const api = useApi();
  const { canToggleManager, loading: permLoading } = usePermissions();

  const [employees, setEmployees] = useState([]);
  const [locationOptions, setLocationOptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [togglingId, setTogglingId] = useState(null);
  const [viewing, setViewing] = useState(null);

  const [search, setSearch] = useState('');
  const [filterLocation, setFilterLocation] = useState('');
  const [filterManager, setFilterManager] = useState('');
  const [filterActive, setFilterActive] = useState('true');

  // Seed location options once from the initial full load
  const locationOptionsSeeded = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filterActive !== '') params.active = filterActive;
      if (filterLocation) params.locationId = filterLocation;
      if (filterManager !== '') params.isManager = filterManager;

      const emps = await api.getEmployees(params);
      setEmployees(emps);

      // Build location dropdown from first unfiltered load
      if (!locationOptionsSeeded.current && !filterLocation) {
        const seen = new Map();
        emps.forEach(e => {
          if (e.location && !seen.has(e.location.id)) seen.set(e.location.id, e.location);
        });
        setLocationOptions([...seen.values()].sort((a, b) => a.name.localeCompare(b.name)));
        locationOptionsSeeded.current = true;
      }
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [filterActive, filterLocation, filterManager]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  async function toggleManager(emp) {
    if (!confirm(`Are you sure you want to change ${emp.firstName} ${emp.lastName}'s manager status?`)) return;
    setTogglingId(emp.id);
    try {
      const updated = await api.patchEmployeeManager(emp.id, !emp.isManager);
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
          (e.employeeCode || '').toLowerCase().includes(q)
        );
      })
    : employees;

  const activeCount = displayed.filter(e => e.active).length;
  const totalCount = displayed.length;
  const countLabel = filterActive === 'true'
    ? `${totalCount} active employees`
    : filterActive === 'false'
      ? `${totalCount} inactive employees`
      : `${activeCount} active · ${totalCount - activeCount} inactive`;

  if (permLoading) return <div className="flex items-center justify-center h-64 text-slate-400">Loading…</div>;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Roster</h1>
          <p className="text-sm text-slate-500 mt-0.5">{countLabel} · synced nightly from Paylocity</p>
        </div>
      </div>

      {/* Filters */}
      <div className="card p-4 mb-5">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="label">Search</label>
            <input
              type="text"
              className="input"
              placeholder="Name or EE ID…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Location</label>
            <select className="input" value={filterLocation} onChange={e => setFilterLocation(e.target.value)}>
              <option value="">All locations</option>
              {locationOptions.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Manager status</label>
            <select className="input" value={filterManager} onChange={e => setFilterManager(e.target.value)}>
              <option value="">All</option>
              <option value="true">Managers only</option>
              <option value="false">Non-managers</option>
            </select>
          </div>
          <div>
            <label className="label">Status</label>
            <select className="input" value={filterActive} onChange={e => setFilterActive(e.target.value)}>
              <option value="true">Active</option>
              <option value="false">Inactive</option>
              <option value="">All</option>
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
              <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Name</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Location</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Reports To</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Role</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Status</th>
                  {canToggleManager && (
                    <th className="text-center px-4 py-3 font-medium text-slate-600">Manager</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {displayed.map(emp => (
                  <tr
                    key={emp.id}
                    onClick={() => setViewing(emp)}
                    className="hover:bg-slate-50 cursor-pointer"
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{emp.firstName} {emp.lastName}</div>
                      {emp.employeeCode && <div className="text-xs text-slate-400">ID: {emp.employeeCode}</div>}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{emp.location?.name || '—'}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {emp.manager
                        ? `${emp.manager.firstName} ${emp.manager.lastName}`
                        : <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-600 capitalize">
                      {emp.role?.replace(/_/g, ' ') || '—'}
                    </td>
                    <td className="px-4 py-3">
                      {emp.active
                        ? <span className="badge-green">Active</span>
                        : <span className="badge bg-slate-100 text-slate-500">Inactive</span>}
                    </td>
                    {canToggleManager && (
                      <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
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
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-xs text-slate-400 mt-3">
        Click any row to view absence history
      </p>

      {viewing && (
        <EmployeeModal employee={viewing} onClose={() => setViewing(null)} />
      )}
    </div>
  );
}
