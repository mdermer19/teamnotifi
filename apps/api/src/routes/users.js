const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { requireRole } = require('../middleware/appUser');

const router = express.Router();
const prisma = new PrismaClient();

const userInclude = {
  employee: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
};

// GET /api/users/me
router.get('/me', async (req, res) => {
  if (!req.appUser) return res.status(401).json({ error: 'Not authenticated' });
  res.json(req.appUser);
});

// GET /api/users/me/notification-preferences
router.get('/me/notification-preferences', async (req, res) => {
  if (!req.appUser) return res.status(401).json({ error: 'Not authenticated' });
  if (!req.appUser.employeeId) return res.status(400).json({ error: 'No employee record linked to your account' });
  try {
    const emp = await prisma.employee.findUnique({
      where: { id: req.appUser.employeeId },
      select: { notifyDirectReports: true, notifyTeamSubs: true, notifyCoverage: true },
    });
    if (!emp) return res.status(404).json({ error: 'Employee record not found' });
    res.json(emp);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/users/me/notification-preferences
// Only notifyTeamSubs is user-editable. Direct-report and coverage
// notifications are mandatory and locked on — requested by the business
// owner so managers can't silently miss call-outs for their own team or a
// team they're actively covering.
router.put('/me/notification-preferences', async (req, res) => {
  if (!req.appUser) return res.status(401).json({ error: 'Not authenticated' });
  if (!req.appUser.employeeId) return res.status(400).json({ error: 'No employee record linked to your account' });
  const { notifyDirectReports, notifyTeamSubs, notifyCoverage } = req.body;
  if (typeof notifyDirectReports === 'boolean' || typeof notifyCoverage === 'boolean') {
    return res.status(403).json({ error: 'You do not have permission to turn this off.' });
  }
  const data = {};
  if (typeof notifyTeamSubs === 'boolean') data.notifyTeamSubs = notifyTeamSubs;
  try {
    const emp = await prisma.employee.update({
      where: { id: req.appUser.employeeId },
      data,
      select: { notifyDirectReports: true, notifyTeamSubs: true, notifyCoverage: true },
    });
    res.json(emp);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/users — all app users (super_admin only)
router.get('/', requireRole('super_admin'), async (req, res) => {
  try {
    const users = await prisma.appUser.findMany({
      include: userInclude,
      orderBy: { createdAt: 'asc' },
    });
    res.json(users);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/users/:id — update role (super_admin only)
router.put('/:id', requireRole('super_admin'), async (req, res) => {
  const { role } = req.body;
  try {
    const updated = await prisma.appUser.update({
      where: { id: parseInt(req.params.id) },
      data: { ...(role && { role }) },
      include: userInclude,
    });
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/users/:id — remove app user (super_admin only)
router.delete('/:id', requireRole('super_admin'), async (req, res) => {
  const id = parseInt(req.params.id);
  if (req.appUser.id === id) {
    return res.status(400).json({ error: 'You cannot delete your own account.' });
  }
  try {
    await prisma.appUser.delete({ where: { id } });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/users/:id/link-employee — link or unlink employee record (super_admin only)
router.patch('/:id/link-employee', requireRole('super_admin'), async (req, res) => {
  const { employeeId } = req.body;
  try {
    const updated = await prisma.appUser.update({
      where: { id: parseInt(req.params.id) },
      data: { employeeId: employeeId ? parseInt(employeeId) : null },
      include: userInclude,
    });
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
