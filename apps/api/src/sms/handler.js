const { PrismaClient } = require('@prisma/client');
const { getOrCreateSession, updateSession, closeSession } = require('./session');
const { notifyManager } = require('../services/notify');
const { parseIntent } = require('../services/ai');
const { getWorkflowSetting } = require('../services/settingsCache');
const { localToday, calendarDate } = require('../lib/businessDate');
const M = require('./messages');

const prisma = new PrismaClient();

// Normalize any inbound number to canonical E.164 (+1 + 10 digits).
// Strips noise (spaces, dashes, parens) and a leading 1 / +1 so matching
// is always on area code + 7-digit number. Returns the raw input if it
// can't be reduced to a US 10-digit number (so logging still works).
function normalizeInbound(raw) {
  if (!raw) return raw;
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return raw;
}

async function logMessage(phone, direction, body, absenceId = null) {
  await prisma.smsMessage.create({ data: { phone, direction, body, absenceId } }).catch(() => {});
}

// Timezone for an employee's home location (drives their local "today").
async function employeeTz(employeeId) {
  if (!employeeId) return undefined;
  const emp = await prisma.employee.findUnique({
    where: { id: employeeId },
    include: { location: { select: { timezone: true } } },
  });
  return emp?.location?.timezone || undefined;
}

function parseDate(input, tz) {
  const val = input.trim().toUpperCase();
  const today = localToday(tz);

  if (val === 'TODAY') return today;
  if (val === 'TOMORROW') {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() + 1);
    return d;
  }

  const match = val.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (match) {
    const year = match[3]
      ? (match[3].length === 2 ? 2000 + parseInt(match[3]) : parseInt(match[3]))
      : today.getUTCFullYear();
    const date = calendarDate(year, parseInt(match[1]), parseInt(match[2]));
    if (!isNaN(date.getTime())) return date;
  }
  return null;
}

// Absence dates are @db.Date values stored at UTC midnight, so they must be
// formatted in UTC. Without an explicit timeZone these render in the server's
// local zone, shifting every date back a day anywhere west of UTC. This is
// currently masked only because the droplet runs UTC — it would break the
// moment the server's timezone changed.
function formatDateShort(date) {
  return new Date(date).toLocaleDateString('en-US', {
    month: '2-digit', day: '2-digit', timeZone: 'UTC',
  });
}

function fmtDateUTC(d) {
  return new Date(d).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', timeZone: 'UTC',
  });
}

function dateRangeText(shiftDate, returnDate) {
  if (!returnDate) return fmtDateUTC(shiftDate);
  // The last absent day is the day before they return.
  const last = new Date(returnDate);
  last.setUTCDate(last.getUTCDate() - 1);
  return `${fmtDateUTC(shiftDate)} – ${fmtDateUTC(last)}`;
}

// Builds the full variable context from session state — all vars available in every template.
async function buildVars(ctx) {
  const vars = {};
  if (ctx.employeeId) {
    const emp = await prisma.employee.findUnique({
      where: { id: ctx.employeeId },
      include: { location: true },
    });
    if (emp) {
      vars.firstName = emp.firstName;
      vars.lastName = emp.lastName;
      vars.locationName = emp.location ? emp.location.name : '';
    }
  }
  if (ctx.shiftDate) {
    vars.shiftDate = fmtDateUTC(ctx.shiftDate);
    vars.dateRange = dateRangeText(ctx.shiftDate, ctx.returnDate);
  }
  if (ctx.returnDate) {
    vars.returnDate = fmtDateUTC(ctx.returnDate);
  }
  if (ctx.reasonCode) {
    const reason = await prisma.absenceReason.findUnique({ where: { code: ctx.reasonCode } });
    vars.reason = reason ? reason.label : ctx.reasonCode;
  }
  return vars;
}

async function logAbsence(ctx, extras = {}) {
  const reason = await prisma.absenceReason.findUnique({ where: { code: ctx.reasonCode } });
  const employee = await prisma.employee.findUnique({ where: { id: ctx.employeeId } });
  const shiftDate = new Date(ctx.shiftDate);

  const existing = await prisma.absence.findFirst({
    where: { employeeId: ctx.employeeId, shiftDate },
  });
  if (existing) return { duplicate: true, existing };

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
  if (ctx.lateArrivalTime !== undefined) {
    data.notes = ctx.lateArrivalTime + (ctx.lateDetails ? ' · ' + ctx.lateDetails : '');
  }
  Object.assign(data, extras);

  const absence = await prisma.absence.create({ data });

  // Tag every untagged message from this session (since it started) with
  // this absence, so the conversation view shows only this exchange —
  // not messages from an earlier or later session on the same phone.
  if (ctx.sessionStartedAt) {
    await prisma.smsMessage.updateMany({
      where: {
        phone: employee.phone,
        absenceId: null,
        createdAt: { gte: new Date(new Date(ctx.sessionStartedAt).getTime() - 2000) },
      },
      data: { absenceId: absence.id },
    });
  }

  if (employee.managerId) {
    notifyManager(absence.id).catch(console.error);
  }

  return { absence };
}

