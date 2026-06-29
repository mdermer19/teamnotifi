const { PrismaClient } = require('@prisma/client');
const { getOrCreateSession, updateSession, closeSession } = require('./session');
const { notifyManager } = require('../services/notify');
const { parseIntent } = require('../services/ai');
const { getWorkflowSetting } = require('../services/settingsCache');
const M = require('./messages');

const prisma = new PrismaClient();

async function logMessage(phone, direction, body, absenceId = null) {
  await prisma.smsMessage.create({ data: { phone, direction, body, absenceId } }).catch(() => {});
}

function parseDate(input) {
  const val = input.trim().toUpperCase();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (val === 'TODAY') return today;
  if (val === 'TOMORROW') {
    const d = new Date(today);
    d.setDate(d.getDate() + 1);
    return d;
  }

  const match = val.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (match) {
    const year = match[3]
      ? (match[3].length === 2 ? 2000 + parseInt(match[3]) : parseInt(match[3]))
      : today.getFullYear();
    const date = new Date(year, parseInt(match[1]) - 1, parseInt(match[2]));
    if (!isNaN(date.getTime())) return date;
  }
  return null;
}

function formatDateShort(date) {
  return new Date(date).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' });
}

function dateRangeText(shiftDate, returnDate) {
  const start = new Date(shiftDate);
  const fmt = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  if (!returnDate) return fmt(start);
  const last = new Date(returnDate);
  last.setDate(last.getDate() - 1);
  return `${fmt(start)} – ${fmt(last)}`;
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
  Object.assign(data, extras);

  const absence = await prisma.absence.create({ data });

  if (employee.managerId) {
    notifyManager(absence.id).catch(console.error);
  }

  return { absence };
}

