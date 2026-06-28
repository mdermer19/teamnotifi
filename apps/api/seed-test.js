const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  await p.smsMessage.deleteMany({});
  await p.absence.deleteMany({});
  console.log('Cleared existing absences and messages.');

  const t = (base, sec) => new Date(base.getTime() + sec * 1000);

  // ── 1. Multi-day illness — Michael Dermer (id=1), Brookhaven ─────────
  const sickBase = new Date('2026-06-19T10:14:00.000Z'); // 6:14 AM ET

  const sickAbsence = await p.absence.create({
    data: {
      employeeId: 1,
      locationId: 1,
      reasonId: 1, // SICK
      shiftDate: new Date('2026-06-19T00:00:00.000Z'),
      returnDate: new Date('2026-06-23T00:00:00.000Z'),
      reportedAt: t(sickBase, 8 * 60 + 3),
      drNotePromised: true,
      lateCallout: false,
    },
  });

  const sickMessages = [
    { direction: 'inbound',  body: 'hey',   createdAt: t(sickBase, 0),           absenceId: null },
    { direction: 'outbound', body: 'Hi Michael! If you are reporting an absence or late arrival, reply YES to continue or CANCEL to stop.', createdAt: t(sickBase, 3), absenceId: null },

    { direction: 'inbound',  body: 'yes',   createdAt: t(sickBase, 41),          absenceId: null },
    { direction: 'outbound', body: 'What date are you reporting for? Reply TODAY, TOMORROW, or a date (e.g. 06/20).', createdAt: t(sickBase, 42), absenceId: null },

    { direction: 'inbound',  body: 'today', createdAt: t(sickBase, 78),          absenceId: null },
    { direction: 'outbound', body: "Please select a reason:\n1 - I'm Sick\n2 - Family/Personal Emergency\n3 - Late Arrival\n4 - Other", createdAt: t(sickBase, 79), absenceId: null },

    { direction: 'inbound',  body: '1',     createdAt: t(sickBase, 112),         absenceId: null },
    { direction: 'outbound', body: 'Do you plan to miss more than one day? Reply YES or NO.', createdAt: t(sickBase, 113), absenceId: null },

    { direction: 'inbound',  body: 'yes',   createdAt: t(sickBase, 158),         absenceId: null },
    { direction: 'outbound', body: 'What date do you plan to return to work? Reply a date (e.g. 06/22).', createdAt: t(sickBase, 159), absenceId: null },

    { direction: 'inbound',  body: '06/23', createdAt: t(sickBase, 241),         absenceId: null },
    { direction: 'outbound', body: "Will you be getting a doctor's note? Reply YES or NO.", createdAt: t(sickBase, 242), absenceId: null },

    { direction: 'inbound',  body: 'yes',   createdAt: t(sickBase, 8 * 60 + 2), absenceId: sickAbsence.id },
    { direction: 'outbound', body: "Sounds like a plan! Your absence has been recorded for Jun 19 – Jun 22. Please provide a copy of the doctor's note to your manager within 48 hours and you will not receive any points per the Attendance Policy. However, if you do not submit a doctor's note within 48 hours, the absence will be considered unexcused and you will receive 2 points per the Attendance Policy.", createdAt: t(sickBase, 8 * 60 + 3), absenceId: sickAbsence.id },
  ];

  await p.smsMessage.createMany({ data: sickMessages.map(m => ({ ...m, phone: '+16786658766' })) });
  console.log(`Sick absence #${sickAbsence.id} — Michael Dermer — ${sickMessages.length} messages`);

  // ── 2. Single-day emergency — Jasmine Brooks (BKH001), Brookhaven ────
  const emergBase = new Date('2026-06-19T11:32:00.000Z'); // 7:32 AM ET
  const jasmine = await p.employee.findUnique({ where: { employeeCode: 'BKH001' } });

  const emergAbsence = await p.absence.create({
    data: {
      employeeId: jasmine.id,
      locationId: 1,
      reasonId: 2, // EMERG
      shiftDate: new Date('2026-06-19T00:00:00.000Z'),
      reportedAt: t(emergBase, 5 * 60 + 45),
      notes: 'Pipe burst at home, flooding in kitchen. Need to stay for emergency plumber.',
      proofPromised: true,
      lateCallout: false,
    },
  });

  const emergMessages = [
    { direction: 'inbound',  body: 'hi',    createdAt: t(emergBase, 0),           absenceId: null },
    { direction: 'outbound', body: 'Hi Jasmine! If you are reporting an absence or late arrival, reply YES to continue or CANCEL to stop.', createdAt: t(emergBase, 4), absenceId: null },

    { direction: 'inbound',  body: 'YES',   createdAt: t(emergBase, 38),          absenceId: null },
    { direction: 'outbound', body: 'What date are you reporting for? Reply TODAY, TOMORROW, or a date (e.g. 06/20).', createdAt: t(emergBase, 39), absenceId: null },

    { direction: 'inbound',  body: 'today', createdAt: t(emergBase, 91),          absenceId: null },
    { direction: 'outbound', body: "Please select a reason:\n1 - I'm Sick\n2 - Family/Personal Emergency\n3 - Late Arrival\n4 - Other", createdAt: t(emergBase, 92), absenceId: null },

    { direction: 'inbound',  body: '2',     createdAt: t(emergBase, 143),         absenceId: null },
    { direction: 'outbound', body: 'Do you plan to miss more than one day? Reply YES or NO.', createdAt: t(emergBase, 144), absenceId: null },

    { direction: 'inbound',  body: 'no',    createdAt: t(emergBase, 187),         absenceId: null },
    { direction: 'outbound', body: 'Required - please provide further details about the nature of your absence.', createdAt: t(emergBase, 188), absenceId: null },

    { direction: 'inbound',  body: 'Pipe burst at home, flooding in kitchen. Need to stay for emergency plumber.', createdAt: t(emergBase, 4 * 60 + 12), absenceId: null },
    { direction: 'outbound', body: 'We are sorry to hear you are dealing with an emergency. Per the Attendance Policy, an emergency situation includes but is not limited to unexpected family, household, or personal emergencies. Management will determine whether this is an excused absence and whether documentation is required.', createdAt: t(emergBase, 4 * 60 + 13), absenceId: null },
    { direction: 'outbound', body: 'Are you able to provide proof of this emergency? Reply YES or NO.', createdAt: t(emergBase, 4 * 60 + 14), absenceId: null },

    { direction: 'inbound',  body: 'yes',   createdAt: t(emergBase, 5 * 60 + 44), absenceId: emergAbsence.id },
    { direction: 'outbound', body: "Sounds like a plan! Your absence has been recorded for Jun 19. Please send proof to your manager within 48 hours. The nature of the emergency is subject to management review. If it is determined to be a true emergency, you will not receive any points per the Attendance Policy. If it's determined this is not a true emergency or proof is required and not received within 48 hours, you will receive 2 points per the Attendance Policy.", createdAt: t(emergBase, 5 * 60 + 45), absenceId: emergAbsence.id },
  ];

  await p.smsMessage.createMany({ data: emergMessages.map(m => ({ ...m, phone: jasmine.phone })) });
  console.log(`Emergency absence #${emergAbsence.id} — Jasmine Brooks — ${emergMessages.length} messages`);

  console.log('\nDone.');
}

main()
  .then(() => process.exit(0))
  .catch(e => { console.error(e); process.exit(1); });
