const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { getViewScope } = require('../middleware/appUser');
const { businessDayBounds } = require('../lib/businessDate');

const router = express.Router();
const prisma = new PrismaClient();

const absenceInclude = {
  employee: { select: { id: true, firstName: true, lastName: true, role: true } },
  location: { select: { id: true, name: true, brand: true } },
  reason: { select: { id: true, code: true, label: true } },
};

// GET /api/absences/today — must come before /:id
router.get('/today', async (req, res) => {
  try {
    const { start, end } = businessDayBounds();
    const where = { shiftDate: { gte: start, lt: end } };
    const scope = await getViewScope(req.appUser);
    if (scope) where.employeeId = { in: scope.employeeIds };

    const absences = await prisma.absence.findMany({
      where,
      include: absenceInclude,
      orderBy: { reportedAt: 'desc' },
    });
    res.json(absences);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch today\'s absences' });
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

    // Get employee phone to also fetch pre-absence messages in the same session
    const employee = await prisma.employee.findUnique({ where: { id: absence.employeeId } });

    // Fetch messages tagged to this absence, plus messages from the same phone
    // within a 2-hour window before the absence was reported (the conversation)
    const windowStart = absence.reportedAt
      ? new Date(new Date(absence.reportedAt).getTime() - 2 * 60 * 60 * 1000)
      : new Date(absence.createdAt).getTime() - 2 * 60 * 60 * 1000;

    const messages = await prisma.smsMessage.findMany({
      where: {
        OR: [
          { absenceId: id },
          {
            phone: employee.phone,
            createdAt: { gte: windowStart },
            absenceId: null,
          },
        ],
      },
      orderBy: { createdAt: 'asc' },
    });

    res.json(messages);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// PUT /api/absences/:id
router.put('/:id', async (req, res) => {
  try {
    const { notes, reasonId } = req.body;
    const data = {};
    if (notes !== undefined) data.notes = notes;
    if (reasonId !== undefined) data.reasonId = parseInt(reasonId);

    const updated = await prisma.absence.update({
      where: { id: parseInt(req.params.id) },
      data,
      include: absenceInclude,
    });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update absence' });
  }
});

module.exports = router;
