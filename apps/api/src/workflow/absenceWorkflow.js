// Shared absence-reporting workflow, decoupled from any single channel.
//
// NOTE ON DUPLICATION: buildVars() and logAbsence() intentionally duplicate
// their counterparts in ../sms/handler.js rather than replacing them. The
// legacy conversational SMS flow stays byte-for-byte untouched during the
// rollout, so it cannot be regressed by changes made here. De-duplication
// happens only after the web flow has been stable in production.

const { PrismaClient } = require('@prisma/client');
const { getWorkflowSetting } = require('../services/settingsCache');
const { localToday, calendarDate } = require('../lib/businessDate');

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Identification
// ---------------------------------------------------------------------------

// Resolve an inbound text to an employee: first by the sending phone number,
// then by treating the message body as an employee code. Never writes the
// phone number back to the employee record (a borrowed phone must not
// overwrite someone's real number).
async function identifyEmployee(phone, input) {
  const byPhone = await prisma.employee.findUnique({
    where: { phone },
    include: { location: true },
  });
  if (byPhone) return { employee: byPhone, matchedBy: 'phone' };

  const code = String(input || '').trim();
  if (!code) return { employee: null, matchedBy: null };

  const byCode = await prisma.employee.findUnique({
    where: { employeeCode: code },
    include: { location: true },
  });
  if (byCode) return { employee: byCode, matchedBy: 'employeeCode' };

  return { employee: null, matchedBy: null };
}

async function employeeTz(employeeId) {
  if (!employeeId) return undefined;
  const emp = await prisma.employee.findUnique({
    where: { id: employeeId },
    include: { location: { select: { timezone: true } } },
  });
  return emp?.location?.timezone || undefined;
}

// ---------------------------------------------------------------------------
// Template variables
// ---------------------------------------------------------------------------

// Absence dates are @db.Date values stored at UTC midnight, so they must be
// formatted in UTC. Without an explicit timeZone these render in the server's
// local zone, which shifts every date back a day anywhere west of UTC.
function fmtDate(d) {
  return new Date(d).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', timeZone: 'UTC',
  });
}

function dateRangeText(shiftDate, returnDate) {
  if (!returnDate) return fmtDate(shiftDate);
  // The last absent day is the day before they return.
  const last = new Date(returnDate);
  last.setUTCDate(last.getUTCDate() - 1);
  return `${fmtDate(shiftDate)} – ${fmtDate(last)}`;
}

async function buildVars(ctx) {
  const vars = {};
  if (ctx.employeeId) {
    const emp = await prisma.employee.findUnique({
      where: { id: ctx.employeeId },
      include: { location: true },
    });
    if (emp) {
      vars.firstName = emp.firstName || '';
      vars.lastName = emp.lastName || '';
      vars.locationName = emp.location ? emp.location.name : '';
    }
  }
  if (ctx.shiftDate) {
    vars.shiftDate = fmtDate(ctx.shiftDate);
    vars.dateRange = dateRangeText(ctx.shiftDate, ctx.returnDate);
  }
  if (ctx.returnDate) {
    vars.returnDate = fmtDate(ctx.returnDate);
  }
  if (ctx.reasonCode) {
    const reason = await prisma.absenceReason.findUnique({ where: { code: ctx.reasonCode } });
    vars.reason = reason ? reason.label : ctx.reasonCode;
  }
  return vars;
}

// ---------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------

const STATES = {
  CONFIRM_DATE: 'CONFIRM_DATE',
  SELECT_REASON: 'SELECT_REASON',
  MULTI_DAY_PROMPT: 'MULTI_DAY_PROMPT',
  RETURN_DATE_PROMPT: 'RETURN_DATE_PROMPT',
  SICK_DETAILS: 'SICK_DETAILS',
  SICK_NOTE_PROMPT: 'SICK_NOTE_PROMPT',
  FAMILY_DETAILS: 'FAMILY_DETAILS',
  FAMILY_PROOF_PROMPT: 'FAMILY_PROOF_PROMPT',
  LATE_ARRIVAL_TIME: 'LATE_ARRIVAL_TIME',
  LATE_DETAILS: 'LATE_DETAILS',
  OTHER_DETAILS: 'OTHER_DETAILS',
  SUBMITTED: 'SUBMITTED',
};

const flag = (key) => getWorkflowSetting(key) === 'true';

