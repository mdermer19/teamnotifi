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
  manager: 'Sees only their direct & indirect reports (view only)',
};

const ROLE_BADGE = {
  super_admin: 'bg-forest/10 text-forest',
  admin: 'bg-blue-100 text-blue-800',
  manager: 'bg-slate-100 text-slate-700',
};

function EditModal({ user, allEmployees, onSaved, onDeleted, onClose }) {
  const api = useApi();
  const [role, setRole] = useState(user.role);
  const [employeeId, setEmployeeId] = useState(user.employeeId ? String(user.employeeId) : '');
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const dirty =
    role !== user.role ||
    (parseInt(employeeId) || null) !== (user.employeeId || null);

  const selectedEmp = employeeId ? allEmployees.find(e => e.id === parseInt(employeeId)) : null;

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
      onClose();
    } catch (e) {
      alert('Failed to save: ' + e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setDeleting(true);
    try {
      await api.deleteUser(user.id);
      onDeleted(user.id);
      onClose();
    } catch (e) {
      alert('Failed to remove: ' + e.message);
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100">
          <div className="font-semibold text-slate-900">{user.name || 'Unknown'}</div>
          <div className="text-sm text-slate-500 break-all">{user.email || user.clerkUserId}</div>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Role */}
          <div>
            <label className="label mb-2">Role</label>
            <div className="grid grid-cols-3 gap-2">
              {['super_admin', 'admin', 'manager'].map(r => (
                <button
                  key={r}
                  onClick={() => setRole(r)}
                  className={`p-2.5 rounded-lg border-2 text-left transition-colors ${
                    role === r ? 'border-forest bg-forest/5' : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className={`text-xs font-semibold ${role === r ? 'text-forest' : 'text-slate-700'}`}>
                    {ROLE_LABELS[r]}
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5 leading-tight">{ROLE_DESCRIPTIONS[r]}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Linked employee */}
          <div>
            <label className="label mb-2">
              Linked Employee
              {role !== 'manager' && (
                <span className="ml-1.5 text-xs text-slate-400 font-normal">(optional)</span>
              )}
            </label>

            {selectedEmp ? (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-50 border border-green-200 text-sm mb-2">
                <span className="text-green-700 font-medium">{selectedEmp.firstName} {selectedEmp.lastName}</span>
                <span className="text-green-500 text-xs">#{selectedEmp.employeeCode}</span>
                <button
                  onClick={() => { setEmployeeId(''); setSearch(''); }}
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
                      onClick={() => { setEmployeeId(String(emp.id)); setSearch(''); }}
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
                Auto-links on sign-in if login email matches the employee's work email.
              </p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between">
          <div>
            {confirmDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-red-600">Are you sure?</span>
                <button onClick={handleDelete} disabled={deleting} className="text-xs text-white bg-red-500 hover:bg-red-600 px-3 py-1.5 rounded">
                  {deleting ? 'Removing…' : 'Yes, remove'}
                </button>
                <button onClick={() => setConfirmDelete(false)} className="text-xs text-slate-500 hover:text-slate-700 px-2 py-1.5">
                  Cancel
                </button>
              </div>
            ) : (
              <button onClick={handleDelete} className="text-xs text-red-400 hover:text-red-600">
                Remove user
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="btn-secondary text-sm">Cancel</button>
            <button onClick={save} disabled={saving || !dirty} className={`btn-primary text-sm ${!dirty ? 'opacity-40 cursor-default' : ''}`}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
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
  const [editing, setEditing] = useState(null);

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

  function handleDeleted(id) {
    setUsers(prev => prev.filter(u => u.id !== id));
  }

  if (permLoading || loading) {
    return <div className="flex items-center justify-center h-64 text-slate-400">Loading…</div>;
  }

  if (!canManagePermissions) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="card p-12 text-center">
          <svg className="w-8 h-8 text-slate-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
          </svg>
          <div className="font-semibold text-slate-700">Access Restricted</div>
          <div className="text-sm text-slate-400 mt-1">Only Super Admins can manage permissions.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Permissions</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Users appear here after their first sign-in and default to Manager until assigned.
        </p>
      </div>

      {/* Role reference */}
      <div className="card p-4 mb-6 bg-slate-50 border-slate-200">
        <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Role Reference</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
          {Object.entries(ROLE_DESCRIPTIONS).map(([r, desc]) => (
            <div key={r} className="flex items-start gap-2">
              <span className={`mt-0.5 text-xs font-semibold px-2 py-0.5 rounded-full ${ROLE_BADGE[r]}`}>
                {ROLE_LABELS[r]}
              </span>
              <span className="text-xs text-slate-500 leading-relaxed">{desc}</span>
            </div>
          ))}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 mb-4 text-sm">{error}</div>
      )}

      {/* User list */}
      {users.length === 0 ? (
        <div className="card p-12 text-center text-slate-400">No users found</div>
      ) : (
        <div className="card divide-y divide-slate-100">
          {users.map(user => (
            <div key={user.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50 transition-colors">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-slate-900 truncate">
                  {user.email || user.clerkUserId}
                </div>
                <div className="text-xs text-slate-400 mt-0.5 truncate">
                  {user.employee
                    ? `${user.employee.firstName} ${user.employee.lastName}${user.employee.employeeCode ? ' · #' + user.employee.employeeCode : ''}`
                    : <span className="text-amber-500">No employee linked</span>
                  }
                </div>
              </div>
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 ${ROLE_BADGE[user.role] || 'bg-slate-100 text-slate-600'}`}>
                {ROLE_LABELS[user.role] || user.role}
              </span>
              <button
                onClick={() => setEditing(user)}
                className="btn-secondary text-xs shrink-0"
              >
                Edit
              </button>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-slate-400 mt-4">
        {users.length} user{users.length !== 1 ? 's' : ''}
      </p>

      {editing && (
        <EditModal
          user={editing}
          allEmployees={allEmployees}
          onSaved={updated => { handleSaved(updated); setEditing(null); }}
          onDeleted={id => { handleDeleted(id); setEditing(null); }}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