// Try to detect reason intent from the employee's very first message.
// Returns a context object with optional preDetectedReason + preDetectedNotes.
async function detectInitialIntent(input, employeeId, sessionStartedAt) {
  const base = { employeeId, sessionStartedAt };
  const words = input.trim().split(/\s+/).filter(Boolean);
  // Only attempt detection if the message has enough words to be meaningful
  if (words.length < 2) return base;
  try {
    const ai = await parseIntent('SELECT_REASON', input);
    if (ai && ['1','2','3','4'].includes(ai.intent)) {
      return Object.assign({}, base, {
        preDetectedReason: ai.intent,
        preDetectedNotes: input.trim(),
      });
    }
  } catch (_) { /* ignore */ }
  return base;
}

// Web report flow: reply with a single secure link instead of running the
// conversation over SMS. Only reached when `web_report_flow_enabled` is true;
// everything below this function is the original flow, left untouched.
async function handleInboundViaLink(phone, input) {
  const R = require('../services/reportService');
  const W = require('../workflow/absenceWorkflow');

  const { employee } = await W.identifyEmployee(phone, input);
  if (!employee) return { reply: M.UNKNOWN_PHONE() };

  const result = await R.createToken(employee.id);

  // Either a simultaneous inbound message won the race, or a usable link was
  // just issued moments ago. Either way a link is already on its way to this
  // person, so stay silent rather than send a second, conflicting one.
  if (result.raced || result.duplicateInbound) return { reply: null };

  if (result.rateLimited) return { reply: M.LINK_RATE_LIMITED(), employeeId: employee.id };

  return {
    reply: M.LINK_SENT({
      firstName: employee.firstName || '',
      reportUrl: R.buildReportUrl(result.raw),
      expiresInMinutes: String(R.ttlMinutes()),
    }),
    employeeId: employee.id,
  };
}

