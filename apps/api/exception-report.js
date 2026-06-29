require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

const RECIPIENT = 'hr@puppyhaven.com';
const PREVIEW_MODE = process.argv.includes('--preview');

async function run() {
  const employees = await prisma.employee.findMany({
    where: { active: true },
    include: { location: true, manager: true },
    orderBy: [{ location: { name: 'asc' } }, { lastName: 'asc' }],
  });

  const exceptions = employees
    .map(emp => {
      const issues = [];
      if (!emp.phone)      issues.push('Missing phone number');
      if (!emp.managerId)  issues.push('No supervisor assigned');
      if (!emp.locationId) issues.push('No location assigned');
      if (!emp.firstName)  issues.push('Missing first name');
      return issues.length > 0 ? { emp, issues } : null;
    })
    .filter(Boolean);

  if (exceptions.length === 0) {
    console.log('No exceptions found — email not sent.');
    return;
  }

  const rows = exceptions.map(({ emp, issues }) => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">${emp.lastName || '—'}, ${emp.firstName || '—'}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">${emp.location?.name || '—'}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">${emp.employeeCode || '—'}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#dc2626">${issues.join('<br>')}</td>
    </tr>`).join('');

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  const html = `
    <div style="font-family:Inter,Arial,sans-serif;max-width:700px;margin:0 auto">
      <div style="background:#042878;padding:20px 24px;border-radius:8px 8px 0 0">
        <h2 style="color:#fff;margin:0;font-size:18px">TeamNotifi — Employee Exception Report</h2>
        <p style="color:#94a3b8;margin:4px 0 0;font-size:13px">${today}</p>
      </div>
      <div style="background:#fff;border:1px solid #e2e8f0;border-top:none;padding:20px 24px;border-radius:0 0 8px 8px">
        <p style="color:#475569;font-size:14px;margin-top:0">
          The following <strong>${exceptions.length} employee${exceptions.length !== 1 ? 's' : ''}</strong>
          have data gaps that may prevent the SMS absence system from working correctly.
        </p>
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead>
            <tr style="background:#f8fafc">
              <th style="padding:8px 12px;text-align:left;color:#64748b;font-weight:600;border-bottom:2px solid #e2e8f0">Employee</th>
              <th style="padding:8px 12px;text-align:left;color:#64748b;font-weight:600;border-bottom:2px solid #e2e8f0">Location</th>
              <th style="padding:8px 12px;text-align:left;color:#64748b;font-weight:600;border-bottom:2px solid #e2e8f0">ID</th>
              <th style="padding:8px 12px;text-align:left;color:#64748b;font-weight:600;border-bottom:2px solid #e2e8f0">Issues</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <p style="color:#94a3b8;font-size:12px;margin-bottom:0;margin-top:20px">
          Update employee records in the TeamNotifi Roster to resolve these issues.
        </p>
      </div>
    </div>`;

  if (PREVIEW_MODE) {
    const outPath = path.join(__dirname, 'exception-report-preview.html');
    fs.writeFileSync(outPath, html);
    console.log(`Preview saved to: ${outPath}`);
    return;
  }

  const nodemailer = require('nodemailer');
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  await transporter.sendMail({
    from: `"TeamNotifi" <${process.env.EMAIL_USER}>`,
    to: RECIPIENT,
    subject: `TeamNotifi Exception Report — ${exceptions.length} employee${exceptions.length !== 1 ? 's' : ''} need attention`,
    html,
  });

  console.log(`Sent exception report to ${RECIPIENT}: ${exceptions.length} employee(s) flagged.`);
}

run()
  .catch(e => { console.error('Exception report failed:', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
