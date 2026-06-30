const twilio = require('twilio');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

function coverageActiveNow(c) {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const nowDateMs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const nowTime = `${pad(now.getHours())}:${pad(now.getMinutes())}`;

  const startMs = new Date(c.startDate).setHours(0, 0, 0, 0);
  const endMs   = new Date(c.endDate).setHours(0, 0, 0, 0);

  if (nowDateMs < startMs || nowDateMs > endMs) return false;
  if (nowDateMs === startMs && nowTime < c.startTime) return false;
  if (nowDateMs === endMs   && nowTime > c.endTime)   return false;
  return true;
}

async function resolveRecipients(managerId) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  async function isOut(empId) {
    const cs = await prisma.tempCoverage.findMany({
      where: { absentManagerId: empId, active: true, startDate: { lte: new Date() }, endDate: { gte: today } },
    });
    return cs.some(coverageActiveNow);
  }

  const recipientIds = new Set();

  // Primary manager out?
  const candidateCoverages = await prisma.tempCoverage.findMany({
    where: { absentManagerId: managerId, active: true, startDate: { lte: new Date() }, endDate: { gte: today } },
    include: { coverers: true },
  });
  const primaryCoverage = candidateCoverages.find(coverageActiveNow) || null;

  if (primaryCoverage) {
    for (const c of primaryCoverage.coverers) {
      if (!(await isOut(c.managerId))) recipientIds.add(c.managerId);
    }
  } else {
    recipientIds.add(managerId);
  }

  // Permanent team subscribers (unless out)
  const subscribers = await prisma.teamSubscription.findMany({ where: { teamOwnerId: managerId } });
  for (const s of subscribers) {
    if (!(await isOut(s.subscriberId))) recipientIds.add(s.subscriberId);
  }

  return prisma.employee.findMany({ where: { id: { in: [...recipientIds] }, active: true } });
}

function buildMessage(absence) {
  const { employee, location, reason } = absence;
  const role = employee.role ? ` (${employee.role.replace('_', ' ')})` : '';

  let dateStr;
  if (absence.returnDate) {
    const last = new Date(absence.returnDate);
    last.setDate(last.getDate() - 1);
    const fmt = (d) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    dateStr = `${fmt(absence.shiftDate)} – ${fmt(last)}`;
  } else {
    dateStr = new Date(absence.shiftDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  let msg = `TeamNotifi: ${employee.firstName} ${employee.lastName}${role} at ${location.name} reported an absence for ${dateStr}. Reason: ${reason.label}.`;

  if (reason.code === 'SICK') {
    msg += absence.drNotePromised ? " Doctor's note promised within 48 hours." : " No doctor's note (2 points).";
  } else if (reason.code === 'EMERG') {
    if (absence.notes) msg += ` Details: ${absence.notes}.`;
    msg += ` Proof promised: ${absence.proofPromised ? 'yes' : 'no'}.`;
  } else if (reason.code === 'LATE') {
    msg += ' Late arrival (1 point if more than 7 minutes).';
  } else if (reason.code === 'OTHER') {
    if (absence.notes) msg += ` Details: ${absence.notes}.`;
  }

  msg += ' See details in the TeamNotifi dashboard.';
  return msg;
}

async function notifyManager(absenceId) {
  const absence = await prisma.absence.findUnique({
    where: { id: absenceId },
    include: { employee: true, location: true, reason: true },
  });
  if (!absence || !absence.employee.managerId) return;

  const recipients = await resolveRecipients(absence.employee.managerId);
  if (!recipients.length) {
    console.log(`[notify] No recipients for absence ${absenceId}`);
    return;
  }

  const message = buildMessage(absence);

  for (const recipient of recipients) {
    try {
      await twilioClient.messages.create({
        body: message,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: recipient.phone,
      });
      await prisma.notification.create({
        data: { absenceId, recipientId: recipient.id, channel: 'sms', status: 'sent', sentAt: new Date() },
      });
      console.log(`[notify] Sent to ${recipient.firstName} ${recipient.lastName} (${recipient.phone})`);
    } catch (err) {
      console.error(`[notify] Failed for ${recipient.phone}:`, err.message);
      await prisma.notification.create({
        data: { absenceId, recipientId: recipient.id, channel: 'sms', status: 'failed', errorMsg: err.message },
      });
    }
  }
}

module.exports = { notifyManager, resolveRecipients };
