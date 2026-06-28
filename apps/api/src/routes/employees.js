const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { getAllowedLocationIds } = require('../middleware/appUser');

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/employees
router.get('/', async (req, res) => {
  try {
    const { locationId, active, search, isManager } = req.query;
    const where = {};

    // Location restriction based on role
    const allowedIds = getAllowedLocationIds(req.appUser);
    if (allowedIds) {
      where.locationId = { in: allowedIds };
    }

    // Override with specific location filter (must still be within allowed)
    if (locationId) {
      const lid = parseInt(locationId);
      if (allowedIds && !allowedIds.includes(lid)) {
        return res.json([]); // requested location not in allowed set
      }
      where.locationId = lid;
    }

    if (active !== undefined) where.active = active === 'true';
    if (isManager !== undefined) where.isManager = isManager === 'true';

    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
        { employeeCode: { contains: search, mode: 'insensitive' } },
      ];
    }

    const employees = await prisma.employee.findMany({
      where,
      include: {
        location: { select: { id: true, name: true, brand: true } },
        manager: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });

    res.json(employees);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch employees' });
  }
});

// GET /api/employees/:id
router.get('/:id', async (req, res) => {
  try {
    const employee = await prisma.employee.findUnique({
      where: { id: parseInt(req.params.id) },
      include: {
        location: true,
        manager: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    if (!employee) return res.status(404).json({ error: 'Not found' });
    res.json(employee);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch employee' });
  }
});

// POST /api/employees
router.post('/', async (req, res) => {
  try {
    const { firstName, lastName, phone, locationId, role, employeeCode, hireDate, isManager } = req.body;
    const employee = await prisma.employee.create({
      data: {
        firstName,
        lastName,
        phone,
        locationId: locationId ? parseInt(locationId) : null,
        role,
        employeeCode,
        hireDate: hireDate ? new Date(hireDate) : null,
        isManager: isManager || false,
      },
    });
    res.status(201).json(employee);
  } catch (err) {
    console.error(err);
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'Phone number or employee code already exists' });
    }
    res.status(500).json({ error: 'Failed to create employee' });
  }
});

// PUT /api/employees/:id
router.put('/:id', async (req, res) => {
  try {
    const { firstName, lastName, phone, locationId, role, employeeCode, hireDate, isManager, active } = req.body;
    const data = {};
    if (firstName !== undefined) data.firstName = firstName;
    if (lastName !== undefined) data.lastName = lastName;
    if (phone !== undefined) data.phone = phone;
    if (locationId !== undefined) data.locationId = locationId ? parseInt(locationId) : null;
    if (role !== undefined) data.role = role;
    if (employeeCode !== undefined) data.employeeCode = employeeCode;
    if (hireDate !== undefined) data.hireDate = hireDate ? new Date(hireDate) : null;
    if (isManager !== undefined) data.isManager = isManager;
    if (active !== undefined) data.active = active;

    const employee = await prisma.employee.update({
      where: { id: parseInt(req.params.id) },
      data,
    });
    res.json(employee);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update employee' });
  }
});

// PATCH /api/employees/:id/manager — toggle isManager (managers cannot do this)
router.patch('/:id/manager', async (req, res) => {
  try {
    const role = req.appUser?.role;
    if (role === 'manager') {
      return res.status(403).json({ error: 'Managers cannot change manager status' });
    }

    // Admins can only toggle employees in their allowed locations
    if (role === 'admin') {
      const allowedIds = getAllowedLocationIds(req.appUser);
      if (allowedIds) {
        const emp = await prisma.employee.findUnique({
          where: { id: parseInt(req.params.id) },
          select: { locationId: true },
        });
        if (emp && !allowedIds.includes(emp.locationId)) {
          return res.status(403).json({ error: 'Cannot modify employees outside your locations' });
        }
      }
    }

    const { isManager } = req.body;
    if (typeof isManager !== 'boolean') return res.status(400).json({ error: 'isManager must be boolean' });

    const employee = await prisma.employee.update({
      where: { id: parseInt(req.params.id) },
      data: { isManager },
    });
    res.json(employee);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update manager flag' });
  }
});

// DELETE /api/employees/:id (soft delete)
router.delete('/:id', async (req, res) => {
  try {
    await prisma.employee.update({
      where: { id: parseInt(req.params.id) },
      data: { active: false },
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to deactivate employee' });
  }
});

// GET /api/employees/:id/absences
router.get('/:id/absences', async (req, res) => {
  try {
    const absences = await prisma.absence.findMany({
      where: { employeeId: parseInt(req.params.id) },
      include: {
        reason: true,
        location: { select: { name: true } },
      },
      orderBy: { shiftDate: 'desc' },
    });
    res.json(absences);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch absences' });
  }
});

module.exports = router;
