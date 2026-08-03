import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { getReport, sendAnswer, goBack } from './reportApi';
import { DateScreen, ReasonScreen, YesNoScreen, TextScreen, DoneScreen } from './screens';

// Public, no-login report page. Intentionally has no header, logo, menu or
// navigation — one question per screen and nothing else.
//
// There is no client-side persistence: every answer is written to the server
// before the UI advances, so a refresh, a closed tab, or reopening the link
// later simply re-fetches whatever state was saved.
export default function ReportFlow() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [fatal, setFatal] = useState(null);

  const load = useCallback(async () => {
    try {
      setData(await getReport(token));
    } catch (e) {
      setFatal(e.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  async function submit(value) {
    if (busy || !data?.screen?.state) return;
    setBusy(true);
    setError(null);
    try {
      const next = await sendAnswer(token, data.screen.state, value);
      setData(next);
      if (next.error) setError(next.error);
      window.scrollTo(0, 0);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function back() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      setData(await goBack(token));
      window.scrollTo(0, 0);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <Shell>
        <p className="pt-12 text-center text-slate-400">Loading…</p>
      </Shell>
    );
  }

  if (fatal) {
    return (
      <Shell>
        <DoneScreen
          tone="warn"
          screen={{ title: 'Something went wrong', body: fatal }}
        />
      </Shell>
    );
  }

  const { status, screen } = data;

  if (status !== 'active') {
    return (
      <Shell>
        <DoneScreen screen={screen} tone={status === 'submitted' ? 'success' : 'warn'} />
      </Shell>
    );
  }

  const props = { screen, busy, onSubmit: submit };

  return (
    <Shell>
      {screen.canGoBack && (
        <button
          type="button"
          onClick={back}
          disabled={busy}
          className="-ml-2 mb-4 flex items-center gap-1 rounded-lg px-2 py-2 text-base
                     text-slate-500 active:bg-slate-100 disabled:opacity-50"
        >
          <span aria-hidden="true">←</span> Back
        </button>
      )}

      <h1 className="mb-2 text-2xl font-bold leading-snug text-slate-900">
        {screen.title}
      </h1>
      {screen.help && (
        <p className="mb-6 text-base leading-relaxed text-slate-500">{screen.help}</p>
      )}
      {!screen.help && <div className="mb-6" />}

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-base text-red-700">
          {error}
        </div>
      )}

      {screen.kind === 'date' && <DateScreen {...props} />}
      {screen.kind === 'reason' && <ReasonScreen {...props} />}
      {screen.kind === 'yesno' && <YesNoScreen {...props} />}
      {screen.kind === 'text' && <TextScreen {...props} />}
    </Shell>
  );
}

function Shell({ children }) {
  return (
    <div className="min-h-screen bg-white">
      <div
        className="mx-auto w-full max-w-md px-5 py-8"
        style={{ paddingBottom: 'max(2rem, env(safe-area-inset-bottom))' }}
      >
        {children}
      </div>
    </div>
  );
}
