require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  await prisma.absenceReason.createMany({
    data: [
      { code: 'SICK',  label: "I'm Sick",                    isProtected: false, sortOrder: 1 },
      { code: 'EMERG', label: 'Family/Personal Emergency',   isProtected: false, sortOrder: 2 },
      { code: 'LATE',  label: 'Late Arrival',                isProtected: false, sortOrder: 3 },
      { code: 'OTHER', label: 'Other',                       isProtected: false, sortOrder: 4 },
    ],
    skipDuplicates: true,
  });
  console.log('Seeded absence reasons.');
}

main().catch(console.error).finally(() => prisma.$disconnect());
