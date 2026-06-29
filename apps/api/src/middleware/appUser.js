const { PrismaClient } = require('@prisma/client');
const { clerkClient } = require('@clerk/express');

const prisma = new PrismaClient();

const userInclude = {
  employee: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
};

// Returns all active employee IDs in the supervisor chain under managerId (BFS)
async function getSubordinateIds(managerId) {
  const ids = new Set();
  let queue = [managerId];
  while (queue.length > 0) {
    const reports = await prisma.employee.findMany({
      where: { managerId: { in: queue }, active: true },
      select: { id: true },
    });
    queue = [];
    for (const r of reports) {
      if (!ids.has(r.id)) {
        ids.add(r.id);
        queue.push(r.id);
      }
    }
  }
  return [...ids];
}

// Returns null (see all) for super_admin/admin, or { employeeIds } for managers
async function getViewScope(appUser) {
  if (!appUser) return { employeeIds: [] };
  if (appUser.role === 'super_admin' || appUser.role === 'admin') return null;
  if (!appUser.employeeId) return { employeeIds: [] };
  const employeeIds = await getSubordinateIds(appUser.employeeId);
  return { employeeIds };
}

async function withAppUser(req, res, next) {
  const clerkUserId = req.auth?.userId;
  if (!clerkUserId) return next();

  try {
    console.log(`[auth] clerkUserId=${clerkUserId} path=${req.path}`);
    let appUser = await prisma.appUser.findUnique({
      where: { clerkUserId },
      include: userInclude,
    });
    console.log(`[auth] appUser found: ${appUser ? `id=${appUser.id} role=${appUser.role}` : 'null'}`);

    if (!appUser) {
      let email = null;
      let name = null;
      try {
        const clerkUser = await clerkClient.users.getUser(clerkUserId);
        email = clerkUser.emailAddresses?.[0]?.emailAddress || null;
        name = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ') || null;
      } catch {}

      const count = await prisma.appUser.count();
      const role = count === 0 ? 'super_admin' : 'manager';

      // Auto-link to employee record by email
      let employeeId = null;
      if (email) {
        const emp = await prisma.employee.findFirst({
          where: { workEmail: email, active: true },
          select: { id: true },
        });
        if (emp) employeeId = emp.id;
      }

      appUser = await prisma.appUser.create({
        data: { clerkUserId, email, name, role, employeeId },
        include: userInclude,
      });
    }

    // Set appUser now so auth is never lost even if auto-link fails
    req.appUser = appUser;

    // Try to auto-link on every login until linked
    if (!appUser.employeeId && appUser.email) {
      try {
        const emp = await prisma.employee.findFirst({
          where: { workEmail: appUser.email, active: true },
          select: { id: true },
        });
        if (emp) {
          req.appUser = await prisma.appUser.update({
            where: { id: appUser.id },
            data: { employeeId: emp.id },
            include: userInclude,
          });
        }
      } catch (linkErr) {
        console.error('Auto-link failed:', linkErr.message);
      }
    }

    next();
  } catch (e) {
    console.error('withAppUser error:', e.message);
    next();
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.appUser) return res.status(403).json({ error: 'No app user found' });
    if (!roles.includes(req.appUser.role)) return res.status(403).json({ error: 'Insufficient permissions' });
    next();
  };
}

module.exports = { withAppUser, getViewScope, getSubordinateIds, requireRole };