// Where a reason branch begins once date/multi-day questions are done.
function reasonEntryState(ctx) {
  switch (ctx.reasonCode) {
    case 'SICK':
      return STATES.SICK_DETAILS;
    case 'EMERG':
      if (ctx.notes) {
        return flag('proof_prompt_enabled') ? STATES.FAMILY_PROOF_PROMPT : STATES.SUBMITTED;
      }
      return STATES.FAMILY_DETAILS;
    case 'OTHER':
      return ctx.notes ? STATES.SUBMITTED : STATES.OTHER_DETAILS;
    case 'LATE':
      return STATES.LATE_ARRIVAL_TIME;
    default:
      return STATES.SUBMITTED;
  }
}

// Pure: given the state just answered and the resulting context, what's next?
// There is no review screen — answering the last question IS the submission.
function nextState(current, ctx) {
  switch (current) {
    case STATES.CONFIRM_DATE:
      return STATES.SELECT_REASON;

    case STATES.SELECT_REASON:
      // Late arrivals never see the multi-day question, same as the SMS flow.
      if (ctx.reasonCode === 'LATE') return STATES.LATE_ARRIVAL_TIME;
      return flag('multi_day_prompt_enabled') ? STATES.MULTI_DAY_PROMPT : reasonEntryState(ctx);

    case STATES.MULTI_DAY_PROMPT:
      return ctx.multiDay ? STATES.RETURN_DATE_PROMPT : reasonEntryState(ctx);

    case STATES.RETURN_DATE_PROMPT:
      return reasonEntryState(ctx);

    case STATES.SICK_DETAILS:
      return flag('dr_note_prompt_enabled') ? STATES.SICK_NOTE_PROMPT : STATES.SUBMITTED;

    case STATES.FAMILY_DETAILS:
      return flag('proof_prompt_enabled') ? STATES.FAMILY_PROOF_PROMPT : STATES.SUBMITTED;

    case STATES.LATE_ARRIVAL_TIME:
      return STATES.LATE_DETAILS;

    case STATES.SICK_NOTE_PROMPT:
    case STATES.FAMILY_PROOF_PROMPT:
    case STATES.LATE_DETAILS:
    case STATES.OTHER_DETAILS:
      return STATES.SUBMITTED;

    default:
      return STATES.SUBMITTED;
  }
}

// ---------------------------------------------------------------------------
// Answer validation + context merge
// ---------------------------------------------------------------------------

const YES = new Set(['yes', 'true', '1', 'y']);
const NO = new Set(['no', 'false', '0', 'n']);

function parseBool(value) {
  if (typeof value === 'boolean') return value;
  const v = String(value ?? '').trim().toLowerCase();
  if (YES.has(v)) return true;
  if (NO.has(v)) return false;
  return null;
}

