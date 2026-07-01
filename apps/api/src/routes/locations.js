const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { requireRole } = require('../middleware/appUser');

const router = express.Router();
const prisma = new PrismaClient();

const adminOnly = requireRole('super_admin', 'admin');

// GET /api/locations
router.get('/', async (req, res) => {
  try {
    const locations = await prisma.location.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
    });
    res.json(locations);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch locations' });
  }
});

// GET /api/locations/:id
router.get('/:id', async (req, res) => {
  try {
    const location = await prisma.location.findUnique({
      where: { id: parseInt(req.params.id) },
    });
    if (!location) return res.status(404).json({ error: 'Not found' });
    res.json(location);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch location' });
  }
});

// POST /api/locations
router.post('/', adminOnly, async (req, res) => {
  try {
    const { name, brand, region, storeNumber, twilioNumber, timezone } = req.body;
    const location = await prisma.location.create({
      data: { name, brand, region, storeNumber, twilioNumber, ...(timezone && { timezone }) },
    });
    res.status(201).json(location);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create location' });
  }
});

// PUT /api/locations/:id
router.put('/:id', adminOnly, async (req, res) => {
  try {
    const { name, brand, region, storeNumber, twilioNumber, active, timezone } = req.body;
    const location = await prisma.location.update({
      where: { id: parseInt(req.params.id) },
      data: { name, brand, region, storeNumber, twilioNumber, active, ...(timezone !== undefined && { timezone }) },
    });
    res.json(location);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update location' });
  }
});

module.exports = router;
