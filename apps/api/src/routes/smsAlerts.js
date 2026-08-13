const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { requireRole } = require('../middleware/appUser');

const router = express.Router();
const prisma = new PrismaClient();

const adminOnly = requireRole('super_admin', 'admin');

const MESSAGE_TYPE_LABELS = {
  link: 'Report link',
  confirmation: 'Employee confirmation',
  manager_notification: 'Manager notification',
};

function formatAlert(alert) {
  const msg = alert.smsMessage;
  const emp = msg.employee;
  return {
    id: alert.id,
    createdAt: alert.createdAt,
    acknowledgedAt: alert.acknowledgedAt,
    message: {
      id: msg.id,
      phone: msg.phone,
      messageType: msg.messageType,
      messageTypeLabel: MESSAGE_TYPE_LABELS[msg.messageType] || msg.messageType || 'SMS',
      deliveryStatus: msg.deliveryStatus,
      errorCode: msg.errorCode,
      sentAt: msg.createdAt,
      statusUpdatedAt: msg.statusUpdatedAt,
      employee: emp ? {
        id: emp.id,
        name: `${emp.firstName || ''} ${emp.lastName || ''}`.trim(),
        location: emp.location ? emp.location.name : null,
      } : null,
      absenceId: msg.absenceId,
    },
  };
}

// GET /api/sms-alerts — unacknowledged delivery failures
router.get('/', adminOnly, async (req, res) => {
  try {
    const alerts = await prisma.smsAlert.findMany({
      where: { acknowledgedAt: null },
      orderBy: { createdAt: 'desc' },
      include: {
        smsMessage: {
          include: {
            employee: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                location: { select: { name: true } },
              },
            },
          },
        },
      },
    });
    res.json(alerts.map(formatAlert));
  } catch (err) {
    console.error('[sms-alerts] GET error:', err);
    res.status(500).json({ error: 'Failed to fetch alerts' });
  }
});

// GET /api/sms-alerts/count — badge count (unacknowledged failures)
router.get('/count', adminOnly, async (req, res) => {
  try {
    const count = await prisma.smsAlert.count({ where: { acknowledgedAt: null } });
    res.json({ count });
  } catch (err) {
    res.status(500).json({ count: 0 });
  }
});

// POST /api/sms-alerts/:id/acknowledge
router.post('/:id/acknowledge', adminOnly, async (req, res) => {
  try {
    const alert = await prisma.smsAlert.update({
      where: { id: parseInt(req.params.id) },
      data: { acknowledgedAt: new Date() },
    });
    res.json({ id: alert.id, acknowledgedAt: alert.acknowledgedAt });
  } catch (err) {
    res.status(500).json({ error: 'Failed to acknowledge alert' });
  }
});

module.exports = router;
