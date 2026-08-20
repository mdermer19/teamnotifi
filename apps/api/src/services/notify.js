const { PrismaClient } = require('@prisma/client');
const { coverageActiveNow, localToday } = require('../lib/businessDate');
const { sendSms } = require('./smsSender');

const prisma = new PrismaClient();

async function resolveRecipients(managerId) {
  // Anchored to the business timezone, not the server clock. These queries are
  // only a coarse net — coverageActiveNow() below applies the real start/end
  // time bounds — but a server-local midnight would drop a window ending today
  // if the droplet's timezone ever moved off UTC.
  const today = localToday();

  async function isOut(empId) {
    const cs = await prisma.tempCoverage.findMany({
      where: { absentManagerId: empId, active: true, startDate: { lte: new Date() }, endDate: { gte: today } },
    });
    return cs.some(c => coverageActiveNow(c));
  }

  const recipientIds = new Set();

  // Primary manager out?
  const candidateCoverages = await prisma.tempCoverage.findMany({
    where: { absentManagerId: managerId, active: true, startDate: { lte: new Date() }, endDate: { gte: today } },
    include: { coverers: true },
  });
  const primaryCoverage = candidateCoverages.find(c => coverageActiveNow(c)) || null;

  if (primaryCoverage) {
    for (const c of primaryCoverage.coverers) {
      if (!(await isOut(c.managerId))) recipientIds.add(c.managerId);
    }
  } else {
    const me = await prisma.employee.findUnique({ where: { id: managerId }, select: { notifyDirectReports: true } });
    if (me?.notifyDirectReports !== false) recipientIds.add(managerId);
  }

  // Permanent team subscribers (unless out)
  const subscribers = await prisma.teamSubscription.findMany({ where: { teamOwnerId: managerId } });
  for (const s of subscribers) {
    if (!(await isOut(s.subscriberId))) recipientIds.add(s.subscriberId);
  }

  if (!recipientIds.size) return [];

  const employees = await prisma.employee.findMany({ where: { id: { in: [...recipientIds] }, active: true } });
  const empById = new Map(employees.map(e => [e.id, e]));

  // Each recipient is filtered by the preference that matches how they were
  // selected: coverers need notifyCoverage, everyone else here needs
  // notifyTeamSubs (subscriber path) — the direct-report path already
  // checked notifyDirectReports before being added to the set.
  const result = [];
  const covererIds = new Set(primaryCoverage ? primaryCoverage.coverers.map(c => c.managerId) : []);
  const subscriberIds = new Set(subscribers.map(s => s.subscriberId));
  for (const id of recipientIds) {
    const emp = empById.get(id);
    if (!emp) continue;
    if (covererIds.has(id)) {
      if (emp.notifyCoverage !== false) result.push(emp);
    } else if (subscriberIds.has(id)) {
      if (emp.notifyTeamSubs !== false) result.push(emp);
    } else {
      result.push(emp);
    }
  }
  return result;
}

function buildMessage(absence) {
  const { employee, location, reason } = absence;
  const role = employee.role ? ` (${employee.role.replace('_', ' ')})` : '';

  // shiftDate/returnDate are @db.Date values stored at UTC midnight, so they
  // must be formatted in UTC. Without an explicit timeZone they render in the
  // server's local zone and every date shifts back a day west of UTC.
  const fmt = (d) => new Date(d).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', timeZone: 'UTC',
  });

  let dateStr;
  if (absence.returnDate) {
    const last = new Date(absence.returnDate);
    last.setUTCDate(last.getUTCDate() - 1);
    dateStr = `${fmt(absence.shiftDate)} – ${fmt(last)}`;
  } else {
    dateStr = fmt(absence.shiftDate);
  }

  let msg = `TeamNotifi: ${employee.firstName} ${employee.lastName}${role} at ${location.name} reported an absence for ${dateStr}. Reason: ${reason.label}.`;

  if (reason.code === 'SICK') {
    msg += absence.drNotePromised ? " Doctor's note promised within 48 hours." : " No doctor's note (2 points).";
  } else if (reason.code === 'EMERG') {
    if (absence.notes) msg += ` Details: ${absence.notes}.`;
    msg += ` Proof promised: ${absence.proofPromised ? 'yes' : 'no'}.`;
  } else if (reason.code === 'LATE') {
    msg += absence.notes ? ` Expected arrival: ${absence.notes}.` : '';
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
    const result = await sendSms(recipient.phone, message, {
      absenceId,
      messageType: 'manager_notification',
      employeeId: recipient.id,
    });
    if (result.sent) {
      await prisma.notification.create({
        data: { absenceId, recipientId: recipient.id, channel: 'sms', status: 'sent', sentAt: new Date() },
      });
      console.log(`[notify] Sent to ${recipient.firstName} ${recipient.lastName} (${recipient.phone})`);
    } else {
      console.error(`[notify] Failed for ${recipient.phone}: ${result.reason}`);
      await prisma.notification.create({
        data: { absenceId, recipientId: recipient.id, channel: 'sms', status: 'failed', errorMsg: result.reason },
      });
    }
  }
}

module.exports = { notifyManager, resolveRecipients };
