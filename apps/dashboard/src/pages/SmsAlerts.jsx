import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../lib/api';

const STATUS_LABELS = {
  failed: 'Failed',
  undelivered: 'Undelivered',
};

export default function SmsAlerts() {
  const api = useApi();
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      const data = await api.get('/api/sms-alerts');
      setAlerts(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => { load(); }, [load]);

  async function acknowledge(id) {
    try {
      await api.post(`/api/sms-alerts/${id}/acknowledge`, {});
      setAlerts(prev => prev.filter(a => a.id !== id));
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div className="p-4 md:p-8 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">SMS Delivery Issues</h1>
        <p className="text-sm text-slate-500 mt-1">
          Messages that Twilio reported as failed or undelivered. Dismiss once investigated.
        </p>
      </div>

      {loading && <p className="text-slate-400">Loading…</p>}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 mb-4">
          {error}
        </div>
      )}

      {!loading && alerts.length === 0 && (
        <div className="card p-8 text-center text-slate-400">
          No unresolved SMS delivery issues.
        </div>
      )}

      {alerts.length > 0 && (
        <div className="card divide-y divide-slate-100">
          {alerts.map(alert => (
            <AlertRow key={alert.id} alert={alert} onAcknowledge={acknowledge} />
          ))}
        </div>
      )}
    </div>
  );
}

function AlertRow({ alert, onAcknowledge }) {
  const { message } = alert;
  return (
    <div className="flex items-start justify-between gap-4 px-5 py-4">
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="badge badge-red">{STATUS_LABELS[message.deliveryStatus] || message.deliveryStatus}</span>
          <span className="text-sm font-medium text-slate-700">{message.messageTypeLabel}</span>
          {message.errorCode && (
            <span className="text-xs text-slate-400">Twilio error {message.errorCode}</span>
          )}
        </div>

        <div className="text-sm text-slate-600">
          {message.employee ? (
            <span>Recipient: <strong>{message.employee.name}</strong></span>
          ) : (
            <span className="text-slate-400">Recipient unknown</span>
          )}
        </div>

        <div className="flex flex-wrap gap-x-4 text-xs text-slate-400">
          <span>Sent {new Date(message.sentAt).toLocaleString()}</span>
          {message.absenceId && (
            <Link
              to={`/absences`}
              className="underline hover:text-slate-600"
            >
              Absence #{message.absenceId}
            </Link>
          )}
        </div>
      </div>

      <button
        onClick={() => onAcknowledge(alert.id)}
        className="btn-secondary text-sm shrink-0"
      >
        Dismiss
      </button>
    </div>
  );
}
