const { PrismaClient } = require('@prisma/client');
const { generateToken, hashToken } = require('../lib/reportToken');
const { getMessage, getWorkflowSetting } = require('./settingsCache');
const { notifyManager } = require('./notify');
const { sendSms } = require('./smsSender');
const W = require('../workflow/absenceWorkflow');

const prisma = new PrismaClient();

const intSetting = (key, fallback) => {
  const n = parseInt(getWorkflowSetting(key), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

const ttlMinutes = () => intSetting('report_token_ttl_minutes', 120);
const maxPerHour = () => intSetting('report_token_max_per_hour', 5);
const dedupeSeconds = () => intSetting('report_link_dedupe_seconds', 60);

// ---------------------------------------------------------------------------
// Minting
// ---------------------------------------------------------------------------

// Issues a fresh link for an employee.
//
// If they already have an active token we cannot resend the *same* URL — the
// raw token is never stored, only its hash. So instead we carry the in-progress
// answers onto a new token and expire the old one, which preserves their
// progress while keeping the "hash only" guarantee intact.
//
// Concurrency: the partial unique index (employee_id WHERE status='active')
// means two simultaneous inbound texts cannot both insert. The loser catches
// P2002 and reports `raced`, so the caller stays silent rather than sending a
// second, conflicting link.
async function createToken(employeeId) {
  // Two texts seconds apart are almost always a carrier-duplicated message or
  // an impatient double-send, not a genuine request for a replacement link.
  // Issuing a second link there would deliver two texts and silently kill the
  // first one, so within this window we stay silent and let the existing link
  // stand. Past the window a repeat text is treated as a real re-request.
  const recentlyIssued = await prisma.reportToken.findFirst({
    where: {
      employeeId,
      status: 'active',
      createdAt: { gte: new Date(Date.now() - dedupeSeconds() * 1000) },
    },
  });
  if (recentlyIssued) return { duplicateInbound: true };

  const recentCount = await prisma.reportToken.count({
    where: { employeeId, createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) } },
  });
  if (recentCount >= maxPerHour()) return { rateLimited: true };

  const raw = generateToken();
  const expiresAt = new Date(Date.now() + ttlMinutes() * 60 * 1000);

  try {
    const record = await prisma.$transaction(async (tx) => {
      const prev = await tx.reportToken.findFirst({
        where: { employeeId, status: 'active' },
        orderBy: { createdAt: 'desc' },
      });
      if (prev) {
        await tx.reportToken.update({ where: { id: prev.id }, data: { status: 'expired' } });
      }
      return tx.reportToken.create({
        data: {
          tokenHash: hashToken(raw),
          employeeId,
          expiresAt,
          state: prev?.state || W.STATES.CONFIRM_DATE,
          context: { ...(prev?.context || {}), employeeId },
          stateHistory: prev?.stateHistory || [],
        },
      });
    });
    return { raw, record };
  } catch (e) {
    if (e.code === 'P2002') return { raced: true };
    throw e;
  }
}

function buildReportUrl(rawToken) {
  const base = (process.env.PUBLIC_BASE_URL || process.env.API_BASE_URL || '').replace(/\/+$/, '');
  return `${base}/r/${rawToken}`;
}

// ---------------------------------------------------------------------------
// Loading / screens
// ---------------------------------------------------------------------------

async function loadByRawToken(rawToken) {
  if (!rawToken || typeof rawToken !== 'string') return null;
  return prisma.reportToken.findUnique({
    where: { tokenHash: hashToken(rawToken) },
    include: { employee: { select: { id: true, firstName: true, phone: true } } },
  });
}

// Lazily flips an active-but-past-expiry token to 'expired' so it also frees
// the partial unique index for the employee's next request.
async function expireIfNeeded(record) {
  if (record.status === 'active' && record.expiresAt <= new Date()) {
    const updated = await prisma.reportToken.update({
      where: { id: record.id },
      data: { status: 'expired' },
    });
    return { ...record, ...updated };
  }
  return record;
}

