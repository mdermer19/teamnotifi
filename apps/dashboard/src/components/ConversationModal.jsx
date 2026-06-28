import { useState, useEffect } from 'react';
import { useApi } from '../lib/api';
import { formatShiftRangeLong } from '../lib/dates';

function formatTime(d) {
  return new Date(d).toLocaleString('en-US', {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function ConversationModal({ absence, onClose }) {
  const api = useApi();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getAbsenceMessages(absence.id)
      .then(setMessages)
      .catch(() => setMessages([]))
      .finally(() => setLoading(false));
  }, [absence.id]);

  const shiftDate = formatShiftRangeLong(absence.shiftDate, absence.returnDate);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-xl shadow-xl w-full sm:max-w-lg flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b flex-shrink-0">
          <div>
            <h2 className="font-semibold text-slate-900 text-lg">
              {absence.employee.firstName} {absence.employee.lastName}
            </h2>
            <p className="text-sm text-slate-500 mt-0.5">
              Called out for <span className="font-medium text-slate-700">{shiftDate}</span>
            </p>
            <p className="text-sm text-slate-500">
              Reason: <span className="font-medium text-slate-700">{absence.reason.label}</span>
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl leading-none ml-4">&times;</button>
        </div>

        {/* Details strip */}
        <div className="px-5 py-3 bg-slate-50 border-b flex-shrink-0 text-sm space-y-1">
          {absence.drNotePromised === true && <div className="text-slate-600">📋 Dr. note promised within 48 hrs</div>}
          {absence.drNotePromised === false && <div className="text-slate-600">⚠️ No doctor's note — 2 points</div>}
          {absence.proofPromised === true && <div className="text-slate-600">📋 Proof promised within 48 hrs</div>}
          {absence.proofPromised === false && <div className="text-slate-600">ℹ️ No proof provided</div>}
          {absence.notes && <div className="text-slate-600">💬 Details: {absence.notes}</div>}
          {absence.lateCallout && <div className="text-amber-700">⏰ Late notice callout</div>}
          {absence.managerAcked && (
            <div className="text-green-700">
              ✅ Reviewed {absence.ackedAt ? `· ${formatTime(absence.ackedAt)}` : ''}
            </div>
          )}
        </div>

        {/* Conversation thread */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <p className="text-xs text-slate-400 text-center mb-4">SMS Conversation</p>

          {loading && (
            <div className="text-center text-slate-400 text-sm py-8">Loading messages…</div>
          )}

          {!loading && messages.length === 0 && (
            <div className="text-center text-slate-400 text-sm py-8">
              No messages logged for this absence.
              <br />
              <span className="text-xs">Messages are recorded going forward.</span>
            </div>
          )}

          {messages.map(msg => (
            <div
              key={msg.id}
              className={`flex ${msg.direction === 'inbound' ? 'justify-start' : 'justify-end'}`}
            >
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${
                  msg.direction === 'inbound'
                    ? 'bg-slate-100 text-slate-800 rounded-tl-sm'
                    : 'text-white rounded-tr-sm'
                }`}
                style={msg.direction === 'outbound' ? { backgroundColor: '#3a9c3f' } : {}}
              >
                <p className="whitespace-pre-wrap">{msg.body}</p>
                <p className={`text-xs mt-1 ${msg.direction === 'inbound' ? 'text-slate-400' : 'text-white/60'}`}>
                  {formatTime(msg.createdAt)} · {msg.direction === 'inbound' ? 'Employee' : 'System'}
                </p>
              </div>
            </div>
          ))}
        </div>

        <div className="p-4 border-t flex-shrink-0">
          <button onClick={onClose} className="btn-secondary w-full">Close</button>
        </div>
      </div>
    </div>
  );
}