async function handleInbound(phone, body) {
  const input = (body || '').trim();
  const upper = input.toUpperCase();

  await logMessage(phone, 'inbound', input);

  if (upper === 'STOP' || upper === 'QUIT' || upper === 'UNSUBSCRIBE') {
    return { reply: null };
  }

  const session = await getOrCreateSession(phone);
  const state = session.state;
  const ctx = session.context || {};

  function out(reply, absenceId = null) {
    return { reply, absenceId };
  }

  async function yesNo(extraIntents = []) {
    if (upper === 'YES' || upper === 'Y' || upper === 'YEP' || upper === 'YEAH' || upper === 'YUP') return 'YES';
    if (upper === 'NO' || upper === 'N' || upper === 'NOPE' || upper === 'NAH') return 'NO';
    if (extraIntents.includes('CANCEL') && (upper === 'CANCEL' || upper === 'STOP' || upper === 'NEVERMIND')) return 'CANCEL';
    const ai = await parseIntent(state, input);
    return ai?.intent || 'UNKNOWN';
  }

  async function resolveDate(stateKey) {
    const d = parseDate(input);
    if (d) return d;
    const ai = await parseIntent(stateKey, input);
    if (!ai || ai.intent === 'UNKNOWN') return null;
    if (ai.intent === 'TODAY') return parseDate('TODAY');
    if (ai.intent === 'TOMORROW') return parseDate('TOMORROW');
    if (ai.intent === 'DATE' && ai.value) return parseDate(ai.value);
    return null;
  }

  async function resolveReason() {
    if (['1','2','3','4'].includes(input)) return input;
    const ai = await parseIntent('SELECT_REASON', input);
    return ai?.intent || 'UNKNOWN';
  }

  // IDENTIFY
  if (state === 'NEW' || state === 'IDENTIFY') {
    const employee = await prisma.employee.findUnique({ where: { phone } });
    if (employee) {
      await updateSession(phone, 'CONFIRM_START', { employeeId: employee.id });
      return out(M.CONFIRM_START(employee.firstName));
    }
    const byCode = await prisma.employee.findUnique({ where: { employeeCode: input } });
    if (byCode) {
      await prisma.employee.update({ where: { id: byCode.id }, data: { phone } });
      await updateSession(phone, 'CONFIRM_START', { employeeId: byCode.id });
      return out(M.CONFIRM_START(byCode.firstName));
    }
    await updateSession(phone, 'IDENTIFY', {});
    return out(M.UNKNOWN_PHONE());
  }

  // CONFIRM_START
  if (state === 'CONFIRM_START') {
    const intent = await yesNo(['CANCEL']);
    if (intent === 'YES') {
      await updateSession(phone, 'CONFIRM_DATE', ctx);
      return out(M.CONFIRM_DATE());
    }
    if (intent === 'NO' || intent === 'CANCEL') {
      await closeSession(phone);
      return out(M.CANCEL());
    }
    const employee = await prisma.employee.findUnique({ where: { id: ctx.employeeId } });
    return out(M.CONFIRM_START(employee.firstName));
  }

  // CONFIRM_DATE
  if (state === 'CONFIRM_DATE') {
    const date = await resolveDate('CONFIRM_DATE');
    if (date) {
      await updateSession(phone, 'SELECT_REASON', { ...ctx, shiftDate: date.toISOString() });
      return out(M.SELECT_REASON());
    }
    return out(M.INVALID_DATE());
  }

  // SELECT_REASON
  if (state === 'SELECT_REASON') {
    if (upper === 'CANCEL') { await closeSession(phone); return out(M.CANCEL()); }

    const reason = await resolveReason();
    const multiDay = getWorkflowSetting('multi_day_prompt_enabled') === 'true';

    if (reason === '1') {
      if (multiDay) {
        await updateSession(phone, 'MULTI_DAY_PROMPT', { ...ctx, reasonCode: 'SICK' });
        return out(M.MULTI_DAY_PROMPT());
      }
      return advanceToReasonState(phone, { ...ctx, reasonCode: 'SICK' }, out);
    }
    if (reason === '2') {
      if (multiDay) {
        await updateSession(phone, 'MULTI_DAY_PROMPT', { ...ctx, reasonCode: 'EMERG' });
        return out(M.MULTI_DAY_PROMPT());
      }
      return advanceToReasonState(phone, { ...ctx, reasonCode: 'EMERG' }, out);
    }
    if (reason === '3') {
      const result = await logAbsence({ ...ctx, reasonCode: 'LATE' });
      await closeSession(phone);
      return out(M.LATE_MESSAGE(), result.absence?.id);
    }
    if (reason === '4') {
      if (multiDay) {
        await updateSession(phone, 'MULTI_DAY_PROMPT', { ...ctx, reasonCode: 'OTHER' });
        return out(M.MULTI_DAY_PROMPT());
      }
      return advanceToReasonState(phone, { ...ctx, reasonCode: 'OTHER' }, out);
    }
    return out(M.INVALID_REASON());
  }

  // MULTI_DAY_PROMPT
  if (state === 'MULTI_DAY_PROMPT') {
    const intent = await yesNo();
    if (intent === 'NO') {
      return advanceToReasonState(phone, ctx, out);
    }
    if (intent === 'YES') {
      await updateSession(phone, 'RETURN_DATE_PROMPT', ctx);
      return out(M.RETURN_DATE_PROMPT());
    }
    return out('Please reply YES or NO.\n\n' + M.MULTI_DAY_PROMPT());
  }

  // RETURN_DATE_PROMPT
  if (state === 'RETURN_DATE_PROMPT') {
    const returnDate = await resolveDate('RETURN_DATE_PROMPT');
    const shiftDate = new Date(ctx.shiftDate);

    if (!returnDate) {
      return out(M.INVALID_RETURN_DATE());
    }
    if (returnDate <= shiftDate) {
      return out(`Your return date must be after your first absent day (${formatDateShort(shiftDate)}). ` + M.RETURN_DATE_PROMPT());
    }

    await updateSession(phone, nextReasonState(ctx.reasonCode), { ...ctx, returnDate: returnDate.toISOString() });
    return advanceToReasonState(phone, { ...ctx, returnDate: returnDate.toISOString() }, out);
  }

  // SICK_NOTE_PROMPT
  if (state === 'SICK_NOTE_PROMPT') {
    const intent = await yesNo();
    if (intent === 'YES') {
      const result = await logAbsence({ ...ctx, drNotePromised: true });
      await closeSession(phone);
      return out(M.SICK_YES_NOTE(dateRangeText(ctx.shiftDate, ctx.returnDate)), result.absence?.id);
    }
    if (intent === 'NO') {
      const result = await logAbsence({ ...ctx, drNotePromised: false });
      await closeSession(phone);
      return out(M.SICK_NO_NOTE(dateRangeText(ctx.shiftDate, ctx.returnDate)), result.absence?.id);
    }
    return out(M.SICK_REPROMPT());
  }

  // FAMILY_DETAILS
  if (state === 'FAMILY_DETAILS') {
    const updatedCtx = { ...ctx, notes: input };
    if (getWorkflowSetting('proof_prompt_enabled') !== 'true') {
      const result = await logAbsence(updatedCtx);
      await closeSession(phone);
      return out(M.ABSENCE_CONFIRMED(dateRangeText(ctx.shiftDate, ctx.returnDate)), result.absence?.id);
    }
    await updateSession(phone, 'FAMILY_PROOF_PROMPT', updatedCtx);
    return out(M.FAMILY_DETAILS_ACK() + '\n\n' + M.FAMILY_PROOF_PROMPT());
  }

  // FAMILY_PROOF_PROMPT
  if (state === 'FAMILY_PROOF_PROMPT') {
    const intent = await yesNo();
    if (intent === 'YES') {
      const result = await logAbsence({ ...ctx, proofPromised: true });
      await closeSession(phone);
      return out(M.FAMILY_YES_PROOF(dateRangeText(ctx.shiftDate, ctx.returnDate)), result.absence?.id);
    }
    if (intent === 'NO') {
      const result = await logAbsence({ ...ctx, proofPromised: false });
      await closeSession(phone);
      return out(M.FAMILY_NO_PROOF(dateRangeText(ctx.shiftDate, ctx.returnDate)), result.absence?.id);
    }
    return out(M.FAMILY_REPROMPT());
  }

  // OTHER_DETAILS
  if (state === 'OTHER_DETAILS') {
    const employee = await prisma.employee.findUnique({ where: { id: ctx.employeeId } });
    const result = await logAbsence({ ...ctx, notes: input });
    await closeSession(phone);
    return out(M.OTHER_DONE(employee.firstName, dateRangeText(ctx.shiftDate, ctx.returnDate)), result.absence?.id);
  }

  // Fallback
  await closeSession(phone);
  return out(M.CONFIRM_DATE());
}