async function handleInbound(rawPhone, body) {
  const phone = normalizeInbound(rawPhone);
  const input = (body || '').trim();
  const upper = input.toUpperCase();

  await logMessage(phone, 'inbound', input);

  // Twilio's default Advanced Opt-Out keyword list (STOP, STOPALL,
  // UNSUBSCRIBE, CANCEL, END, QUIT) auto-registers the number as opted-out
  // the instant one of these arrives — Twilio blocks our reply and every
  // message after it with error 21610 until the employee texts START.
  // Any reply we send here would fail anyway, so don't try (that only
  // produces confusing "Didn't catch that" loops); just clear the session
  // so their next real message starts fresh once they re-subscribe.
  if (upper === 'STOP' || upper === 'STOPALL' || upper === 'UNSUBSCRIBE' || upper === 'CANCEL' || upper === 'END' || upper === 'QUIT') {
    await closeSession(phone);
    return { reply: null };
  }

  // Feature flag. When false (the default) the original conversational
  // workflow below runs exactly as before, with no behavioural change.
  if (getWorkflowSetting('web_report_flow_enabled') === 'true') {
    return handleInboundViaLink(phone, input);
  }

  const session = await getOrCreateSession(phone);
  const state = session.state;
  const ctx = session.context || {};

  function out(reply, absenceId = null) {
    return { reply, absenceId, employeeId: ctx.employeeId || null };
  }

  async function yesNo(extraIntents = []) {
    if (upper === 'YES' || upper === 'Y' || upper === 'YEP' || upper === 'YEAH' || upper === 'YUP') return 'YES';
    if (upper === 'NO' || upper === 'N' || upper === 'NOPE' || upper === 'NAH') return 'NO';
    if (extraIntents.includes('CANCEL') && (upper === 'CANCEL' || upper === 'STOP' || upper === 'NEVERMIND')) return 'CANCEL';
    const ai = await parseIntent(state, input);
    return ai ? ai.intent : 'UNKNOWN';
  }

  async function resolveDate(stateKey) {
    const tz = await employeeTz(ctx.employeeId);
    const d = parseDate(input, tz);
    if (d) return d;
    const ai = await parseIntent(stateKey, input);
    if (!ai || ai.intent === 'UNKNOWN') return null;
    if (ai.intent === 'TODAY') return parseDate('TODAY', tz);
    if (ai.intent === 'TOMORROW') return parseDate('TOMORROW', tz);
    if (ai.intent === 'DATE' && ai.value) return parseDate(ai.value, tz);
    return null;
  }

  async function resolveReason() {
    if (['1','2','3','4'].includes(input)) return input;
    const ai = await parseIntent('SELECT_REASON', input);
    return ai ? ai.intent : 'UNKNOWN';
  }

  // IDENTIFY
  if (state === 'NEW' || state === 'IDENTIFY') {
    const employee = await prisma.employee.findUnique({ where: { phone }, include: { location: true } });
    if (employee) {
      const initCtx = await detectInitialIntent(input, employee.id, session.createdAt.toISOString());
      await updateSession(phone, 'CONFIRM_START', initCtx);
      return out(M.CONFIRM_START({
        firstName: employee.firstName,
        lastName: employee.lastName,
        locationName: employee.location ? employee.location.name : '',
      }));
    }
    const byCode = await prisma.employee.findUnique({ where: { employeeCode: input }, include: { location: true } });
    if (byCode) {
      const initCtx = await detectInitialIntent(input, byCode.id, session.createdAt.toISOString());
      await updateSession(phone, 'CONFIRM_START', initCtx);
      return out(M.CONFIRM_START({
        firstName: byCode.firstName,
        lastName: byCode.lastName,
        locationName: byCode.location ? byCode.location.name : '',
      }));
    }
    await updateSession(phone, 'IDENTIFY', {});
    return out(M.UNKNOWN_PHONE());
  }

  // CONFIRM_START
  if (state === 'CONFIRM_START') {
    const vars = await buildVars(ctx);
    const intent = await yesNo(['CANCEL']);
    if (intent === 'YES') {
      await updateSession(phone, 'CONFIRM_DATE', ctx);
      return out(M.CONFIRM_DATE(vars));
    }
    if (intent === 'NO' || intent === 'CANCEL') {
      await closeSession(phone);
      return out(M.CANCEL(vars));
    }
    return out(M.CONFIRM_START(vars));
  }

  // CONFIRM_DATE
  if (state === 'CONFIRM_DATE') {
    const vars = await buildVars(ctx);
    const date = await resolveDate('CONFIRM_DATE');
    if (date) {
      const newCtx = Object.assign({}, ctx, { shiftDate: date.toISOString() });

      // Skip SELECT_REASON if we already know the reason from the initial message
      if (newCtx.preDetectedReason) {
        const codeMap = { '1': 'SICK', '2': 'EMERG', '3': 'LATE', '4': 'OTHER' };
        const reasonCode = codeMap[newCtx.preDetectedReason];
        const advCtx = Object.assign({}, newCtx, { reasonCode });
        if (newCtx.preDetectedNotes) advCtx.notes = newCtx.preDetectedNotes;

        if (reasonCode === 'LATE') {
          await updateSession(phone, 'LATE_ARRIVAL_TIME', advCtx);
          return out(M.LATE_ARRIVAL_TIME_PROMPT(await buildVars(advCtx)));
        }
        const multiDay = getWorkflowSetting('multi_day_prompt_enabled') === 'true';
        if (multiDay) {
          await updateSession(phone, 'MULTI_DAY_PROMPT', advCtx);
          return out(M.MULTI_DAY_PROMPT(await buildVars(advCtx)));
        }
        return advanceToReasonState(phone, advCtx, out);
      }

      await updateSession(phone, 'SELECT_REASON', newCtx);
      return out(M.SELECT_REASON(await buildVars(newCtx)));
    }
    return out(M.INVALID_DATE(vars));
  }

  // SELECT_REASON
  if (state === 'SELECT_REASON') {
    if (upper === 'CANCEL' || upper === 'NEVERMIND') {
      const vars = await buildVars(ctx);
      await closeSession(phone);
      return out(M.CANCEL(vars));
    }

    const reason = await resolveReason();
    const multiDay = getWorkflowSetting('multi_day_prompt_enabled') === 'true';
    // If employee gave a descriptive answer instead of just "1"/"2"/"3"/"4",
    // save it as notes so we don't ask for details again later.
    const rawTrimmed = input.trim();
    const freeTextNotes = !['1','2','3','4'].includes(rawTrimmed) && rawTrimmed.length > 1 ? rawTrimmed : null;

    if (reason === '1') {
      const newCtx = Object.assign({}, ctx, { reasonCode: 'SICK' });
      if (multiDay) {
        await updateSession(phone, 'MULTI_DAY_PROMPT', newCtx);
        return out(M.MULTI_DAY_PROMPT(await buildVars(newCtx)));
      }
      return advanceToReasonState(phone, newCtx, out);
    }
    if (reason === '2') {
      const newCtx = Object.assign({}, ctx, { reasonCode: 'EMERG', ...(freeTextNotes ? { notes: freeTextNotes } : {}) });
      if (multiDay) {
        await updateSession(phone, 'MULTI_DAY_PROMPT', newCtx);
        return out(M.MULTI_DAY_PROMPT(await buildVars(newCtx)));
      }
      return advanceToReasonState(phone, newCtx, out);
    }
    if (reason === '3') {
      const newCtx = Object.assign({}, ctx, { reasonCode: 'LATE' });
      await updateSession(phone, 'LATE_ARRIVAL_TIME', newCtx);
      return out(M.LATE_ARRIVAL_TIME_PROMPT(await buildVars(newCtx)));
    }
    if (reason === '4') {
      const newCtx = Object.assign({}, ctx, { reasonCode: 'OTHER', ...(freeTextNotes ? { notes: freeTextNotes } : {}) });
      if (multiDay) {
        await updateSession(phone, 'MULTI_DAY_PROMPT', newCtx);
        return out(M.MULTI_DAY_PROMPT(await buildVars(newCtx)));
      }
      return advanceToReasonState(phone, newCtx, out);
    }
    return out(M.INVALID_REASON(await buildVars(ctx)));
  }

  // MULTI_DAY_PROMPT
  if (state === 'MULTI_DAY_PROMPT') {
    const vars = await buildVars(ctx);
    const intent = await yesNo();
    if (intent === 'NO') {
      return advanceToReasonState(phone, ctx, out);
    }
    if (intent === 'YES') {
      await updateSession(phone, 'RETURN_DATE_PROMPT', ctx);
      return out(M.RETURN_DATE_PROMPT(vars));
    }
    return out(M.MULTI_DAY_PROMPT(vars));
  }

  // RETURN_DATE_PROMPT
  if (state === 'RETURN_DATE_PROMPT') {
    const vars = await buildVars(ctx);
    const returnDate = await resolveDate('RETURN_DATE_PROMPT');
    const shiftDate = new Date(ctx.shiftDate);

    if (!returnDate) {
      return out(M.INVALID_RETURN_DATE(vars));
    }
    if (returnDate <= shiftDate) {
      return out('Your return date must be after your first absent day (' + formatDateShort(shiftDate) + '). ' + M.RETURN_DATE_PROMPT(vars));
    }

    const newCtx = Object.assign({}, ctx, { returnDate: returnDate.toISOString() });
    await updateSession(phone, nextReasonState(ctx.reasonCode), newCtx);
    return advanceToReasonState(phone, newCtx, out);
  }

  // SICK_DETAILS
  if (state === 'SICK_DETAILS') {
    const updatedCtx = Object.assign({}, ctx, { sickDetails: input });
    const vars = await buildVars(updatedCtx);
    if (getWorkflowSetting('dr_note_prompt_enabled') !== 'true') {
      const result = await logAbsence(updatedCtx);
      await closeSession(phone);
      return out(M.ABSENCE_CONFIRMED(vars), result.absence ? result.absence.id : null);
    }
    await updateSession(phone, 'SICK_NOTE_PROMPT', updatedCtx);
    return out(M.SICK_NOTE_PROMPT(vars));
  }

  // SICK_NOTE_PROMPT
  if (state === 'SICK_NOTE_PROMPT') {
    const intent = await yesNo();
    if (intent === 'YES') {
      const newCtx = Object.assign({}, ctx, { drNotePromised: true });
      const result = await logAbsence(newCtx);
      await closeSession(phone);
      return out(M.SICK_YES_NOTE(await buildVars(newCtx)), result.absence ? result.absence.id : null);
    }
    if (intent === 'NO') {
      const newCtx = Object.assign({}, ctx, { drNotePromised: false });
      const result = await logAbsence(newCtx);
      await closeSession(phone);
      return out(M.SICK_NO_NOTE(await buildVars(newCtx)), result.absence ? result.absence.id : null);
    }
    return out(M.SICK_REPROMPT(await buildVars(ctx)));
  }

  // FAMILY_DETAILS
  if (state === 'FAMILY_DETAILS') {
    const updatedCtx = Object.assign({}, ctx, { notes: input });
    const vars = await buildVars(updatedCtx);
    if (getWorkflowSetting('proof_prompt_enabled') !== 'true') {
      const result = await logAbsence(updatedCtx);
      await closeSession(phone);
      return out(M.ABSENCE_CONFIRMED(vars), result.absence ? result.absence.id : null);
    }
    await updateSession(phone, 'FAMILY_PROOF_PROMPT', updatedCtx);
    return out(M.FAMILY_DETAILS_ACK(vars) + '\n\n' + M.FAMILY_PROOF_PROMPT(vars));
  }

  // FAMILY_PROOF_PROMPT
  if (state === 'FAMILY_PROOF_PROMPT') {
    const intent = await yesNo();
    if (intent === 'YES') {
      const newCtx = Object.assign({}, ctx, { proofPromised: true });
      const result = await logAbsence(newCtx);
      await closeSession(phone);
      return out(M.FAMILY_YES_PROOF(await buildVars(newCtx)), result.absence ? result.absence.id : null);
    }
    if (intent === 'NO') {
      const newCtx = Object.assign({}, ctx, { proofPromised: false });
      const result = await logAbsence(newCtx);
      await closeSession(phone);
      return out(M.FAMILY_NO_PROOF(await buildVars(newCtx)), result.absence ? result.absence.id : null);
    }
    return out(M.FAMILY_REPROMPT(await buildVars(ctx)));
  }

  // LATE_ARRIVAL_TIME
  if (state === 'LATE_ARRIVAL_TIME') {
    const updatedCtx = Object.assign({}, ctx, { lateArrivalTime: input });
    await updateSession(phone, 'LATE_DETAILS', updatedCtx);
    return out(M.LATE_DETAILS_PROMPT(await buildVars(updatedCtx)));
  }

  // LATE_DETAILS
  if (state === 'LATE_DETAILS') {
    const updatedCtx = Object.assign({}, ctx, { lateDetails: input });
    const result = await logAbsence(updatedCtx);
    await closeSession(phone);
    return out(M.LATE_DONE(await buildVars(updatedCtx)), result.absence ? result.absence.id : null);
  }

  // OTHER_DETAILS
  if (state === 'OTHER_DETAILS') {
    const updatedCtx = Object.assign({}, ctx, { notes: input });
    const result = await logAbsence(updatedCtx);
    await closeSession(phone);
    return out(M.OTHER_DONE(await buildVars(updatedCtx)), result.absence ? result.absence.id : null);
  }

  // Fallback
  await closeSession(phone);
  return out(M.CONFIRM_DATE(await buildVars(ctx)));
}

