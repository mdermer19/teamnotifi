const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { getViewScope } = require('../middleware/appUser');
const { localDateStr, dateStr } = require('../lib/businessDate');
const { buildAnswerSummary, buildActivityLog } = require('../services/reportService');

const router = express.Router();
const prisma = new PrismaClient();

const absenceInclude = {
  employee: { select: { id: true, firstName: true, lastName: true, role: true, employeeCode: true } },
  location: { select: { id: true, name: true, brand: true, timezone: true } },
  reason: { select: { id: true, code: true, label: true } },
};

// Managers may only touch absences for employees in their scope; admins /
// super_admins (scope === null) may touch any.
async function canSeeAbsenceEmployee(req, employeeId) {
  const scope = await getViewScope(req.appUser);
  if (!scope) return true;
  return scope.employeeIds.includes(employeeId);
}

// GET /api/absences/today — must come before /:id
// Today + all upcoming absences (and any multi-day absence still ongoing),
// sorted by first day out (today first). "Today" is evaluated in each
// absence's own location timezone.
router.get('/today', async (req, res) => {
  try {
    // Prefetch from a couple days back (covers any tz, plus multi-day
    // absences that began earlier and are still ongoing), then filter.
    const lo = new Date(); lo.setUTCDate(lo.getUTCDate() - 2); lo.setUTCHours(0, 0, 0, 0);

    const where = {
      OR: [
        { shiftDate: { gte: lo } },
        { returnDate: { gte: lo } },
      ],
    };
    const scope = await getViewScope(req.appUser);
    if (scope) where.employeeId = { in: scope.employeeIds };

    const candidates = await prisma.absence.findMany({
      where,
      include: absenceInclude,
      orderBy: { shiftDate: 'asc' },
    });

    // Keep absences whose last absent day is today-or-later in their location's
    // local timezone (last absent day = returnDate − 1 for multi-day).
    const absences = candidates.filter(a => {
      const today = localDateStr(a.location?.timezone || undefined);
      let lastDay = a.shiftDate;
      if (a.returnDate) {
        lastDay = new Date(new Date(a.returnDate).getTime() - 24 * 60 * 60 * 1000);
      }
      return dateStr(lastDay) >= today;
    });
    res.json(absences);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch absences' });
  }
});

// GET /api/absences
router.get('/', async (req, res) => {
  try {
    const { locationId, employeeId, reasonCode, startDate, endDate, limit = '100', offset = '0' } = req.query;
    const where = {};

    const scope = await getViewScope(req.appUser);
    if (scope) where.employeeId = { in: scope.employeeIds };

    if (locationId) where.locationId = parseInt(locationId);
    if (employeeId) where.employeeId = parseInt(employeeId);
    if (reasonCode) where.reason = { code: reasonCode };

    if (startDate || endDate) {
      where.shiftDate = {};
      if (startDate) where.shiftDate.gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setDate(end.getDate() + 1);
        where.shiftDate.lt = end;
      }
    }

    const [absences, total] = await Promise.all([
      prisma.absence.findMany({
        where,
        include: absenceInclude,
        orderBy: { shiftDate: 'desc' },
        take: parseInt(limit),
        skip: parseInt(offset),
      }),
      prisma.absence.count({ where }),
    ]);

    res.json({ absences, total });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch absences' });
  }
});

// GET /api/absences/:id
router.get('/:id', async (req, res) => {
  try {
    const absence = await prisma.absence.findUnique({
      where: { id: parseInt(req.params.id) },
      include: absenceInclude,
    });
    if (!absence) return res.status(404).json({ error: 'Not found' });
    if (!(await canSeeAbsenceEmployee(req, absence.employeeId))) {
      return res.status(403).json({ error: 'Not authorized to view this absence' });
    }
    res.json(absence);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch absence' });
  }
});

// GET /api/absences/:id/messages — SMS conversation thread
router.get('/:id/messages', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const absence = await prisma.absence.findUnique({ where: { id } });
    if (!absence) return res.status(404).json({ error: 'Not found' });
    if (!(await canSeeAbsenceEmployee(req, absence.employeeId))) {
      return res.status(403).json({ error: 'Not authorized to view this conversation' });
    }

    // Get employee phone to also fetch pre-absence messages in the same session
    const employee = await prisma.employee.findUnique({ where: { id: absence.employeeId } });

    // Fetch messages tagged to this absence, plus messages from the same phone
    // within a 2-hour window before the absence was reported (the conversation)
    const anchor = absence.reportedAt ? new Date(absence.reportedAt) : new Date(absence.createdAt);
    const windowStart = new Date(anchor.getTime() - 2 * 60 * 60 * 1000);
    const windowEnd   = new Date(anchor.getTime() + 1 * 60 * 60 * 1000);

    const allMessages = await prisma.smsMessage.findMany({
      where: {
        OR: [
          { absenceId: id },
          {
            phone: employee.phone,
            createdAt: { gte: windowStart, lte: windowEnd },
            absenceId: null,
          },
        ],
      },
      orderBy: { createdAt: 'asc' },
    });
    const messages = allMessages.filter(m => m.messageType !== 'manager_notification');

    // Absences submitted through the web form have no back-and-forth SMS
    // conversation to show — just a link text and a confirmation text. The
    // real substance (which reason, which dates, what they answered) lives in
    // the report token's saved context, so surface that as a proper summary
    // instead of a near-empty message thread.
    const reportTokenRow = await prisma.reportToken.findUnique({
      where: { absenceId: id },
      select: { id: true, context: true, submittedAt: true, createdAt: true },
    });

    let reportToken = null;
    if (reportTokenRow) {
      const [answers, activityLog] = await Promise.all([
        buildAnswerSummary(reportTokenRow),
        buildActivityLog(reportTokenRow.id),
      ]);
      reportToken = {
        submittedAt: reportTokenRow.submittedAt,
        createdAt: reportTokenRow.createdAt,
        answers,
        activityLog,
      };
    }

    res.json({ messages, reportToken });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// PUT /api/absences/:id
router.put('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const existing = await prisma.absence.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Not found' });
    if (!(await canSeeAbsenceEmployee(req, existing.employeeId))) {
      return res.status(403).json({ error: 'Not authorized to edit this absence' });
    }

    const { notes, reasonId } = req.body;
    const data = {};
    if (notes !== undefined) data.notes = notes;
    if (reasonId !== undefined) data.reasonId = parseInt(reasonId);

    const updated = await prisma.absence.update({
      where: { id },
      data,
      include: absenceInclude,
    });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update absence' });
  }
});

module.exports = router;
