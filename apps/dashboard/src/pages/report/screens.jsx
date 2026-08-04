import { useState, useEffect } from 'react';

// Shared look: big touch targets, generous spacing, nothing decorative.
const BIG_BTN =
  'w-full min-h-[64px] rounded-xl border-2 px-5 py-4 text-left text-lg font-medium ' +
  'transition-colors disabled:opacity-50 disabled:cursor-not-allowed';

const PRIMARY =
  'w-full min-h-[60px] rounded-xl bg-forest px-5 py-4 text-lg font-semibold text-white ' +
  'transition-colors active:bg-forest-light disabled:opacity-50 disabled:cursor-not-allowed';

function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function prettyDate(iso) {
  if (!iso) return '';
  return new Date(`${iso}T00:00:00.000Z`).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC',
  });
}

export function DateScreen({ screen, busy, onSubmit }) {
  const [value, setValue] = useState(screen.answer || '');
  useEffect(() => { setValue(screen.answer || ''); }, [screen.state, screen.answer]);

  const quickPicks = screen.today
    ? [
        { label: 'Today', value: screen.today },
        { label: 'Tomorrow', value: addDays(screen.today, 1) },
      ]
    : [];

  return (
    <div className="space-y-4">
      {quickPicks.length > 0 && (
        <div className="space-y-3">
          {quickPicks.map((q) => (
            <button
              key={q.label}
              type="button"
              disabled={busy}
              onClick={() => onSubmit(q.value)}
              className={`${BIG_BTN} border-slate-300 bg-white active:bg-slate-50`}
            >
              <span className="block">{q.label}</span>
              <span className="block text-sm font-normal text-slate-500">
                {prettyDate(q.value)}
              </span>
            </button>
          ))}
          <div className="pt-2 text-center text-sm text-slate-500">or pick a date</div>
        </div>
      )}

      <input
        type="date"
        value={value}
        min={screen.min}
        max={screen.max}
        disabled={busy}
        onChange={(e) => setValue(e.target.value)}
        className="w-full rounded-xl border-2 border-slate-300 px-4 py-4 text-lg
                   focus:border-forest focus:outline-none"
      />

      <button
        type="button"
        disabled={busy || !value}
        onClick={() => onSubmit(value)}
        className={PRIMARY}
      >
        Continue
      </button>
    </div>
  );
}

export function ReasonScreen({ screen, busy, onSubmit }) {
  return (
    <div className="space-y-3">
      {(screen.options || []).map((opt) => (
        <button
          key={opt.code}
          type="button"
          disabled={busy}
          onClick={() => onSubmit(opt.code)}
          className={`${BIG_BTN} ${
            screen.answer === opt.code
              ? 'border-forest bg-forest/5 text-forest'
              : 'border-slate-300 bg-white active:bg-slate-50'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function YesNoScreen({ screen, busy, onSubmit }) {
  const opts = [
    { label: 'Yes', value: true },
    { label: 'No', value: false },
  ];
  return (
    <div className="space-y-3">
      {opts.map((o) => (
        <button
          key={o.label}
          type="button"
          disabled={busy}
          onClick={() => onSubmit(o.value)}
          className={`${BIG_BTN} text-center ${
            screen.answer === o.value
              ? 'border-forest bg-forest/5 text-forest'
              : 'border-slate-300 bg-white active:bg-slate-50'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function TextScreen({ screen, busy, onSubmit }) {
  const [value, setValue] = useState(screen.answer || '');
  useEffect(() => { setValue(screen.answer || ''); }, [screen.state, screen.answer]);

  return (
    <div className="space-y-4">
      <textarea
        rows={4}
        value={value}
        disabled={busy}
        autoFocus
        onChange={(e) => setValue(e.target.value)}
        className="w-full rounded-xl border-2 border-slate-300 px-4 py-3 text-lg
                   focus:border-forest focus:outline-none"
      />
      <button
        type="button"
        disabled={busy || !value.trim()}
        onClick={() => onSubmit(value)}
        className={PRIMARY}
      >
        Continue
      </button>
    </div>
  );
}

export function DoneScreen({ screen, tone = 'success' }) {
  const mark = tone === 'success' ? '✓' : '!';
  const color =
    tone === 'success' ? 'bg-forest text-white' : 'bg-amber-100 text-amber-700';

  return (
    <div className="pt-6 text-center">
      <div
        className={`mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full text-3xl ${color}`}
      >
        {mark}
      </div>
      <h1 className="mb-3 text-2xl font-bold text-slate-900">{screen.title}</h1>
      <p className="text-lg leading-relaxed text-slate-600">{screen.body}</p>
    </div>
  );
}
