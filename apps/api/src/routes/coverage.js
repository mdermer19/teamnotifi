const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { requireRole } = require('../middleware/appUser');

const router = express.Router();
const prisma = new PrismaClient();

// Coverage and team subscriptions grant data visibility (see getViewScope),
// so creating/editing them is an access-control action — admins only.
const adminOnly = requireRole('super_admin', 'admin');

const coverageInclude = {
  absentManager: { select: { id: true, firstName: true, lastName: true, role: true } },
  coverers: {
    include: { manager: { select: { id: true, firstName: true, lastName: true, role: true } } },
  },
};

// GET /api/coverage
router.get('/', async (req, res) => {
  try {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const { status } = req.query; // active | upcoming | past | all

    let where = { active: true };
    if (status === 'active')   where = { active: true, startDate: { lte: today }, endDate: { gte: today } };
    if (status === 'upcoming') where = { active: true, startDate: { gt: today } };
    if (status === 'past')     where = { active: true, endDate: { lt: today } };
    if (status === 'all')      where = {};

    const coverage = await prisma.tempCoverage.findMany({
      where,
      include: coverageInclude,
      orderBy: { startDate: 'desc' },
    });
    res.json(coverage);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch coverage' });
  }
});

// POST /api/coverage
router.post('/', adminOnly, async (req, res) => {
  try {
    const { absentManagerId, covererIds, startDate, startTime, endDate, endTime, reason } = req.body;
    if (!absentManagerId || !covererIds?.length || !startDate || !endDate) {
      return res.status(400).json({ error: 'absentManagerId, covererIds, startDate, endDate required' });
    }

    const coverage = await prisma.tempCoverage.create({
      data: {
        absentManagerId: parseInt(absentManagerId),
        startDate: new Date(startDate),
        startTime: startTime || '00:00',
        endDate: new Date(endDate),
        endTime: endTime || '23:59',
        reason,
        coverers: {
          create: covererIds.map(id => ({ managerId: parseInt(id) })),
        },
      },
      include: coverageInclude,
    });
    res.status(201).json(coverage);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create coverage' });
  }
});

// PUT /api/coverage/:id
router.put('/:id', adminOnly, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { covererIds, startDate, startTime, endDate, endTime, reason, active } = req.body;

    const data = {};
    if (startDate !== undefined) data.startDate = new Date(startDate);
    if (startTime !== undefined) data.startTime = startTime;
    if (endDate !== undefined)   data.endDate = new Date(endDate);
    if (endTime !== undefined)   data.endTime = endTime;
    if (reason !== undefined)    data.reason = reason;
    if (active !== undefined)    data.active = active;

    // Replace coverers if provided
    if (covererIds) {
      await prisma.tempCoverageCoverer.deleteMany({ where: { coverageId: id } });
      data.coverers = { create: covererIds.map(cid => ({ managerId: parseInt(cid) })) };
    }

    const coverage = await prisma.tempCoverage.update({
      where: { id },
      data,
      include: coverageInclude,
    });
    res.json(coverage);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update coverage' });
  }
});

// DELETE /api/coverage/:id (soft delete)
router.delete('/:id', adminOnly, async (req, res) => {
  try {
    await prisma.tempCoverage.update({
      where: { id: parseInt(req.params.id) },
      data: { active: false },
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to deactivate coverage' });
  }
});

// ── Team Subscriptions ──────────────────────────────────────────────────

// GET /api/coverage/subscriptions
router.get('/subscriptions', async (req, res) => {
  try {
    const subs = await prisma.teamSubscription.findMany({
      include: {
        subscriber: { select: { id: true, firstName: true, lastName: true, role: true } },
        teamOwner:  { select: { id: true, firstName: true, lastName: true, role: true } },
      },
      orderBy: { teamOwner: { lastName: 'asc' } },
    });
    res.json(subs);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch subscriptions' });
  }
});

// POST /api/coverage/subscriptions
router.post('/subscriptions', adminOnly, async (req, res) => {
  try {
    const { subscriberId, teamOwnerId } = req.body;
    if (!subscriberId || !teamOwnerId) {
      return res.status(400).json({ error: 'subscriberId and teamOwnerId required' });
    }
    if (parseInt(subscriberId) === parseInt(teamOwnerId)) {
      return res.status(400).json({ error: 'A manager cannot subscribe to their own team' });
    }
    const sub = await prisma.teamSubscription.create({
      data: { subscriberId: parseInt(subscriberId), teamOwnerId: parseInt(teamOwnerId) },
      include: {
        subscriber: { select: { id: true, firstName: true, lastName: true } },
        teamOwner:  { select: { id: true, firstName: true, lastName: true } },
      },
    });
    res.status(201).json(sub);
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'Subscription already exists' });
    res.status(500).json({ error: 'Failed to create subscription' });
  }
});

// DELETE /api/coverage/subscriptions/:id
router.delete('/subscriptions/:id', adminOnly, async (req, res) => {
  try {
    await prisma.teamSubscription.delete({ where: { id: parseInt(req.params.id) } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove subscription' });
  }
});

module.exports = router;
