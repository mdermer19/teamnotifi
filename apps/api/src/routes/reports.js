const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { requireRole } = require('../middleware/appUser');

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/reports/exceptions
router.get('/exceptions', requireRole('super_admin'), async (req, res) => {
  try {
    const employees = await prisma.employee.findMany({
      where: { active: true },
      include: { location: true, manager: true },
      orderBy: [{ location: { name: 'asc' } }, { lastName: 'asc' }],
    });

    const phoneCounts = {};
    employees.forEach(e => {
      if (e.phone) phoneCounts[e.phone] = (phoneCounts[e.phone] || 0) + 1;
    });
    const duplicatePhones = new Set(Object.keys(phoneCounts).filter(p => phoneCounts[p] > 1));

    const exceptions = employees
      .map(emp => {
        const issues = [];
        if (!emp.phone)                          issues.push('Missing phone number');
        else if (duplicatePhones.has(emp.phone)) issues.push('Duplicate phone — shared with another employee');
        if (!emp.managerId)                      issues.push('No supervisor assigned');
        if (!emp.locationId)                     issues.push('No location assigned');
        if (!emp.firstName)                      issues.push('Missing first name');
        return issues.length > 0
          ? { id: emp.id, firstName: emp.firstName, lastName: emp.lastName, employeeCode: emp.employeeCode, location: emp.location?.name || null, issues }
          : null;
      })
      .filter(Boolean);

    res.json({ exceptions, total: employees.length, generatedAt: new Date().toISOString() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to generate exception report' });
  }
});

module.exports = router;
