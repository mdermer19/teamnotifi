import { useState, useEffect } from 'react';
import { useApi } from '../lib/api';
import { usePermissions } from '../hooks/usePermissions';

const ROLE_LABELS = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  manager: 'Manager',
};

const ROLE_DESCRIPTIONS = {
  super_admin: 'All locations · full access · can manage permissions',
  admin: 'Assigned locations only · can designate managers',
  manager: 'Assigned locations only · view-only · can assign coverage',
};

function UserRow({ user, locations, onSaved }) {
  const api = useApi();
  const [role, setRole] = useState(user.role);
  const [selectedLocIds, setSelectedLocIds] = useState(
    user.locationAccess.map(a => a.location.id)
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const dirty = role !== user.role ||
    JSON.stringify([...selectedLocIds].sort()) !== JSON.stringify([...user.locationAccess.map(a => a.location.id)].sort());

  function toggleLoc(id) {
    setSelectedLocIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    try {
      const updated = await api.updateUser(user.id, {
        role,
        locationIds: role === 'super_admin' ? [] : selectedLocIds,
      });
      onSaved(updated);
      setSaved(true);
    } catch (e) {
      alert('Failed to save: ' + e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card p-5 space-y-4">
      {/* User header */}
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

      {/* Role selector */}
      <div>
        <label className="label">Role</label>
        <div className="grid grid-cols-3 gap-2">
          {['super_admin', 'admin', 'manager'].map(r => (
            <button
              key={r}
              onClick={() => { setRole(r); setSaved(false); }}
              className={`p-3 rounded-lg border-2 text-left transition-colors ${
                role === r
                  ? 'border-forest bg-forest/5'
                  : 'border-slate-200 hover:border-slate-300'
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

      {/* Location access (not shown for super_admin) */}
      {role !== 'super_admin' && (
        <div>
          <label className="label">Location Access</label>
          <div className="flex flex-wrap gap-2">
            {locations.map(loc => {
              const active = selectedLocIds.includes(loc.id);
              return (
                <button
                  key={loc.id}
                  onClick={() => toggleLoc(loc.id)}
                  className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                    active
                      ? 'bg-forest text-white border-forest'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
                  }`}
                >
                  {loc.name}
                </button>
              );
            })}
          </div>
          {role !== 'super_admin' && selectedLocIds.length === 0 && (
            <p className="text-xs text-amber-600 mt-2">No locations selected — this user will see no data.</p>
          )}
        </div>
      )}

      {role === 'super_admin' && (
        <p className="text-xs text-slate-400">Super Admins have access to all locations automatically.</p>
      )}
    </div>
  );
}

export default function Permissions() {
  const api = useApi();
  const { canManagePermissions, me, loading: permLoading } = usePermissions();
  const [users, setUsers] = useState([]);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (permLoading) return;
    if (!canManagePermissions) { setLoading(false); return; }

    Promise.all([api.getUsers(), api.getLocations()])
      .then(([u, l]) => { setUsers(u); setLocations(l); })
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
          Manage roles and location access. Users appear here after their first sign-in.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 mb-4 text-sm">{error}</div>
      )}

      {/* Role reference card */}
      <div className="card p-4 mb-6 bg-slate-50 border-slate-200">
        <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-3">Role Reference</div>
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <div className="font-medium text-slate-700">Super Admin</div>
            <ul className="text-slate-500 text-xs mt-1 space-y-0.5">
              <li>• All locations</li>
              <li>• Manage users & permissions</li>
              <li>• Designate managers</li>
            </ul>
          </div>
          <div>
            <div className="font-medium text-slate-700">Admin</div>
            <ul className="text-slate-500 text-xs mt-1 space-y-0.5">
              <li>• Assigned locations only</li>
              <li>• Designate managers (their locations)</li>
              <li>• Cannot edit permissions</li>
            </ul>
          </div>
          <div>
            <div className="font-medium text-slate-700">Manager</div>
            <ul className="text-slate-500 text-xs mt-1 space-y-0.5">
              <li>• Assigned locations only</li>
              <li>• View-only + assign coverage</li>
              <li>• Cannot designate managers</li>
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
              locations={locations}
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
