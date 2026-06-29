import { useState, useEffect } from 'react';
import { useApi } from '../lib/api';
import { usePermissions } from '../hooks/usePermissions';

const ROLE_LABELS = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  manager: 'Manager',
};

const ROLE_DESCRIPTIONS = {
  super_admin: 'All employees · full access · manages users & permissions',
  admin: 'All employees · cannot manage users or permissions',
  manager: 'Sees only their direct & indirect reports',
};

function UserRow({ user, allEmployees, onSaved }) {
  const api = useApi();
  const [role, setRole] = useState(user.role);
  const [employeeId, setEmployeeId] = useState(user.employeeId ? String(user.employeeId) : '');
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const dirty =
    role !== user.role ||
    (parseInt(employeeId) || null) !== (user.employeeId || null);

  const linkedEmp = user.employee;

  const filtered = search.length > 1
    ? allEmployees.filter(e => {
        const q = search.toLowerCase();
        return (
          `${e.firstName} ${e.lastName}`.toLowerCase().includes(q) ||
          (e.employeeCode || '').toLowerCase().includes(q)
        );
      }).slice(0, 10)
    : [];

  async function save() {
    setSaving(true);
    try {
      let updated = await api.updateUser(user.id, { role });
      const newEmpId = parseInt(employeeId) || null;
      if (newEmpId !== (user.employeeId || null)) {
        updated = await api.linkEmployee(user.id, newEmpId);
      }
      onSaved(updated);
      setSaved(true);
      setSearch('');
    } catch (e) {
      alert('Failed to save: ' + e.message);
    } finally {
      setSaving(false);
    }
  }

  const selectedEmp = employeeId ? allEmployees.find(e => e.id === parseInt(employeeId)) : null;

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="font-semibold text-slate-900">{user.name || 'Unknown'}</div>
          <div className="text-sm text-slate-500">{user.email || user.clerkUserId}</div>
        </div>
        <div className="flex items-center gap-2">
          {saved && !dirty && <span className="text-xs text-green-600 font-medium">Saved ✓</span>}
          <button
            onClick={save}
            disabled={saving || !dirty}
            className={`btn-primary text-sm ${!dirty ? 'opacity-40 cursor-default' : ''}`}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      <div>
        <label className="label">Role</label>
        <div className="grid grid-cols-3 gap-2">
          {['super_admin', 'admin', 'manager'].map(r => (
            <button
              key={r}
              onClick={() => { setRole(r); setSaved(false); }}
              className={`p-3 rounded-lg border-2 text-left transition-colors ${
                role === r ? 'border-forest bg-forest/5' : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className={`text-sm font-medium ${role === r ? 'text-forest' : 'text-slate-700'}`}>
                {ROLE_LABELS[r]}
              </div>
              <div className="text-xs text-slate-400 mt-0.5">{ROLE_DESCRIPTIONS[r]}</div>
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="label">
          Linked Employee Record
          {role !== 'manager' && (
            <span className="ml-2 text-xs text-slate-400 font-normal">(optional for {ROLE_LABELS[role]})</span>
          )}
        </label>

        {selectedEmp ? (
          <div className="flex items-center gap-2 p-2.5 rounded-lg bg-green-50 border border-green-200 text-sm mb-2">
            <span className="text-green-700 font-medium">{selectedEmp.firstName} {selectedEmp.lastName}</span>
            <span className="text-green-500 text-xs">#{selectedEmp.employeeCode}</span>
            <button
              onClick={() => { setEmployeeId(''); setSaved(false); }}
              className="ml-auto text-xs text-slate-400 hover:text-red-500"
            >
              Unlink
            </button>
          </div>
        ) : (
          <p className="text-xs text-amber-600 mb-2">
            {role === 'manager'
              ? 'No employee linked — this user will see no data.'
              : 'Not linked to an employee record.'}
          </p>
        )}

        <div className="relative">
          <input
            type="text"
            placeholder="Search by name or employee ID…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input text-sm w-full"
          />
          {filtered.length > 0 && (
            <div className="absolute z-10 top-full left-0 right-0 bg-white border border-slate-200 rounded-lg shadow-lg mt-1 max-h-48 overflow-y-auto">
              {filtered.map(emp => (
                <button
                  key={emp.id}
                  onClick={() => {
                    setEmployeeId(String(emp.id));
                    setSearch('');
                    setSaved(false);
                  }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex items-center justify-between"
                >
                  <span>{emp.firstName} {emp.lastName}</span>
                  <span className="text-xs text-slate-400">#{emp.employeeCode} · {emp.location?.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {!selectedEmp && role === 'manager' && (
          <p className="text-xs text-slate-400 mt-1">
            Auto-links on sign-in if login email matches the employee's work email from Paylocity.
          </p>
        )}
      </div>
    </div>
  );
}

export default function Permissions() {
  const api = useApi();
  const { canManagePermissions, loading: permLoading } = usePermissions();
  const [users, setUsers] = useState([]);
  const [allEmployees, setAllEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (permLoading) return;
    if (!canManagePermissions) { setLoading(false); return; }
    Promise.all([api.getUsers(), api.getEmployees({ active: 'true' })])
      .then(([u, e]) => { setUsers(u); setAllEmployees(e); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [permLoading, canManagePermissions]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleSaved(updated) {
    setUsers(prev => prev.map(u => u.id === updated.id ? updated : u));
  }

  if (permLoading || loading) {
    return <div className="flex items-center justify-center h-64 text-slate-400">Loading…</div>;
  }

  if (!canManagePermissions) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="card p-12 text-center">
          <div className="text-4xl mb-3">🔒</div>
          <div className="font-semibold text-slate-700">Access Restricted</div>
          <div className="text-sm text-slate-400 mt-1">Only Super Admins can manage permissions.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Permissions</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Manage roles and employee links. Users appear here after their first sign-in.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 mb-4 text-sm">{error}</div>
      )}

      <div className="card p-4 mb-6 bg-slate-50 border-slate-200">
        <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-3">Role Reference</div>
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <div className="font-medium text-slate-700">Super Admin</div>
            <ul className="text-slate-500 text-xs mt-1 space-y-0.5">
              <li>• All employees & absences</li>
              <li>• Manage users & permissions</li>
              <li>• Full settings access</li>
            </ul>
          </div>
          <div>
            <div className="font-medium text-slate-700">Admin</div>
            <ul className="text-slate-500 text-xs mt-1 space-y-0.5">
              <li>• All employees & absences</li>
              <li>• Cannot edit permissions</li>
              <li>• No user management</li>
            </ul>
          </div>
          <div>
            <div className="font-medium text-slate-700">Manager</div>
            <ul className="text-slate-500 text-xs mt-1 space-y-0.5">
              <li>• Direct & indirect reports only</li>
              <li>• Must be linked to employee record</li>
              <li>• View absences, assign coverage</li>
            </ul>
          </div>
        </div>
      </div>

      {users.length === 0 ? (
        <div className="card p-12 text-center text-slate-400">No users found</div>
      ) : (
        <div className="space-y-4">
          {users.map(user => (
            <UserRow
              key={user.id}
              user={user}
              allEmployees={allEmployees}
              onSaved={handleSaved}
            />
          ))}
        </div>
      )}

      <p className="text-xs text-slate-400 mt-6">
        {users.length} user{users.length !== 1 ? 's' : ''} · New users default to Manager role until assigned
      </p>
    </div>
  );
}