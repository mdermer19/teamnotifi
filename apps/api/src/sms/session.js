const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const SESSION_TTL_MINUTES = 30;

async function getOrCreateSession(phone) {
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_TTL_MINUTES * 60 * 1000);

  let session = await prisma.smsSession.findUnique({ where: { phone } });

  if (session && session.expiresAt < now) {
    await prisma.smsSession.delete({ where: { phone } });
    session = null;
  }

  if (!session) {
    session = await prisma.smsSession.create({
      data: { phone, state: 'NEW', context: {}, expiresAt: expires },
    });
  }

  return session;
}

async function updateSession(phone, state, context) {
  const expires = new Date(Date.now() + SESSION_TTL_MINUTES * 60 * 1000);
  return prisma.smsSession.update({
    where: { phone },
    data: { state, context, expiresAt: expires, updatedAt: new Date() },
  });
}

async function closeSession(phone) {
  await prisma.smsSession.deleteMany({ where: { phone } });
}

module.exports = { getOrCreateSession, updateSession, closeSession };
