const { PrismaClient } = require('@prisma/client');
const { clerkClient } = require('@clerk/express');

const prisma = new PrismaClient();

async function withAppUser(req, res, next) {
  const clerkUserId = req.auth?.userId;
  if (!clerkUserId) return next();

  try {
    let appUser = await prisma.appUser.findUnique({
      where: { clerkUserId },
      include: { locationAccess: { include: { location: { select: { id: true, name: true } } } } },
    });

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

      appUser = await prisma.appUser.create({
        data: { clerkUserId, email, name, role },
        include: { locationAccess: { include: { location: { select: { id: true, name: true } } } } },
      });
    }

    req.appUser = appUser;
    next();
  } catch (e) {
    console.error('withAppUser error:', e.message);
    next();
  }
}

function getAllowedLocationIds(appUser) {
  if (!appUser || appUser.role === 'super_admin') return null;
  return appUser.locationAccess.map(al => al.locationId);
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.appUser) return res.status(403).json({ error: 'No app user found' });
    if (!roles.includes(req.appUser.role)) return res.status(403).json({ error: 'Insufficient permissions' });
    next();
  };
}

module.exports = { withAppUser, getAllowedLocationIds, requireRole };
