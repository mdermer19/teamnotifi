import { useState, useEffect } from 'react';
import { useApi } from '../lib/api';
import { formatShiftRangeLong } from '../lib/dates';
import { useTimezone } from '../lib/timezone';

function PrintIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6v-8z" />
    </svg>
  );
}

export default function ConversationModal({ absence, onClose }) {
  const api = useApi();
  const { fmtDateTime: formatTime } = useTimezone();
  const [messages, setMessages] = useState([]);
  const [reportToken, setReportToken] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getAbsenceMessages(absence.id)
      .then(({ messages, reportToken }) => { setMessages(messages); setReportToken(reportToken); })
      .catch(() => { setMessages([]); setReportToken(null); })
      .finally(() => setLoading(false));
  }, [absence.id]);

  // Web-form absences have no back-and-forth SMS conversation — just a link
  // text and a confirmation text. The real answers already appear in the
  // Details strip below (they're stored on the absence itself either way),
  // so the thread section shows a submission summary instead of a
  // near-empty, misleading "conversation."
  const isWebFlow = !!reportToken;

  // Determine how the employee was identified for this absence
  const firstInbound = messages.find(m => m.direction === 'inbound');
  const enrolledByCode = !!(
    firstInbound &&
    absence.employee.employeeCode &&
    firstInbound.body.trim().toUpperCase() === absence.employee.employeeCode.trim().toUpperCase()
  );
  const confirmMsgIdx = messages.findIndex(
    m => m.direction === 'outbound' && m.body.includes('reply YES to continue')
  );
  const affirmatives = new Set(['yes', 'y', 'yep', 'yeah', 'yup']);
  const confirmedByEE = confirmMsgIdx >= 0 && messages.slice(confirmMsgIdx + 1).some(
    m => m.direction === 'inbound' && affirmatives.has(m.body.trim().toLowerCase())
  );

  const shiftDate = formatShiftRangeLong(absence.shiftDate, absence.returnDate);
  const eeId = absence.employee.employeeCode || absence.employee.id;

  function handlePrint() {
    window.print();
  }

  return (
    <>
      {/* Print-only styles */}
      <style>{`
        @media print {
          @page { size: letter portrait; margin: 0.6in; }
          body * { visibility: hidden; }
          .print-only { display: block !important; visibility: visible !important; }
          .print-only * { visibility: visible !important; }
          .print-only {
            position: absolute; top: 0; left: 0; right: 0;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            font-size: 11px; color: #1e293b;
            display: flex; flex-direction: column; align-items: center;
          }
          .print-only .pb-meta-block {
            width: 100%; max-width: 420px;
            border: 1px solid #e2e8f0; border-radius: 8px;
            padding: 10px 14px; margin-bottom: 14px;
            background: #f8fafc;
            -webkit-print-color-adjust: exact; print-color-adjust: exact;
          }
          .print-only .pb-name { font-size: 13px; font-weight: 700; color: #0f172a; }
          .print-only .pb-ee { font-size: 10px; color: #94a3b8; margin-left: 6px; font-weight: 400; }
          .print-only .pb-info { font-size: 10px; color: #475569; margin-top: 3px; line-height: 1.6; }
          .print-only .pb-phone { width: 100%; max-width: 420px; }
          .print-only .pb-phone-header {
            background: #1e293b; color: white; border-radius: 10px 10px 0 0;
            padding: 8px 12px; text-align: center; font-size: 10px; font-weight: 600;
            letter-spacing: 0.03em;
            -webkit-print-color-adjust: exact; print-color-adjust: exact;
          }
          .print-only .pb-phone-body {
            border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 10px 10px;
            padding: 10px 10px 6px;
            background: white;
            -webkit-print-color-adjust: exact; print-color-adjust: exact;
          }
          .print-only .pb-row { display: flex; margin-bottom: 6px; }
          .print-only .pb-row.out { justify-content: flex-end; }
          .print-only .pb-bubble {
            max-width: 72%; border-radius: 14px; padding: 6px 10px;
            font-size: 10.5px; line-height: 1.45;
          }
          .print-only .pb-bubble.in {
            background: #e2e8f0; color: #1e293b; border-bottom-left-radius: 4px;
            -webkit-print-color-adjust: exact; print-color-adjust: exact;
          }
          .print-only .pb-bubble.out {
            background: #3a9c3f; color: white; border-bottom-right-radius: 4px;
            -webkit-print-color-adjust: exact; print-color-adjust: exact;
          }
          .print-only .pb-time { font-size: 8.5px; opacity: 0.5; margin-top: 2px; }
        }
        @media screen {
          .print-only { display: none; }
        }
      `}</style>

      {/* Print-only layout — phone screenshot style */}
      <div className="print-only">
        {/* Info card above the phone */}
        <div className="pb-meta-block">
          <div className="pb-name">
            {absence.employee.firstName} {absence.employee.lastName}
            <span className="pb-ee">EE #{eeId}</span>
          </div>
          <div className="pb-info">
            <div>Date: {shiftDate}</div>
            <div>Reason: {absence.reason.label}</div>
            {absence.drNotePromised === true && <div>📋 Dr. note promised within 48 hrs</div>}
            {absence.drNotePromised === false && <div>⚠️ No doctor's note — 2 points</div>}
            {absence.proofPromised === true && <div>📋 Proof promised within 48 hrs</div>}
            {absence.proofPromised === false && <div>ℹ️ No proof provided</div>}
            {absence.notes && <div>💬 {absence.notes}</div>}
            {absence.lateCallout && <div>⏰ Late notice callout</div>}
            {messages.length > 0 && <div>{enrolledByCode ? '🔑 Identified by employee ID code' : '📱 Matched by phone number on file'}</div>}
          </div>
        </div>

        {/* Phone-style chat */}
        <div className="pb-phone">
          <div className="pb-phone-header">
            {isWebFlow ? 'Submitted via Web Form' : 'TeamNotifi · (404) 900-7771'}
          </div>
          <div className="pb-phone-body">
            {messages.map(msg => (
              <div key={msg.id} className={`pb-row${msg.direction === 'outbound' ? ' out' : ''}`}>
                <div className={`pb-bubble ${msg.direction === 'inbound' ? 'in' : 'out'}`}>
                  <div style={{ whiteSpace: 'pre-wrap' }}>{msg.body}</div>
                  <div className="pb-time">{formatTime(msg.createdAt)} · {msg.direction === 'inbound' ? 'Employee' : 'System'}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-xl shadow-xl w-full sm:max-w-lg flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b flex-shrink-0">
          <div>
            <h2 className="font-semibold text-slate-900 text-lg">
              {absence.employee.firstName} {absence.employee.lastName}
              <span className="ml-2 text-sm font-normal text-slate-400">EE #{eeId}</span>
            </h2>
            <p className="text-sm text-slate-500 mt-0.5">
              Called out for <span className="font-medium text-slate-700">{shiftDate}</span>
            </p>
            <p className="text-sm text-slate-500">
              Reason: <span className="font-medium text-slate-700">{absence.reason.label}</span>
            </p>
          </div>
          <div className="flex items-center gap-1 sm:gap-2 ml-4 no-print">
            <button
              onClick={handlePrint}
              title="Print conversation"
              className="text-slate-400 hover:text-slate-600 p-2"
            >
              <PrintIcon />
            </button>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl leading-none p-2">&times;</button>
          </div>
        </div>

        {/* Details strip */}
        <div className="px-5 py-3 bg-slate-50 border-b flex-shrink-0 text-sm space-y-1">
          {absence.drNotePromised === true && <div className="text-slate-600">📋 Dr. note promised within 48 hrs</div>}
          {absence.drNotePromised === false && <div className="text-slate-600">⚠️ No doctor's note — 2 points</div>}
          {absence.proofPromised === true && <div className="text-slate-600">📋 Proof promised within 48 hrs</div>}
          {absence.proofPromised === false && <div className="text-slate-600">ℹ️ No proof provided</div>}
          {absence.notes && <div className="text-slate-600">💬 Details: {absence.notes}</div>}
          {absence.lateCallout && <div className="text-amber-700">⏰ Late notice callout</div>}
          {!loading && messages.length > 0 && (
            <div className="text-slate-500 pt-0.5 border-t border-slate-200 mt-1">
              {enrolledByCode
                ? '🔑 Identified by employee ID code'
                : '📱 Matched by phone number on file'}
            </div>
          )}
        </div>

        {/* Conversation thread */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading && (
            <div className="text-center text-slate-400 text-sm py-8">Loading…</div>
          )}

          {!loading && isWebFlow && (
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 mb-1 text-center">
              <div className="text-2xl mb-1">📝</div>
              <div className="font-medium text-slate-700 text-sm">Submitted via web form</div>
              {reportToken.submittedAt && (
                <div className="text-xs text-slate-400 mt-0.5">{formatTime(reportToken.submittedAt)}</div>
              )}
              <div className="text-xs text-slate-400 mt-1">
                The employee answered these questions on the report page instead of by text.
                Their answers are shown above.
              </div>
            </div>
          )}

          {!loading && isWebFlow && messages.length > 0 && (
            <p className="text-xs text-slate-400 text-center pt-2">Text messages sent</p>
          )}

          {!loading && !isWebFlow && messages.length === 0 && (
            <div className="text-center text-slate-400 text-sm py-8">
              No messages logged for this absence.
              <br />
              <span className="text-xs">Messages are recorded going forward.</span>
            </div>
          )}

          {!loading && !isWebFlow && (
            <p className="text-xs text-slate-400 text-center mb-4">SMS Conversation</p>
          )}

          {messages.map(msg => (
            <div
              key={msg.id}
              className={`flex ${msg.direction === 'inbound' ? 'justify-start' : 'justify-end'}`}
            >
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${
                  msg.direction === 'inbound'
                    ? 'bg-slate-100 text-slate-800 rounded-tl-sm print-bubble-in'
                    : 'text-white rounded-tr-sm print-bubble-out'
                }`}
                style={msg.direction === 'outbound' ? { backgroundColor: '#3a9c3f' } : {}}
              >
                <p className="whitespace-pre-wrap">{msg.body}</p>
                <p className={`text-xs mt-1 print-bubble-meta ${msg.direction === 'inbound' ? 'text-slate-400' : 'text-white/60'}`}>
                  {formatTime(msg.createdAt)} · {msg.direction === 'inbound' ? 'Employee' : 'System'}
                </p>
              </div>
            </div>
          ))}
        </div>

        <div className="p-4 border-t flex-shrink-0 no-print" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
          <button onClick={onClose} className="btn-secondary w-full">Close</button>
        </div>
      </div>
    </div>
    </>
  );
}
