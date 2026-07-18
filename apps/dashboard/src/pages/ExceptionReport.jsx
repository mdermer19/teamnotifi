import { useState, useEffect } from 'react';
import { useApi } from '../lib/api';
import { usePermissions } from '../hooks/usePermissions';

const ISSUE_LEVEL = {
  'Missing phone number':                       'red',
  'Duplicate phone — shared with another employee': 'red',
  'No location assigned':                       'red',
  'No supervisor assigned':                     'amber',
  'Missing first name':                         'amber',
};

function IssueBadge({ text }) {
  const color = ISSUE_LEVEL[text] || 'amber';
  return (
    <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium mr-1 mb-1 ${
      color === 'red'
        ? 'bg-red-100 text-red-700'
        : 'bg-amber-100 text-amber-700'
    }`}>
      {text}
    </span>
  );
}

export default function ExceptionReport() {
  const api = useApi();
  const { isSuperAdmin, loading: permLoading } = usePermissions() || {};
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (permLoading) return;
    if (!isSuperAdmin) { setLoading(false); return; }
    api.getExceptionReport()
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [permLoading, isSuperAdmin]); // eslint-disable-line react-hooks/exhaustive-deps

  if (permLoading || loading) {
    return <div className="flex items-center justify-center h-64 text-slate-400">Loading…</div>;
  }

  if (!isSuperAdmin) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="card p-12 text-center">
          <div className="text-4xl mb-3">🔒</div>
          <div className="font-semibold text-slate-700">Access Restricted</div>
          <div className="text-sm text-slate-400 mt-1">Only Super Admins can view this report.</div>
        </div>
      </div>
    );
  }

  const generatedAt = data?.generatedAt
    ? new Date(data.generatedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
    : null;

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Exception Report</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Employees with missing data that may affect the SMS absence system.
            {generatedAt && <span className="ml-2 text-slate-400">Generated {generatedAt}</span>}
          </p>
        </div>
        <button
          onClick={() => { setLoading(true); setData(null); api.getExceptionReport().then(setData).catch(e => setError(e.message)).finally(() => setLoading(false)); }}
          className="btn-primary text-sm self-start"
        >
          Refresh
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 mb-4 text-sm">{error}</div>
      )}

      {data && data.exceptions.length === 0 ? (
        <div className="card p-12 text-center">
          <div className="text-4xl mb-3">✅</div>
          <div className="font-semibold text-slate-700">No exceptions found</div>
          <div className="text-sm text-slate-400 mt-1">All {data.total} active employees have complete data.</div>
        </div>
      ) : data && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <div className="card p-4 text-center">
              <div className="text-2xl font-bold text-slate-900">{data.exceptions.length}</div>
              <div className="text-xs text-slate-500 mt-0.5">Employees with issues</div>
            </div>
            <div className="card p-4 text-center">
              <div className="text-2xl font-bold text-slate-900">{data.total}</div>
              <div className="text-xs text-slate-500 mt-0.5">Total active employees</div>
            </div>
            <div className="card p-4 text-center">
              <div className="text-2xl font-bold text-green-600">{data.total - data.exceptions.length}</div>
              <div className="text-xs text-slate-500 mt-0.5">Complete records</div>
            </div>
          </div>

          <div className="card overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Employee</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">ID</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Location</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Issues</th>
                </tr>
              </thead>
              <tbody>
                {data.exceptions.map((emp, i) => (
                  <tr key={emp.id} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                    <td className="px-4 py-3 font-medium text-slate-800">
                      {emp.lastName || '—'}{emp.firstName ? `, ${emp.firstName}` : ''}
                      {emp.paylocityPhone && emp.phone && emp.paylocityPhone !== emp.phone && (
                        <div className="text-xs text-amber-600 font-normal mt-0.5">
                          SMS: {emp.phone} · Paylocity: {emp.paylocityPhone}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-500 font-mono text-xs">{emp.employeeCode || '—'}</td>
                    <td className="px-4 py-3 text-slate-500">{emp.location || <span className="text-red-500">—</span>}</td>
                    <td className="px-4 py-3">
                      {emp.issues.map(issue => <IssueBadge key={issue} text={issue} />)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