const SCREEN_COPY = {
  CONFIRM_DATE:        { title: 'WEB_DATE_TITLE',           help: 'WEB_DATE_HELP',           kind: 'date' },
  SELECT_REASON:       { title: 'WEB_REASON_TITLE',         help: 'WEB_REASON_HELP',         kind: 'reason' },
  MULTI_DAY_PROMPT:    { title: 'WEB_MULTIDAY_TITLE',       help: 'WEB_MULTIDAY_HELP',       kind: 'yesno' },
  RETURN_DATE_PROMPT:  { title: 'WEB_RETURN_DATE_TITLE',    help: 'WEB_RETURN_DATE_HELP',    kind: 'date' },
  SICK_NOTE_PROMPT:    { title: 'WEB_SICK_NOTE_TITLE',      help: 'WEB_SICK_NOTE_HELP',      kind: 'yesno' },
  FAMILY_DETAILS:      { title: 'WEB_EMERG_DETAILS_TITLE',  help: 'WEB_EMERG_DETAILS_HELP',  kind: 'text' },
  FAMILY_PROOF_PROMPT: { title: 'WEB_PROOF_TITLE',          help: 'WEB_PROOF_HELP',          kind: 'yesno' },
  LATE_ARRIVAL_TIME:   { title: 'WEB_LATE_TIME_TITLE',      help: 'WEB_LATE_TIME_HELP',      kind: 'text' },
  OTHER_DETAILS:       { title: 'WEB_OTHER_DETAILS_TITLE',  help: 'WEB_OTHER_DETAILS_HELP',  kind: 'text' },
};

// The saved answer for a given question, so Back re-renders it pre-filled.
function currentAnswer(state, ctx) {
  switch (state) {
    case W.STATES.CONFIRM_DATE:        return ctx.shiftDate ? ctx.shiftDate.slice(0, 10) : null;
    case W.STATES.RETURN_DATE_PROMPT:  return ctx.returnDate ? ctx.returnDate.slice(0, 10) : null;
    case W.STATES.SELECT_REASON:       return ctx.reasonCode ?? null;
    case W.STATES.MULTI_DAY_PROMPT:    return ctx.multiDay ?? null;
    case W.STATES.SICK_NOTE_PROMPT:    return ctx.drNotePromised ?? null;
    case W.STATES.FAMILY_PROOF_PROMPT: return ctx.proofPromised ?? null;
    case W.STATES.FAMILY_DETAILS:
    case W.STATES.OTHER_DETAILS:       return ctx.notes ?? null;
    case W.STATES.LATE_ARRIVAL_TIME:   return ctx.lateArrivalTime ?? null;
    default: return null;
  }
}

// Everything the web page needs to render the current screen.
async function buildScreen(record) {
  const ctx = record.context || {};
  const vars = await W.buildVars(ctx);

  const base = {
    employee: { firstName: record.employee?.firstName || '' },
    expiresAt: record.expiresAt,
  };

  if (record.status === 'submitted') {
    return { ...base, status: 'submitted', screen: {
      kind: 'done',
      title: getMessage('WEB_CONFIRM_TITLE', vars),
      body: getMessage('WEB_CONFIRM_BODY', vars),
    } };
  }
  if (record.status === 'duplicate') {
    return { ...base, status: 'duplicate', screen: {
      kind: 'done',
      title: getMessage('WEB_DUPLICATE_TITLE', vars),
      body: getMessage('WEB_DUPLICATE_BODY', vars),
    } };
  }
  if (record.status !== 'active') {
    return { ...base, status: 'expired', screen: {
      kind: 'done',
      title: getMessage('WEB_EXPIRED_TITLE', vars),
      body: getMessage('WEB_EXPIRED_BODY', vars),
    } };
  }

  const copy = SCREEN_COPY[record.state];
  if (!copy) {
    return { ...base, status: 'expired', screen: {
      kind: 'done',
      title: getMessage('WEB_EXPIRED_TITLE', vars),
      body: getMessage('WEB_EXPIRED_BODY', vars),
    } };
  }

  const screen = {
    kind: copy.kind,
    state: record.state,
    title: getMessage(copy.title, vars),
    help: getMessage(copy.help, vars),
    answer: currentAnswer(record.state, ctx),
    canGoBack: (record.stateHistory || []).length > 0,
  };

  if (copy.kind === 'reason') {
    const reasons = await prisma.absenceReason.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      select: { code: true, label: true },
    });
    screen.options = reasons;
  }

  if (copy.kind === 'date') {
    const tz = await W.employeeTz(ctx.employeeId);
    const { localDateStr } = require('../lib/businessDate');
    const today = localDateStr(tz);
    if (record.state === W.STATES.CONFIRM_DATE) {
      const d = new Date(`${today}T00:00:00.000Z`);
      const min = new Date(d); min.setUTCDate(min.getUTCDate() - 14);
      const max = new Date(d); max.setUTCDate(max.getUTCDate() + 60);
      screen.min = min.toISOString().slice(0, 10);
      screen.max = max.toISOString().slice(0, 10);
      screen.today = today;
    } else {
      const shift = ctx.shiftDate ? new Date(ctx.shiftDate) : new Date(`${today}T00:00:00.000Z`);
      const min = new Date(shift); min.setUTCDate(min.getUTCDate() + 1);
      const max = new Date(shift); max.setUTCDate(max.getUTCDate() + 90);
      screen.min = min.toISOString().slice(0, 10);
      screen.max = max.toISOString().slice(0, 10);
    }
  }

  return { ...base, status: 'active', screen };
}