// Accepts 'YYYY-MM-DD' (what <input type="date"> submits) and returns a
// UTC-midnight Date, matching how @db.Date values are stored and compared.
function parseIsoDate(value) {
  const m = String(value ?? '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = calendarDate(Number(m[1]), Number(m[2]), Number(m[3]));
  if (isNaN(d.getTime())) return null;
  // Round-trip check rejects things like 2026-02-31.
  if (d.toISOString().slice(0, 10) !== `${m[1]}-${m[2]}-${m[3]}`) return null;
  return d;
}

const MAX_NOTE_LEN = 1000;

// Validates one answer for one state and returns the context patch to apply.
// Every value is re-validated here regardless of any client-side constraint.
async function applyAnswer(state, value, ctx) {
  switch (state) {
    case STATES.CONFIRM_DATE: {
      const date = parseIsoDate(value);
      if (!date) return { error: 'Please choose a valid date.' };
      const tz = await employeeTz(ctx.employeeId);
      const today = localToday(tz);
      const min = new Date(today); min.setUTCDate(min.getUTCDate() - 14);
      const max = new Date(today); max.setUTCDate(max.getUTCDate() + 60);
      if (date < min) return { error: 'That date is too far in the past.' };
      if (date > max) return { error: 'That date is too far in the future.' };
      return { patch: { shiftDate: date.toISOString() } };
    }

    case STATES.SELECT_REASON: {
      const code = String(value ?? '').trim().toUpperCase();
      const reason = await prisma.absenceReason.findUnique({ where: { code } });
      if (!reason || !reason.active) return { error: 'Please choose a reason.' };
      return { patch: { reasonCode: code } };
    }

    case STATES.MULTI_DAY_PROMPT: {
      const b = parseBool(value);
      if (b === null) return { error: 'Please choose Yes or No.' };
      // Clear any previously-entered return date when switching back to No,
      // so a stale value can't survive a Back-and-change.
      return { patch: b ? { multiDay: true } : { multiDay: false, returnDate: null } };
    }

    case STATES.RETURN_DATE_PROMPT: {
      const date = parseIsoDate(value);
      if (!date) return { error: 'Please choose a valid date.' };
      const shift = ctx.shiftDate ? new Date(ctx.shiftDate) : null;
      if (!shift) return { error: 'Missing the first day of your absence.' };
      if (date <= shift) return { error: 'Your return date must be after your first day out.' };
      const max = new Date(shift); max.setUTCDate(max.getUTCDate() + 90);
      if (date > max) return { error: 'That return date is too far out.' };
      return { patch: { returnDate: date.toISOString() } };
    }

    case STATES.SICK_NOTE_PROMPT: {
      const b = parseBool(value);
      if (b === null) return { error: 'Please choose Yes or No.' };
      return { patch: { drNotePromised: b } };
    }

    case STATES.FAMILY_PROOF_PROMPT: {
      const b = parseBool(value);
      if (b === null) return { error: 'Please choose Yes or No.' };
      return { patch: { proofPromised: b } };
    }

    case STATES.SICK_DETAILS: {
      const text = String(value ?? '').trim();
      if (!text) return { error: 'Please add a short description.' };
      if (text.length > MAX_NOTE_LEN) return { error: 'That is too long — please shorten it.' };
      return { patch: { sickDetails: text } };
    }

    case STATES.FAMILY_DETAILS:
    case STATES.OTHER_DETAILS: {
      const text = String(value ?? '').trim();
      if (!text) return { error: 'Please add a short description.' };
      if (text.length > MAX_NOTE_LEN) return { error: 'That is too long — please shorten it.' };
      return { patch: { notes: text } };
    }

    case STATES.LATE_ARRIVAL_TIME: {
      const text = String(value ?? '').trim();
      if (!text) return { error: 'Please enter about what time you expect to arrive.' };
      if (text.length > 100) return { error: 'That is too long — please shorten it.' };
      return { patch: { lateArrivalTime: text } };
    }

    case STATES.LATE_DETAILS: {
      const text = String(value ?? '').trim();
      if (!text) return { error: 'Please add a short description.' };
      if (text.length > MAX_NOTE_LEN) return { error: 'That is too long — please shorten it.' };
      return { patch: { lateDetails: text } };
    }

    default:
      return { error: 'This report is already complete.' };
  }
}

// ---------------------------------------------------------------------------
// Persisting the absence
// ---------------------------------------------------------------------------

// Creates the Absence row. `client` lets the caller run this inside a
// transaction. Returns { duplicate: true } when one already exists for this
// employee+date — detected both by an explicit check and by catching the
// unique-index violation, which closes the read-then-write race the explicit
// check alone cannot cover.
async function createAbsence(ctx, client = prisma) {
  const reason = await client.absenceReason.findUnique({ where: { code: ctx.reasonCode } });
  if (!reason) throw new Error(`Unknown reason code: ${ctx.reasonCode}`);

  const employee = await client.employee.findUnique({ where: { id: ctx.employeeId } });
  if (!employee) throw new Error(`Unknown employee: ${ctx.employeeId}`);
  if (!employee.locationId) throw new Error('Employee has no location assigned');

  const shiftDate = new Date(ctx.shiftDate);

  const existing = await client.absence.findFirst({
    where: { employeeId: ctx.employeeId, shiftDate },
  });
  if (existing) return { duplicate: true, absence: existing };

  const data = {
    employeeId: ctx.employeeId,
    locationId: employee.locationId,
    reasonId: reason.id,
    shiftDate,
    reportedAt: new Date(),
  };
  if (ctx.returnDate) data.returnDate = new Date(ctx.returnDate);
  if (ctx.drNotePromised !== undefined) data.drNotePromised = ctx.drNotePromised;
  if (ctx.proofPromised !== undefined) data.proofPromised = ctx.proofPromised;
  if (ctx.notes !== undefined) data.notes = ctx.notes;
  if (ctx.sickDetails !== undefined) data.notes = ctx.sickDetails;
  // Late arrivals record the expected arrival time in notes, matching the
  // existing SMS behaviour and what notify.js reads back out.
  if (ctx.lateArrivalTime !== undefined) {
    data.notes = ctx.lateArrivalTime + (ctx.lateDetails ? ' · ' + ctx.lateDetails : '');
  }

  try {
    const absence = await client.absence.create({ data });
    return { duplicate: false, absence };
  } catch (e) {
    if (e.code === 'P2002') {
      const dup = await client.absence.findFirst({
        where: { employeeId: ctx.employeeId, shiftDate },
      });
      return { duplicate: true, absence: dup };
    }
    throw e;
  }
}

module.exports = {
  STATES,
  identifyEmployee,
  employeeTz,
  buildVars,
  dateRangeText,
  nextState,
  reasonEntryState,
  applyAnswer,
  parseIsoDate,
  parseBool,
  createAbsence,
};
