import { useState, useEffect, useCallback } from 'react';

const BASE = '/api';
const req = (path, opts = {}) =>
  fetch(`${BASE}${path}`, { headers: { 'Content-Type': 'application/json' }, ...opts }).then(r => r.json());

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function coverageStatus(c) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const start = new Date(c.startDate); const end = new Date(c.endDate);
  if (!c.active) return { label: 'Inactive', cls: 'badge-slate' };
  if (start > today) return { label: 'Upcoming', cls: 'badge bg-blue-100 text-blue-700' };
  if (end < today)   return { label: 'Past', cls: 'badge-slate' };
  return { label: 'Active', cls: 'badge-green' };
}

// ── Coverage Modal ──────────────────────────────────────────────────────
function CoverageModal({ managers, existing, onClose, onSave }) {
  const [form, setForm] = useState({
    absentManagerId: existing?.absentManager?.id || '',
    covererIds: existing?.coverers?.map(c => c.manager.id) || [],
    startDate: existing?.startDate ? existing.startDate.slice(0, 10) : '',
    startTime: existing?.startTime || '00:00',
    endDate:   existing?.endDate   ? existing.endDate.slice(0, 10)   : '',
    endTime:   existing?.endTime   || '23:59',
    reason: existing?.reason || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  function toggleCoverer(id) {
    setForm(f => ({
      ...f,
      covererIds: f.covererIds.includes(id)
        ? f.covererIds.filter(x => x !== id)
        : [...f.covererIds, id],
    }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.covererIds.length) { setError('Select at least one covering manager.'); return; }
    setSaving(true); setError(null);
    try {
      if (existing) {
        await req(`/coverage/${existing.id}`, { method: 'PUT', body: JSON.stringify(form) });
      } else {
        await req('/coverage', { method: 'POST', body: JSON.stringify(form) });
      }
      onSave(); onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const availableCoverers = managers.filter(m => m.id !== parseInt(form.absentManagerId));

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="font-semibold text-slate-900">{existing ? 'Edit Coverage' : 'Set Up Coverage'}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl">&times;</button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>}

          <div>
            <label className="label">Manager who is out *</label>
            <select className="input" required value={form.absentManagerId}
              onChange={e => setForm(f => ({ ...f, absentManagerId: e.target.value, covererIds: [] }))}>
              <option value="">Select manager…</option>
              {managers.map(m => <option key={m.id} value={m.id}>{m.firstName} {m.lastName}</option>)}
            </select>
          </div>

          <div>
            <label className="label">Who is covering? (select all that apply) *</label>
            {availableCoverers.length === 0 ? (
              <p className="text-sm text-slate-400">Select a manager above first.</p>
            ) : (
              <div className="border border-slate-200 rounded-lg divide-y max-h-48 overflow-y-auto">
                {availableCoverers.map(m => (
                  <label key={m.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.covererIds.includes(m.id)}
                      onChange={() => toggleCoverer(m.id)}
                      className="rounded"
                    />
                    <span className="text-sm text-slate-800">{m.firstName} {m.lastName}
                      {m.role && <span className="text-slate-400 ml-1 capitalize">· {m.role.replace('_', ' ')}</span>}
                    </span>
                  </label>
                ))}
              </div>
            )}
            {form.covererIds.length > 0 && (
              <p className="text-xs text-slate-500 mt-1">{form.covererIds.length} selected — all will receive notifications</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Start date *</label>
              <input type="date" className="input" required value={form.startDate}
                onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} />
            </div>
            <div>
              <label className="label">Start time *</label>
              <input type="time" className="input" required value={form.startTime}
                onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))} />
            </div>
            <div>
              <label className="label">End date *</label>
              <input type="date" className="input" required value={form.endDate}
                onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} />
            </div>
            <div>
              <label className="label">End time *</label>
              <input type="time" className="input" required value={form.endTime}
                onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))} />
            </div>
          </div>
          {form.startDate && form.startTime && (() => {
            const start = new Date(`${form.startDate}T${form.startTime}`);
            if (start < new Date()) return (
              <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded px-2 py-1.5">
                Start time is in the past — coverage will go into effect immediately upon saving.
              </p>
            );
          })()}

          <div>
            <label className="label">Reason (optional)</label>
            <input className="input" placeholder="Vacation, leave, etc." value={form.reason}
              onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary flex-1">
              {saving ? 'Saving…' : existing ? 'Save Changes' : 'Create Coverage'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Subscription Modal ──────────────────────────────────────────────────
function SubscriptionModal({ managers, onClose, onSave }) {
  const [subscriberId, setSubscriberId] = useState('');
  const [teamOwnerId, setTeamOwnerId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true); setError(null);
    try {
      const result = await req('/coverage/subscriptions', {
        method: 'POST',
        body: JSON.stringify({ subscriberId, teamOwnerId }),
      });
      if (result.error) throw new Error(result.error);
      onSave(); onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="font-semibold text-slate-900">Add Team Subscription</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl">&times;</button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>}

          <div>
            <label className="label">Manager receiving extra notifications</label>
            <select className="input" required value={subscriberId} onChange={e => setSubscriberId(e.target.value)}>
              <option value="">Select manager…</option>
              {managers.map(m => <option key={m.id} value={m.id}>{m.firstName} {m.lastName}</option>)}
            </select>
          </div>

          <div>
            <label className="label">Whose team they're added to</label>
            <select className="input" required value={teamOwnerId} onChange={e => setTeamOwnerId(e.target.value)}>
              <option value="">Select team…</option>
              {managers.filter(m => m.id !== parseInt(subscriberId)).map(m =>
                <option key={m.id} value={m.id}>{m.firstName} {m.lastName}'s team</option>
              )}
            </select>
          </div>

          <p className="text-xs text-slate-500">
            After saving, <strong>{managers.find(m => m.id === parseInt(subscriberId))?.firstName || 'this manager'}</strong> will
            receive all absence notifications for {managers.find(m => m.id === parseInt(teamOwnerId))?.firstName || 'that'}'s team in addition to their own.
          </p>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary flex-1">
              {saving ? 'Saving…' : 'Add Subscription'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────────────────
export default function Coverage() {
  const [coverage, setCoverage] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [managers, setManagers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // null | 'coverage' | 'subscription' | coverage-object
  const [statusFilter, setStatusFilter] = useState('active');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cov, subs, emps] = await Promise.all([
        req(`/coverage?status=${statusFilter}`),
        req('/coverage/subscriptions'),
        req('/employees?active=true'),
      ]);
      setCoverage(Array.isArray(cov) ? cov : []);
      setSubscriptions(Array.isArray(subs) ? subs : []);
      setManagers(Array.isArray(emps) ? emps.filter(e => e.isManager) : []);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  async function deactivate(id) {
    if (!confirm('Deactivate this coverage period?')) return;
    await req(`/coverage/${id}`, { method: 'DELETE' });
    load();
  }

  async function removeSub(id) {
    if (!confirm('Remove this team subscription?')) return;
    await req(`/coverage/subscriptions/${id}`, { method: 'DELETE' });
    load();
  }

  const activeCoverage = coverage.filter(c => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return c.active && new Date(c.startDate) <= today && new Date(c.endDate) >= today;
  });

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Coverage & Teams</h1>
          <p className="text-sm text-slate-500 mt-0.5">Control who gets notified for whose team</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setModal('subscription')} className="btn-secondary">+ Team Subscription</button>
          <button onClick={() => setModal('coverage')} className="btn-primary">+ Coverage Period</button>
        </div>
      </div>

      {/* Active coverage banner */}
      {activeCoverage.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <p className="text-sm font-medium text-amber-800 mb-2">⚠️ Active coverage in effect</p>
          {activeCoverage.map(c => (
            <p key={c.id} className="text-sm text-amber-700">
              <strong>{c.absentManager.firstName} {c.absentManager.lastName}</strong> is out through {formatDate(c.endDate)} —
              notifications routing to: {c.coverers.map(cv => `${cv.manager.firstName} ${cv.manager.lastName}`).join(', ')} · ends {formatDate(c.endDate)} at {c.endTime}
            </p>
          ))}
        </div>
      )}

      {/* Coverage periods */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="font-semibold text-slate-900">Coverage Periods</h2>
          <div className="flex gap-1">
            {['active', 'upcoming', 'past', 'all'].map(s => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`px-3 py-1 rounded-md text-xs font-medium capitalize transition-colors ${statusFilter === s ? 'bg-forest text-white' : 'text-slate-500 hover:bg-slate-100'}`}>
                {s}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="p-8 text-center text-slate-400">Loading…</div>
        ) : coverage.length === 0 ? (
          <div className="p-8 text-center text-slate-400">No coverage periods found</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {coverage.map(c => {
              const status = coverageStatus(c);
              return (
                <div key={c.id} className="p-4 flex items-start gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-slate-900">
                        {c.absentManager.firstName} {c.absentManager.lastName}
                      </span>
                      <span className="text-slate-400">is out</span>
                      <span className={status.cls}>{status.label}</span>
                      {c.reason && <span className="text-xs text-slate-400">· {c.reason}</span>}
                    </div>
                    <p className="text-sm text-slate-500 mt-1">
                      {formatDate(c.startDate)} {c.startTime} – {formatDate(c.endDate)} {c.endTime}
                    </p>
                    <div className="flex flex-wrap gap-1 mt-2">
                      <span className="text-xs text-slate-500">Covered by:</span>
                      {c.coverers.map(cv => (
                        <span key={cv.id} className="badge-slate">
                          {cv.manager.firstName} {cv.manager.lastName}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <button onClick={() => setModal(c)} className="btn-ghost">Edit</button>
                    {c.active && <button onClick={() => deactivate(c.id)} className="btn-ghost text-red-500 hover:bg-red-50">End</button>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Team subscriptions */}
      <div className="card overflow-hidden">
        <div className="p-4 border-b">
          <h2 className="font-semibold text-slate-900">Team Subscriptions</h2>
          <p className="text-xs text-slate-500 mt-0.5">Permanent — these managers receive notifications for additional teams on top of their own</p>
        </div>

        {subscriptions.length === 0 ? (
          <div className="p-8 text-center text-slate-400">No team subscriptions yet</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {subscriptions.map(s => (
              <div key={s.id} className="flex items-center gap-3 p-4">
                <div className="flex-1 text-sm">
                  <span className="font-medium text-slate-900">{s.subscriber.firstName} {s.subscriber.lastName}</span>
                  <span className="text-slate-400 mx-2">receives notifications for</span>
                  <span className="font-medium text-slate-900">{s.teamOwner.firstName} {s.teamOwner.lastName}'s team</span>
                </div>
                <button onClick={() => removeSub(s.id)} className="btn-ghost text-red-500 hover:bg-red-50 text-xs">Remove</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      {(modal === 'coverage' || (modal && typeof modal === 'object')) && (
        <CoverageModal
          managers={managers}
          existing={typeof modal === 'object' ? modal : null}
          onClose={() => setModal(null)}
          onSave={load}
        />
      )}
      {modal === 'subscription' && (
        <SubscriptionModal
          managers={managers}
          onClose={() => setModal(null)}
          onSave={load}
        />
      )}
    </div>
  );
}