// ---------------------------------------------------------------------------
// Dashboard views: what an admin sees when they open a web-form absence
// ---------------------------------------------------------------------------

// Human-readable value for one answer, independent of which question it
// answers — used by both the summary and the activity log so the two stay
// consistent with each other.
async function formatAnswerValue(state, ctx) {
  switch (state) {
    case W.STATES.CONFIRM_DATE:
      return ctx.shiftDate ? W.dateRangeText(ctx.shiftDate, null) : '—';
    case W.STATES.RETURN_DATE_PROMPT:
      return ctx.returnDate ? W.dateRangeText(ctx.returnDate, null) : '—';
    case W.STATES.SELECT_REASON: {
      if (!ctx.reasonCode) return '—';
      const reason = await prisma.absenceReason.findUnique({ where: { code: ctx.reasonCode } });
      return reason ? reason.label : ctx.reasonCode;
    }
    case W.STATES.MULTI_DAY_PROMPT:
      return ctx.multiDay ? 'Yes' : 'No';
    case W.STATES.SICK_NOTE_PROMPT:
      return ctx.drNotePromised ? 'Yes' : 'No';
    case W.STATES.FAMILY_PROOF_PROMPT:
      return ctx.proofPromised ? 'Yes' : 'No';
    case W.STATES.FAMILY_DETAILS:
    case W.STATES.OTHER_DETAILS:
      return ctx.notes || '—';
    case W.STATES.LATE_ARRIVAL_TIME:
      return ctx.lateArrivalTime || '—';
    default:
      return '—';
  }
}

// Ordered so it always reads top-to-bottom the way the form was actually
// walked, even though answers land in `context` in whatever order the
// employee reached them.
const SUMMARY_ORDER = [
  W.STATES.CONFIRM_DATE,
  W.STATES.SELECT_REASON,
  W.STATES.MULTI_DAY_PROMPT,
  W.STATES.RETURN_DATE_PROMPT,
  W.STATES.SICK_NOTE_PROMPT,
  W.STATES.FAMILY_DETAILS,
  W.STATES.FAMILY_PROOF_PROMPT,
  W.STATES.LATE_ARRIVAL_TIME,
  W.STATES.OTHER_DETAILS,
];

// The final answer to each question that was actually shown. Skips questions
// that were never reached (e.g. the multi-day question when a doctor's-note
// answer alone finished the flow) and the multi-day question itself when the
// answer was "no" — that "no" is implied by there being no return date.
async function buildAnswerSummary(reportToken) {
  const ctx = reportToken.context || {};
  const summary = [];
  for (const state of SUMMARY_ORDER) {
    const copy = SCREEN_COPY[state];
    if (!copy) continue;
    if (state === W.STATES.MULTI_DAY_PROMPT && ctx.multiDay === undefined) continue;
    if (state === W.STATES.RETURN_DATE_PROMPT && !ctx.returnDate) continue;
    if (state === W.STATES.SICK_NOTE_PROMPT && ctx.drNotePromised === undefined) continue;
    if (state === W.STATES.FAMILY_DETAILS && ctx.reasonCode !== 'EMERG') continue;
    if (state === W.STATES.FAMILY_PROOF_PROMPT && ctx.proofPromised === undefined) continue;
    if (state === W.STATES.LATE_ARRIVAL_TIME && !ctx.lateArrivalTime) continue;
    if (state === W.STATES.OTHER_DETAILS && ctx.reasonCode !== 'OTHER') continue;
    if (state === W.STATES.CONFIRM_DATE && !ctx.shiftDate) continue;
    if (state === W.STATES.SELECT_REASON && !ctx.reasonCode) continue;

    summary.push({
      question: getMessage(copy.title, {}),
      answer: await formatAnswerValue(state, ctx),
    });
  }
  return summary;
}

