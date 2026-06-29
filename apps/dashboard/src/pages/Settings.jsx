import { useState, useEffect, useCallback } from 'react';
import { useApi } from '../lib/api';
import { usePermissions } from '../hooks/usePermissions';

const TEMPLATE_GROUPS = [
  { label: 'Getting Started', keys: ['UNKNOWN_PHONE', 'CONFIRM_START'] },
  { label: 'Date & Reason', keys: ['CONFIRM_DATE', 'INVALID_DATE', 'SELECT_REASON', 'INVALID_REASON'] },
  { label: 'Sick Leave', keys: ['SICK_NOTE_PROMPT', 'SICK_YES_NOTE', 'SICK_NO_NOTE', 'SICK_REPROMPT'] },
  { label: 'Family / Emergency', keys: ['FAMILY_DETAILS_PROMPT', 'FAMILY_DETAILS_ACK', 'FAMILY_PROOF_PROMPT', 'FAMILY_YES_PROOF', 'FAMILY_NO_PROOF', 'FAMILY_REPROMPT'] },
  { label: 'Late Arrival', keys: ['LATE_MESSAGE'] },
  { label: 'Other Reason', keys: ['OTHER_DETAILS_PROMPT', 'OTHER_DONE'] },
  { label: 'Multi-Day Absence', keys: ['MULTI_DAY_PROMPT', 'RETURN_DATE_PROMPT', 'INVALID_RETURN_DATE'] },
  { label: 'General', keys: ['CANCEL', 'REPROMPT', 'DUPLICATE_ABSENCE', 'ABSENCE_CONFIRMED'] },
];

