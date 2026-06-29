const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { requireRole } = require('../middleware/appUser');
const { getDefaultTemplates, invalidateCaches } = require('../services/settingsCache');

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/settings/templates
router.get('/templates', requireRole('super_admin'), async (req, res) => {
  try {
    const defaults = getDefaultTemplates();
    const rows = await prisma.messageTemplate.findMany();
    const dbMap = Object.fromEntries(rows.map(r => [r.key, r]));

    const result = Object.keys(defaults).map(key => ({
      key,
      label: dbMap[key]?.label || key.replace(/_/g, ' '),
      description: dbMap[key]?.description || null,
      template: dbMap[key]?.template || defaults[key],
      defaultTemplate: defaults[key],
      variables: dbMap[key]?.variables || [],
      updatedAt: dbMap[key]?.updatedAt || null,
    }));

    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/settings/templates/:key
router.put('/templates/:key', requireRole('super_admin'), async (req, res) => {
  const { key } = req.params;
  const { template } = req.body;
  const defaults = getDefaultTemplates();

  if (!defaults[key]) return res.status(404).json({ error: 'Template not found' });
  if (typeof template !== 'string') return res.status(400).json({ error: 'template is required' });

  try {
    const row = await prisma.messageTemplate.upsert({
      where: { key },
      update: { template, updatedBy: req.appUser?.clerkUserId },
      create: { key, label: key, template, variables: [], updatedBy: req.appUser?.clerkUserId },
    });
    await invalidateCaches();
    res.json({ key: row.key, template: row.template, defaultTemplate: defaults[key], updatedAt: row.updatedAt });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/settings/workflow
router.get('/workflow', requireRole('super_admin'), async (req, res) => {
  try {
    const rows = await prisma.workflowSetting.findMany({ orderBy: { id: 'asc' } });
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/settings/workflow/:key
router.put('/workflow/:key', requireRole('super_admin'), async (req, res) => {
  const { key } = req.params;
  const { value } = req.body;

  if (value === undefined || value === null) return res.status(400).json({ error: 'value is required' });

  try {
    const row = await prisma.workflowSetting.upsert({
      where: { key },
      update: { value: String(value) },
      create: { key, value: String(value), label: key, type: 'number' },
    });
    await invalidateCaches();
    res.json(row);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/settings/cache/invalidate
router.post('/cache/invalidate', requireRole('super_admin'), async (req, res) => {
  try {
    await invalidateCaches();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