// The literal sequence of what happened, from the audit trail — every answer,
// every Back, in order, so a disputed submission can be reconstructed exactly
// rather than trusting only the final state.
async function buildActivityLog(reportTokenId) {
  const entries = await prisma.auditLog.findMany({
    where: { entityType: 'ReportToken', entityId: reportTokenId },
    orderBy: { createdAt: 'asc' },
  });

  const log = [];
  for (const entry of entries) {
    const v = entry.newValue || {};
    if (entry.action === 'report_step') {
      const copy = SCREEN_COPY[v.state];
      const question = copy ? getMessage(copy.title, {}) : v.state;
      const patchState = v.state;
      const answer = v.patch ? await formatAnswerValue(patchState, v.patch) : '—';
      log.push({ at: entry.createdAt, text: `Answered "${question}" — ${answer}` });
    } else if (entry.action === 'report_back') {
      const copy = SCREEN_COPY[v.to];
      const question = copy ? getMessage(copy.title, {}) : v.to;
      log.push({ at: entry.createdAt, text: `Went back to "${question}"` });
    } else if (entry.action === 'report_submitted') {
      log.push({ at: entry.createdAt, text: 'Submitted' });
    } else if (entry.action === 'report_duplicate') {
      log.push({ at: entry.createdAt, text: 'Submitted — flagged as a duplicate for this date' });
    }
  }
  return log;
}

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

async function audit(record, action, newValue, ip) {
  await prisma.auditLog
    .create({
      data: {
        actorId: record.employeeId,
        action,
        entityType: 'ReportToken',
        entityId: record.id,
        newValue,
        ipAddress: ip || null,
      },
    })
    .catch((e) => console.error('[report] audit write failed:', e.message));
}

// ---------------------------------------------------------------------------
// Finalize
// ---------------------------------------------------------------------------

function confirmSmsFor(ctx) {
  switch (ctx.reasonCode) {
    case 'SICK':
      return ctx.drNotePromised ? 'CONFIRM_SMS_SICK_NOTE' : 'CONFIRM_SMS_SICK_NO_NOTE';
    case 'EMERG':
      return ctx.proofPromised ? 'CONFIRM_SMS_EMERG_PROOF' : 'CONFIRM_SMS_EMERG_NO_PROOF';
    case 'LATE':
      return 'CONFIRM_SMS_LATE';
    case 'OTHER':
      return 'CONFIRM_SMS_OTHER';
    default:
      return 'CONFIRM_SMS_GENERIC';
  }
}

// Atomically claims the token and writes the absence. The claim is a
// conditional UPDATE ... WHERE status='active', which Postgres serialises per
// row, so exactly one concurrent request can ever observe count === 1. A
// double-tap or retry falls through to the already-claimed branch and gets the
// original result rather than a second absence.
async function finalize(recordId) {
  const result = await prisma.$transaction(async (tx) => {
    const claimed = await tx.reportToken.updateMany({
      where: { id: recordId, status: 'active' },
      data: { status: 'submitting' },
    });
    if (claimed.count !== 1) return { alreadyClaimed: true };

    const record = await tx.reportToken.findUnique({ where: { id: recordId } });
    const ctx = record.context || {};

    const { duplicate, absence } = await W.createAbsence(ctx, tx);

    if (duplicate) {
      // Deliberately not linking absenceId here: that column is unique, and
      // the pre-existing absence may already belong to another token.
      await tx.reportToken.update({
        where: { id: recordId },
        data: { status: 'duplicate', submittedAt: new Date() },
      });
      return { duplicate: true, absence, ctx };
    }

    await tx.reportToken.update({
      where: { id: recordId },
      data: { status: 'submitted', absenceId: absence.id, submittedAt: new Date() },
    });
    return { duplicate: false, absence, ctx };
  });

  if (result.alreadyClaimed) return { alreadyClaimed: true };

  // Side effects run after the transaction commits: the report is already
  // durable, so a failure here must never roll it back or fail the request.
  if (!result.duplicate && result.absence) {
    notifyManager(result.absence.id).catch((e) =>
      console.error('[report] manager notify failed:', e.message)
    );

    if (getWorkflowSetting('confirm_sms_enabled') === 'true') {
      try {
        const vars = await W.buildVars(result.ctx);
        vars.lateArrivalTime = result.ctx.lateArrivalTime || '';
        const body = getMessage(confirmSmsFor(result.ctx), vars);
        const employee = await prisma.employee.findUnique({
          where: { id: result.ctx.employeeId },
          select: { phone: true },
        });
        if (employee?.phone && body) {
          await sendSms(employee.phone, body, {
            absenceId: result.absence.id,
            messageType: 'confirmation',
            employeeId: result.ctx.employeeId,
          });
        }
      } catch (e) {
        console.error('[report] confirmation SMS failed:', e.message);
      }
    }
  }

  return result;
}

module.exports = {
  createToken,
  buildReportUrl,
  loadByRawToken,
  expireIfNeeded,
  buildScreen,
  finalize,
  audit,
  ttlMinutes,
  buildAnswerSummary,
  buildActivityLog,
};