function TemplateCard({ template, onSave }) {
  const [text, setText] = useState(template.template);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const dirty = text !== template.template;
  const charCount = text.length;
  const smsSegments = Math.ceil(charCount / 160) || 1;
  const isModified = template.template !== template.defaultTemplate;

  function insertVariable(v) {
    setText(prev => prev + `{{${v}}}`);
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    try {
      await onSave(template.key, text);
      setSaved(true);
    } catch (e) {
      alert('Failed to save: ' + e.message);
    } finally {
      setSaving(false);
    }
  }

  function reset() {
    setText(template.defaultTemplate);
    setSaved(false);
  }

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-slate-50 transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-slate-800 text-sm">{template.label}</span>
            {isModified && (
              <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full flex-shrink-0">
                Modified
              </span>
            )}
          </div>
          {!expanded && (
            <div className="text-xs text-slate-400 mt-0.5 truncate">{template.template}</div>
          )}
        </div>
        <svg
          className={`w-4 h-4 text-slate-400 transition-transform flex-shrink-0 ml-3 ${expanded ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-slate-100 bg-white">
          {template.description && (
            <p className="text-xs text-slate-500 mt-3 mb-2">{template.description}</p>
          )}

          {template.variables.length > 0 && (
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="text-xs text-slate-400">Insert variable:</span>
              {template.variables.map(v => (
                <button
                  key={v}
                  onClick={() => insertVariable(v)}
                  title={`Click to append {{${v}}}`}
                  className="text-xs font-mono bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded hover:bg-blue-100 transition-colors"
                >
                  {`{{${v}}}`}
                </button>
              ))}
            </div>
          )}

          <textarea
            value={text}
            onChange={e => { setText(e.target.value); setSaved(false); }}
            rows={Math.max(3, text.split('\n').length + 1)}
            className="w-full text-sm font-mono border border-slate-200 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-forest/30 focus:border-forest resize-none"
          />

          <div className="flex items-center justify-between mt-2">
            <span className={`text-xs ${charCount > 160 ? 'text-amber-600 font-medium' : 'text-slate-400'}`}>
              {charCount} chars · {smsSegments} segment{smsSegments !== 1 ? 's' : ''}
              {charCount > 160 && ' — may split into multiple texts'}
            </span>
            <div className="flex items-center gap-3">
              {saved && !dirty && <span className="text-xs text-green-600">Saved ✓</span>}
              {isModified && (
                <button onClick={reset} className="text-xs text-slate-400 hover:text-slate-600 underline">
                  Reset to default
                </button>
              )}
              <button
                onClick={save}
                disabled={saving || !dirty}
                className={`btn-primary text-sm py-1.5 ${!dirty ? 'opacity-40 cursor-default' : ''}`}
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function WorkflowTab({ settings, onSave }) {
  const [values, setValues] = useState(() =>
    Object.fromEntries(settings.map(s => [s.key, s.value]))
  );
  const [saving, setSaving] = useState({});
  const [saved, setSaved] = useState({});

  function originalValue(key) {
    return settings.find(s => s.key === key)?.value;
  }

  function isDirty(key) {
    return values[key] !== originalValue(key);
  }

  async function save(key) {
    setSaving(prev => ({ ...prev, [key]: true }));
    try {
      await onSave(key, values[key]);
      setSaved(prev => ({ ...prev, [key]: true }));
    } catch (e) {
      alert('Failed to save: ' + e.message);
    } finally {
      setSaving(prev => ({ ...prev, [key]: false }));
    }
  }

  return (
    <div className="space-y-4">
      {settings.map(setting => (
        <div key={setting.key} className="card p-5">
          <div className="flex items-start justify-between gap-6">
            <div className="flex-1">
              <div className="font-medium text-slate-800">{setting.label}</div>
              {setting.description && (
                <div className="text-sm text-slate-500 mt-1 leading-relaxed">{setting.description}</div>
              )}
            </div>
            <div className="flex items-center gap-3 flex-shrink-0 pt-0.5">
              {setting.type === 'boolean' ? (
                <button
                  onClick={() => {
                    const next = values[setting.key] === 'true' ? 'false' : 'true';
                    setValues(prev => ({ ...prev, [setting.key]: next }));
                    setSaved(prev => ({ ...prev, [setting.key]: false }));
                  }}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                    values[setting.key] === 'true' ? 'bg-forest' : 'bg-slate-200'
                  }`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                    values[setting.key] === 'true' ? 'translate-x-6' : 'translate-x-1'
                  }`} />
                </button>
              ) : (
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    value={values[setting.key]}
                    onChange={e => {
                      setValues(prev => ({ ...prev, [setting.key]: e.target.value }));
                      setSaved(prev => ({ ...prev, [setting.key]: false }));
                    }}
                    min="1"
                    max="120"
                    className="input w-20 text-center"
                  />
                  <span className="text-sm text-slate-500">min</span>
                </div>
              )}
              <div className="flex items-center gap-2">
                {saved[setting.key] && !isDirty(setting.key) && (
                  <span className="text-xs text-green-600">Saved ✓</span>
                )}
                <button
                  onClick={() => save(setting.key)}
                  disabled={saving[setting.key] || !isDirty(setting.key)}
                  className={`btn-primary text-sm py-1.5 ${!isDirty(setting.key) ? 'opacity-40 cursor-default' : ''}`}
                >
                  {saving[setting.key] ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ))}

      <div className="card p-4 bg-slate-50 border-slate-200">
        <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">Note</div>
        <p className="text-sm text-slate-500">
          Workflow changes take effect within 5 minutes. Active SMS conversations already in progress will not be affected until their next reply.
        </p>
      </div>
    </div>
  );
}

export default function Settings() {
  const api = useApi();
  const { isSuperAdmin, loading: permLoading } = usePermissions() || {};
  const [tab, setTab] = useState('messages');
  const [templates, setTemplates] = useState([]);
  const [workflowSettings, setWorkflowSettings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (permLoading) return;
    if (!isSuperAdmin) { setLoading(false); return; }

    Promise.all([api.getTemplates(), api.getWorkflowSettings()])
      .then(([t, w]) => { setTemplates(t); setWorkflowSettings(w); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [permLoading, isSuperAdmin]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSaveTemplate = useCallback(async (key, text) => {
    const updated = await api.updateTemplate(key, { template: text });
    setTemplates(prev => prev.map(t => t.key === key ? { ...t, template: updated.template } : t));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSaveWorkflow = useCallback(async (key, value) => {
    const updated = await api.updateWorkflowSetting(key, { value });
    setWorkflowSettings(prev => prev.map(s => s.key === key ? { ...s, value: updated.value } : s));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (permLoading || loading) {
    return <div className="flex items-center justify-center h-64 text-slate-400">Loading…</div>;
  }

  if (!isSuperAdmin) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="card p-12 text-center">
          <div className="text-4xl mb-3">🔒</div>
          <div className="font-semibold text-slate-700">Access Restricted</div>
          <div className="text-sm text-slate-400 mt-1">Only Super Admins can manage settings.</div>
        </div>
      </div>
    );
  }

  const templateMap = Object.fromEntries(templates.map(t => [t.key, t]));

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Edit SMS messages and configure workflow behavior. Changes apply within 5 minutes.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 mb-4 text-sm">{error}</div>
      )}

      <div className="flex gap-1 mb-6 border-b border-slate-200">
        {[
          { key: 'messages', label: 'SMS Messages' },
          { key: 'workflow', label: 'Workflow' },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.key
                ? 'border-forest text-forest'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'messages' && (
        <div className="space-y-6">
          <p className="text-sm text-slate-500">
            Click any message to expand and edit it. Use <span className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded">{'{{variable}}'}</span> placeholders where dynamic values should appear.
          </p>
          {TEMPLATE_GROUPS.map(group => {
            const groupTemplates = group.keys.map(k => templateMap[k]).filter(Boolean);
            if (groupTemplates.length === 0) return null;
            return (
              <div key={group.label}>
                <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  {group.label}
                </div>
                <div className="space-y-2">
                  {groupTemplates.map(t => (
                    <TemplateCard key={t.key} template={t} onSave={handleSaveTemplate} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab === 'workflow' && workflowSettings.length > 0 && (
        <WorkflowTab settings={workflowSettings} onSave={handleSaveWorkflow} />
      )}
    </div>
  );
}
