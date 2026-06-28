const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { requireRole } = require('../middleware/appUser');

const router = express.Router();
const prisma = new PrismaClient();

const userInclude = {
  locationAccess: {
    include: { location: { select: { id: true, name: true } } },
    orderBy: { location: { name: 'asc' } },
  },
};

// GET /api/users/me — current user's role + location access
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

// PUT /api/users/:id — update role and/or location access (super_admin only)
router.put('/:id', requireRole('super_admin'), async (req, res) => {
  const { role, locationIds } = req.body;
  try {
    const updated = await prisma.appUser.update({
      where: { id: parseInt(req.params.id) },
      data: {
        ...(role && { role }),
        ...(locationIds !== undefined && {
          locationAccess: {
            deleteMany: {},
            create: locationIds.map(lid => ({ locationId: lid })),
          },
        }),
      },
      include: userInclude,
    });
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