function nextReasonState(reasonCode) {
  if (reasonCode === 'SICK') return 'SICK_NOTE_PROMPT';
  if (reasonCode === 'EMERG') return 'FAMILY_DETAILS';
  if (reasonCode === 'OTHER') return 'OTHER_DETAILS';
  return 'DONE';
}

async function advanceToReasonState(phone, ctx, out) {
  const reasonCode = ctx.reasonCode;
  if (reasonCode === 'SICK') {
    if (getWorkflowSetting('dr_note_prompt_enabled') !== 'true') {
      const result = await logAbsence(ctx);
      await closeSession(phone);
      return out(M.ABSENCE_CONFIRMED(dateRangeText(ctx.shiftDate, ctx.returnDate)), result.absence?.id);
    }
    await updateSession(phone, 'SICK_NOTE_PROMPT', ctx);
    return out(M.SICK_NOTE_PROMPT());
  }
  if (reasonCode === 'EMERG') {
    await updateSession(phone, 'FAMILY_DETAILS', ctx);
    return out(M.FAMILY_DETAILS_PROMPT());
  }
  if (reasonCode === 'OTHER') {
    await updateSession(phone, 'OTHER_DETAILS', ctx);
    return out(M.OTHER_DETAILS_PROMPT());
  }
  return out(null);
}

module.exports = { handleInbound, logMessage };
