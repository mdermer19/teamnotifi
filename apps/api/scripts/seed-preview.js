// Seeds the local preview database with a small, obviously-fake roster and
// turns the web report flow on. Safe by construction: refuses to run unless
// DATABASE_URL points at the local preview database.

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const PREVIEW_DB = /(?:localhost|127\.0\.0\.1):55432/;

async function main() {
  if (!PREVIEW_DB.test(process.env.DATABASE_URL || '')) {
    console.error('Refusing to run: DATABASE_URL must point at the local preview database (port 55432).');
    process.exit(1);
  }

  await prisma.auditLog.deleteMany({});
  await prisma.reportToken.deleteMany({});
  await prisma.notification.deleteMany({});
  await prisma.smsMessage.deleteMany({});
  await prisma.absence.deleteMany({});
  await prisma.smsSession.deleteMany({});
  await prisma.employee.deleteMany({});
  await prisma.location.deleteMany({});
  await prisma.absenceReason.deleteMany({});

  const loc = await prisma.location.create({
    data: { name: 'Brookhaven', brand: 'Puppy Haven', timezone: 'America/New_York' },
  });

  await prisma.absenceReason.createMany({
    data: [
      { code: 'SICK', label: "I'm Sick", sortOrder: 1 },
      { code: 'EMERG', label: 'Family/Personal or Other Emergency', sortOrder: 2 },
      { code: 'LATE', label: 'Late Arrival', sortOrder: 3 },
      { code: 'OTHER', label: 'Other', sortOrder: 4 },
    ],
  });

  const mgr = await prisma.employee.create({
    data: {
      firstName: 'Sample', lastName: 'Manager', phone: '+15550002222',
      employeeCode: 'PREVIEW-MGR', locationId: loc.id, isManager: true, role: 'manager',
    },
  });

  // Three employees so the preview can hand out three independent links —
  // one per scenario you might want to walk through. Sharing one employee
  // would trip the repeat-text dedupe window and only the first would work.
  for (const [first, phone, code] of [
    ['Sample', '+15550001111', 'PREVIEW-1'],
    ['Taylor', '+15550001112', 'PREVIEW-2'],
    ['Jordan', '+15550001113', 'PREVIEW-3'],
  ]) {
    await prisma.employee.create({
      data: {
        firstName: first, lastName: 'Employee', phone,
        employeeCode: code, locationId: loc.id, managerId: mgr.id, role: 'groomer',
      },
    });
  }

  // Turn the web flow on for the preview, and turn the confirmation text off
  // so nothing tries to reach Twilio while you are clicking around.
  for (const [key, value, label, type, description] of [
    ['web_report_flow_enabled', 'true', 'Use Web Form Instead of Text Conversation', 'boolean', 'Preview'],
    ['multi_day_prompt_enabled', 'true', 'Ask About Multi-Day Absences', 'boolean', 'Preview'],
    ['dr_note_prompt_enabled', 'true', "Ask for Doctor's Note (Sick)", 'boolean', 'Preview'],
    ['proof_prompt_enabled', 'true', 'Ask for Proof (Emergency)', 'boolean', 'Preview'],
    ['confirm_sms_enabled', 'false', 'Send Confirmation Text After Submitting', 'boolean', 'Preview: off'],
    ['report_token_ttl_minutes', '120', 'Report Link Expires After (minutes)', 'number', 'Preview'],
    ['report_token_max_per_hour', '100', 'Max Report Links Per Hour', 'number', 'Preview: raised'],
    ['report_link_dedupe_seconds', '0', 'Ignore Repeat Texts Within (seconds)', 'number', 'Preview: off'],
  ]) {
    await prisma.workflowSetting.upsert({
      where: { key },
      update: { value },
      create: { key, value, label, type, description },
    });
  }

  console.log('Preview data ready.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
