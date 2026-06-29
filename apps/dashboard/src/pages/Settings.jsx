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

function Node({ x, y, w = 160, h = 40, color = '#042878', label, sub, dashed = false }) {
  return (
    <g>
      <rect x={x - w / 2} y={y} width={w} height={h} rx="6"
        fill={color === 'terminal' ? '#fef9c3' : color === 'toggle' ? '#f1f5f9' : color}
        stroke={color === 'terminal' ? '#ca8a04' : color === 'toggle' ? '#94a3b8' : 'none'}
        strokeWidth="1.5" strokeDasharray={dashed ? '5,3' : undefined}
      />
      <text x={x} y={y + (sub ? 14 : 22)} textAnchor="middle" fontSize="11" fontWeight="600"
        fill={color === 'terminal' ? '#92400e' : color === 'toggle' ? '#334155' : 'white'}>
        {label}
      </text>
      {sub && <text x={x} y={y + 30} textAnchor="middle" fontSize="9"
        fill={color === 'terminal' ? '#b45309' : color === 'toggle' ? '#64748b' : '#93c5fd'}>
        {sub}
      </text>}
    </g>
  );
}

function Arrow({ x1, y1, x2, y2, color = '#94a3b8', label, labelX, labelY, dashed = false }) {
  const id = `arr-${color.replace('#', '')}`;
  return (
    <g>
      <defs>
        <marker id={id} markerWidth="7" markerHeight="7" refX="5" refY="3" orient="auto">
          <path d="M0,0 L0,6 L7,3 z" fill={color} />
        </marker>
      </defs>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth="1.5"
        strokeDasharray={dashed ? '4,2' : undefined} markerEnd={`url(#${id})`} />
      {label && <text x={labelX ?? (x1 + x2) / 2 + 4} y={labelY ?? (y1 + y2) / 2}
        fontSize="9" fill={color}>{label}</text>}
    </g>
  );
}

