require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const location = await prisma.location.upsert({
    where: { id: 1 },
    update: {},
    create: { name: 'Brookhaven', brand: 'Puppy Haven', region: 'Atlanta', storeNumber: 1 },
  });

  // Test manager (Michael)
  const manager = await prisma.employee.upsert({
    where: { phone: '+16786658766' },
    update: {},
    create: {
      locationId: location.id,
      firstName: 'Michael',
      lastName: 'Dermer',
      phone: '+16786658766',
      employeeCode: 'MGR001',
      role: 'manager',
      isManager: true,
    },
  });

  console.log('Test data seeded.');
  console.log(`Location: ${location.name} (id=${location.id})`);
  console.log(`Manager: ${manager.firstName} ${manager.lastName} (id=${manager.id})`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
