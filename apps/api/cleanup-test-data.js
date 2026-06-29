require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function cleanup() {
  // Show counts first
  const absenceCount = await prisma.absence.count();
  const inactiveCount = await prisma.employee.count({ where: { active: false } });
  const sessionCount = await prisma.smsSession.count();
  const messageCount = await prisma.smsMessage.count();

  console.log(`Found:`);
  console.log(`  ${absenceCount} absences`);
  console.log(`  ${inactiveCount} inactive employees`);
  console.log(`  ${sessionCount} SMS sessions`);
  console.log(`  ${messageCount} SMS messages`);
  console.log('');

  // Delete notifications (FK dependency on absences)
  const n1 = await prisma.notification.deleteMany({});
  console.log(`✓ Deleted ${n1.count} notifications`);

  // Delete SMS messages linked to absences
  const n2 = await prisma.smsMessage.deleteMany({});
  console.log(`✓ Deleted ${n2.count} SMS messages`);

  // Delete SMS sessions
  const n3 = await prisma.smsSession.deleteMany({});
  console.log(`✓ Deleted ${n3.count} SMS sessions`);

  // Delete all absences
  const n4 = await prisma.absence.deleteMany({});
  console.log(`✓ Deleted ${n4.count} absences`);

  // Delete inactive employees (test/fake ones)
  const n5 = await prisma.employee.deleteMany({ where: { active: false } });
  console.log(`✓ Deleted ${n5.count} inactive employees`);

  console.log('\nDone. Active employees and all other data untouched.');
}

cleanup()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