function ConversationFlowDiagram() {
  const GREEN = '#16a34a', RED = '#dc2626', BLUE = '#2563eb', GRAY = '#94a3b8';
  return (
    <svg viewBox="0 0 760 820" style={{ minWidth: 600, width: '100%' }} xmlns="http://www.w3.org/2000/svg">
      {/* Col centers: SICK=110, EMERG=270, LATE=480, OTHER=640 */}

      {/* IDENTIFY */}
      <Node x={380} y={10} w={170} label="IDENTIFY" sub="phone lookup / EE ID" />
      <Arrow x1={380} y1={50} x2={380} y2={70} color={GRAY} />

      {/* CONFIRM_START */}
      <Node x={380} y={70} w={170} label="CONFIRM_START" sub='"Reporting an absence?"' />
      {/* NO → CANCEL */}
      <Arrow x1={295} y1={90} x2={200} y2={90} color={RED} label="NO" labelX={240} labelY={85} />
      <Node x={150} y={70} w={90} color="terminal" label="CANCEL" />
      {/* YES ↓ */}
      <Arrow x1={380} y1={110} x2={380} y2={130} color={GREEN} label="YES" labelX={385} labelY={125} />

      {/* CONFIRM_DATE */}
      <Node x={380} y={130} w={170} label="CONFIRM_DATE" sub='"What date?"' />
      <Arrow x1={380} y1={170} x2={380} y2={190} color={GRAY} label="valid date" labelX={385} labelY={185} />

      {/* SELECT_REASON */}
      <Node x={380} y={190} w={170} label="SELECT_REASON" sub='"1-Sick 2-Emerg 3-Late 4-Other"' />

      {/* Branch lines down from SELECT_REASON */}
      {/* 1-SICK */}
      <path d="M295,210 L110,210 L110,270" stroke={BLUE} strokeWidth="1.5" fill="none" markerEnd="url(#arr-2563eb)" />
      <text x={200} y={205} fontSize="9" fill={BLUE}>1-Sick</text>
      {/* 2-EMERG */}
      <path d="M340,230 L340,250 L270,250 L270,270" stroke={BLUE} strokeWidth="1.5" fill="none" markerEnd="url(#arr-2563eb)" />
      <text x={290} y={248} fontSize="9" fill={BLUE}>2-Emerg</text>
      {/* 3-LATE */}
      <path d="M420,230 L420,250 L480,250 L480,270" stroke={BLUE} strokeWidth="1.5" fill="none" markerEnd="url(#arr-2563eb)" />
      <text x={435} y={248} fontSize="9" fill={BLUE}>3-Late</text>
      {/* 4-OTHER */}
      <path d="M465,210 L640,210 L640,270" stroke={BLUE} strokeWidth="1.5" fill="none" markerEnd="url(#arr-2563eb)" />
      <text x={545} y={205} fontSize="9" fill={BLUE}>4-Other</text>

      {/* LATE terminal */}
      <Node x={480} y={270} w={130} color="terminal" label="LATE logged" sub="LATE_MESSAGE" />

      {/* MULTI_DAY_PROMPT — toggle controlled (dashed) */}
      <Node x={110} y={270} w={160} color="toggle" dashed label="MULTI_DAY_PROMPT" sub='"Out more than 1 day?"' />
      <Node x={270} y={270} w={160} color="toggle" dashed label="MULTI_DAY_PROMPT" sub='"Out more than 1 day?"' />
      <Node x={640} y={270} w={160} color="toggle" dashed label="MULTI_DAY_PROMPT" sub='"Out more than 1 day?"' />

      {/* YES → RETURN_DATE */}
      <Arrow x1={80} y1={310} x2={80} y2={365} color={GREEN} label="YES" labelX={55} labelY={342} />
      <Arrow x1={240} y1={310} x2={240} y2={365} color={GREEN} label="YES" labelX={215} labelY={342} />
      <Arrow x1={610} y1={310} x2={610} y2={365} color={GREEN} label="YES" labelX={585} labelY={342} />

      {/* NO → skip to reason state */}
      <Arrow x1={140} y1={310} x2={140} y2={440} color={RED} label="NO" labelX={145} labelY={380} dashed />
      <Arrow x1={300} y1={310} x2={300} y2={440} color={RED} label="NO" labelX={305} labelY={380} dashed />
      <Arrow x1={670} y1={310} x2={670} y2={440} color={RED} label="NO" labelX={675} labelY={380} dashed />

      {/* RETURN_DATE_PROMPT */}
      <Node x={80} y={365} w={130} label="RETURN_DATE" sub="_PROMPT" />
      <Node x={240} y={365} w={130} label="RETURN_DATE" sub="_PROMPT" />
      <Node x={610} y={365} w={130} label="RETURN_DATE" sub="_PROMPT" />
      <Arrow x1={80} y1={405} x2={80} y2={440} color={GRAY} />
      <Arrow x1={240} y1={405} x2={240} y2={440} color={GRAY} />
      <Arrow x1={610} y1={405} x2={610} y2={440} color={GRAY} />

      {/* REASON STATES */}
      {/* SICK_NOTE_PROMPT — toggle dashed */}
      <Node x={110} y={440} w={170} color="toggle" dashed label="SICK_NOTE_PROMPT" sub='"Will you get a dr note?"' />
      {/* FAMILY_DETAILS */}
      <Node x={270} y={440} w={160} label="FAMILY_DETAILS" sub='"Describe the emergency"' />
      {/* OTHER_DETAILS */}
      <Node x={640} y={440} w={160} label="OTHER_DETAILS" sub='"Describe the reason"' />

      {/* SICK YES/NO */}
      <Arrow x1={70} y1={480} x2={70} y2={540} color={GREEN} label="YES" labelX={45} labelY={515} />
      <Arrow x1={150} y1={480} x2={150} y2={540} color={RED} label="NO" labelX={155} labelY={515} />

      {/* FAMILY → FAMILY_PROOF_PROMPT (toggle) */}
      <Arrow x1={270} y1={480} x2={270} y2={540} color={GRAY} />

      {/* OTHER terminal */}
      <Arrow x1={640} y1={480} x2={640} y2={540} color={GRAY} />
      <Node x={640} y={540} w={160} color="terminal" label="OTHER logged" sub="OTHER_DONE sent" />

      {/* SICK terminals */}
      <Node x={70} y={540} w={120} color="terminal" label="SICK logged" sub="note promised" />
      <Node x={150} y={540} w={120} color="terminal" label="SICK logged" sub="no note · 2 pts" />

      {/* FAMILY_PROOF_PROMPT — toggle dashed */}
      <Node x={270} y={540} w={170} color="toggle" dashed label="FAMILY_PROOF_PROMPT" sub='"Can you provide proof?"' />
      <Arrow x1={230} y1={580} x2={230} y2={640} color={GREEN} label="YES" labelX={205} labelY={615} />
      <Arrow x1={310} y1={580} x2={310} y2={640} color={RED} label="NO" labelX={315} labelY={615} />

      {/* EMERG terminals */}
      <Node x={230} y={640} w={130} color="terminal" label="EMERG logged" sub="proof promised" />
      <Node x={310} y={640} w={130} color="terminal" label="EMERG logged" sub="no proof" />

      {/* Legend */}
      <rect x={0} y={750} width={760} height={68} rx="6" fill="#f8fafc" stroke="#e2e8f0" strokeWidth="1" />
      <rect x={16} y={764} width={16} height={12} rx="2" fill="#042878" />
      <text x={38} y={774} fontSize="10" fill="#475569">State / message node</text>
      <rect x={160} y={764} width={16} height={12} rx="2" fill="#f1f5f9" stroke="#94a3b8" strokeWidth="1" strokeDasharray="4,2" />
      <text x={182} y={774} fontSize="10" fill="#475569">Toggle-controlled step</text>
      <rect x={340} y={764} width={16} height={12} rx="2" fill="#fef9c3" stroke="#ca8a04" strokeWidth="1" />
      <text x={362} y={774} fontSize="10" fill="#475569">Terminal (absence logged)</text>
      <text x={16} y={800} fontSize="10" fill={GREEN}>— YES reply  </text>
      <text x={80} y={800} fontSize="10" fill={RED}>— NO reply  </text>
      <text x={136} y={800} fontSize="10" fill={BLUE}>— 1/2/3/4 reply  </text>
      <text x={240} y={800} fontSize="10" fill={GRAY}>— automatic / any valid input</text>
      <text x={460} y={800} fontSize="10" fill="#94a3b8">Dashed arrows = NO skips the toggle step</text>
    </svg>
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
          { key: 'flow', label: 'Conversation Flow' },
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

      {tab === 'flow' && (
        <div className="card p-4 overflow-x-auto">
          <ConversationFlowDiagram />
        </div>
      )}
    </div>
  );
}
