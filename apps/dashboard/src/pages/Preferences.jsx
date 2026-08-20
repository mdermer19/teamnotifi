import { useState, useEffect } from 'react';
import { useApi } from '../lib/api';
import { usePermissions } from '../hooks/usePermissions';

const TOGGLES = [
  {
    key: 'notifyDirectReports',
    label: 'Direct reports',
    description: 'Text me when someone who reports to me calls out.',
    locked: true,
  },
  {
    key: 'notifyTeamSubs',
    label: 'Team subscriptions',
    description: 'Text me about call-outs on teams I subscribe to.',
  },
  {
    key: 'notifyCoverage',
    label: 'Active coverage periods',
    description: "Text me about call-outs on a team I'm covering for right now.",
    locked: true,
  },
];

function Toggle({ checked, onChange, disabled, locked }) {
  return (
    <button
      onClick={onChange}
      disabled={disabled}
      role="switch"
      aria-checked={checked}
      aria-disabled={locked}
      title={locked ? 'You do not have permission to turn this off.' : undefined}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none flex-shrink-0 ${
        checked ? 'bg-forest' : 'bg-slate-200'
      } ${disabled ? 'opacity-50 cursor-default' : ''} ${locked ? 'opacity-60 cursor-not-allowed' : ''}`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

export default function Preferences() {
  const api = useApi();
  const { me, loading: permLoading } = usePermissions() || {};
  const [prefs, setPrefs] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState({});
  const [saved, setSaved] = useState({});

  useEffect(() => {
    if (permLoading) return;
    if (!me?.employeeId) { setLoading(false); return; }

    api.getMyNotificationPreferences()
      .then(setPrefs)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [permLoading, me?.employeeId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function toggle(key, locked) {
    if (locked) {
      alert('You do not have permission to turn this off.');
      return;
    }
    const next = !prefs[key];
    setPrefs(prev => ({ ...prev, [key]: next }));
    setSaving(prev => ({ ...prev, [key]: true }));
    setSaved(prev => ({ ...prev, [key]: false }));
    try {
      const updated = await api.updateMyNotificationPreferences({ [key]: next });
      setPrefs(prev => ({ ...prev, ...updated }));
      setSaved(prev => ({ ...prev, [key]: true }));
    } catch (e) {
      // Revert on failure
      setPrefs(prev => ({ ...prev, [key]: !next }));
      alert('Failed to save: ' + e.message);
    } finally {
      setSaving(prev => ({ ...prev, [key]: false }));
    }
  }

  if (permLoading || loading) {
    return <div className="flex items-center justify-center h-64 text-slate-400">Loading…</div>;
  }

  if (!me?.employeeId) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="card p-12 text-center">
          <div className="text-4xl mb-3">🔒</div>
          <div className="font-semibold text-slate-700">No employee record linked</div>
          <div className="text-sm text-slate-400 mt-1">
            Your account isn't linked to an employee record, so there's nothing to configure notifications for.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Notification Preferences</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Choose which call-out text messages you receive.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 mb-4 text-sm">{error}</div>
      )}

      {prefs && (
        <div className="space-y-4">
          {TOGGLES.map(t => (
            <div key={t.key} className="card p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="font-medium text-slate-800">{t.label}</div>
                  <div className="text-sm text-slate-500 mt-1 leading-relaxed">{t.description}</div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 pt-0.5">
                  {t.locked && <span className="text-xs text-slate-400">Always on</span>}
                  {!t.locked && saved[t.key] && <span className="text-xs text-green-600">Saved ✓</span>}
                  <Toggle
                    checked={t.locked ? true : !!prefs[t.key]}
                    disabled={saving[t.key]}
                    locked={t.locked}
                    onChange={() => toggle(t.key, t.locked)}
                  />
                </div>
              </div>
            </div>
          ))}

          <div className="card p-4 bg-slate-50 border-slate-200">
            <p className="text-sm text-slate-500">
              Changes save immediately and take effect right away.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
