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