function nextReasonState(reasonCode) {
  if (reasonCode === 'SICK') return 'SICK_DETAILS';
  if (reasonCode === 'EMERG') return 'FAMILY_DETAILS';
  if (reasonCode === 'OTHER') return 'OTHER_DETAILS';
  return 'DONE';
}

async function advanceToReasonState(phone, ctx, out) {
  const vars = await buildVars(ctx);
  const reasonCode = ctx.reasonCode;
  if (reasonCode === 'SICK') {
    await updateSession(phone, 'SICK_DETAILS', ctx);
    return out(M.SICK_DETAILS_PROMPT(vars));
  }
  if (reasonCode === 'EMERG') {
    // If employee already described the situation (initial message or free-text reason), skip asking again
    if (ctx.notes) {
      if (getWorkflowSetting('proof_prompt_enabled') !== 'true') {
        const result = await logAbsence(ctx);
        await closeSession(phone);
        return out(M.ABSENCE_CONFIRMED(vars), result.absence ? result.absence.id : null);
      }
      await updateSession(phone, 'FAMILY_PROOF_PROMPT', ctx);
      return out(M.FAMILY_PROOF_PROMPT(vars));
    }
    await updateSession(phone, 'FAMILY_DETAILS', ctx);
    return out(M.FAMILY_DETAILS_PROMPT(vars));
  }
  if (reasonCode === 'OTHER') {
    // If employee already described the reason, skip the details prompt
    if (ctx.notes) {
      const result = await logAbsence(ctx);
      await closeSession(phone);
      return out(M.OTHER_DONE(vars), result.absence ? result.absence.id : null);
    }
    await updateSession(phone, 'OTHER_DETAILS', ctx);
    return out(M.OTHER_DETAILS_PROMPT(vars));
  }
  return out(null);
}

module.exports = { handleInbound, logMessage, normalizeInbound };