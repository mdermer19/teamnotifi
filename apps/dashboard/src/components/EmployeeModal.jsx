import { useState, useEffect } from 'react';
import { useApi } from '../lib/api';
import { formatShiftRange } from '../lib/dates';
import ConversationModal from './ConversationModal';

const REASON_COLORS = {
  SICK:  'badge-red',
  EMERG: 'badge-amber',
  LATE:  'badge-slate',
  OTHER: 'badge-slate',
};

export default function EmployeeModal({ employee, onClose }) {
  const api = useApi();
  const [absences, setAbsences] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewing, setViewing] = useState(null);

  useEffect(() => {
    api.getEmployeeAbsences(employee.id)
      .then(setAbsences)
      .catch(() => setAbsences([]))
      .finally(() => setLoading(false));
  }, [employee.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
        <div className="bg-white rounded-t-2xl sm:rounded-xl shadow-xl w-full sm:max-w-2xl flex flex-col max-h-[90vh]">

          {/* Header */}
          <div className="flex items-start justify-between p-5 border-b flex-shrink-0">
            <div>
              <h2 className="font-semibold text-slate-900 text-lg">
                {employee.firstName} {employee.lastName}
              </h2>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                {employee.role && (
                  <span className="badge-slate capitalize">{employee.role.replace(/_/g, ' ')}</span>
                )}
                {employee.isManager && (
                  <span className="badge bg-forest/10 text-forest">Manager</span>
                )}
                {!employee.active && (
                  <span className="badge bg-red-100 text-red-700">Inactive</span>
                )}
              </div>
              <div className="text-sm text-slate-500 mt-1 space-y-0.5">
                {employee.location && <div>📍 {employee.location.name}</div>}
                {employee.manager && (
                  <div>👤 Reports to {employee.manager.firstName} {employee.manager.lastName}</div>
                )}
                {employee.employeeCode && <div className="text-xs text-slate-400">ID: {employee.employeeCode}</div>}
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 text-2xl leading-none ml-4"
            >
              &times;
            </button>
          </div>

          {/* Absence history */}
          <div className="flex-1 overflow-y-auto p-5">
            <h3 className="font-medium text-slate-700 mb-3">
              Absence History
              {absences.length > 0 && (
                <span className="ml-2 text-sm font-normal text-slate-400">{absences.length} records</span>
              )}
            </h3>

            {loading && (
              <div className="text-center text-slate-400 py-10">Loading…</div>
            )}

            {!loading && absences.length === 0 && (
              <div className="text-center text-slate-400 py-10">
                No absences on record
              </div>
            )}

            {!loading && absences.length > 0 && (
              <div className="space-y-2">
                {absences.map(a => (
                  <div
                    key={a.id}
                    onClick={() => setViewing(a)}
                    className="flex items-center justify-between p-3 rounded-lg border border-slate-100 hover:bg-slate-50 cursor-pointer transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div>
                        <div className="text-sm font-medium text-slate-800">
                          {formatShiftRange(a.shiftDate, a.returnDate)}
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {a.location?.name}
                          {a.notes && ` · ${a.notes}`}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={REASON_COLORS[a.reason?.code] || 'badge-slate'}>
                        {a.reason?.label}
                      </span>
                      {a.managerAcked
                        ? <span className="badge-green">Reviewed</span>
                        : <span className="badge-amber">Pending</span>
                      }
                      <span className="text-slate-300 text-sm">›</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="p-4 border-t flex-shrink-0">
            <button onClick={onClose} className="btn-secondary w-full">Close</button>
          </div>
        </div>
      </div>

      {viewing && (
        <ConversationModal
          absence={{ ...viewing, employee }}
          onClose={() => setViewing(null)}
        />
      )}
    </>
  );
}
