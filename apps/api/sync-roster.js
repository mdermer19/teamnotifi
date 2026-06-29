/**
 * sync-roster.js
 * Reads a Paylocity "Employee Comprehensive Demographic List" CSV and upserts
 * employees into the TeamNotifi database.
 *
 * Sync rules:
 *  - paylocityPhone always reflects what Paylocity has on file
 *  - phone (used for SMS) is only updated from Paylocity if no personal number exists
 *  - isManager is never demoted by sync — only promoted via supervisor relationships
 *  - Employees no longer in the active export are deactivated; open SMS sessions closed
 *  - Phone conflicts are logged as warnings and surfaced in the exception report
 *
 * Usage:
 *   node -r dotenv/config sync-roster.js [path/to/file.csv]
 *   (defaults to ./paylocity-roster.csv if no path given)
 */

const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const p = new PrismaClient();

// Maps Paylocity "Location Description" values to canonical names in the DB.
// Add entries here when Paylocity names drift from what is stored in TeamNotifi.
const LOCATION_MAP = {
  'Brookhaven':        'Brookhaven',
  'Buckhead':          'Buckhead',
  'Smyrna':            'Smyrna',
  'DT Roswell':        'Downtown Roswell',
  'E Roswell':         'East Roswell',
  'Johns Creek':       'Johns Creek',
  'Chastain':          'Chastain',
  'Central':           'Central',
  'Cedar':             'Cedar',
  'Lake Highlands':    'Lake Highlands',
  'Harmony Pet Resort':'Harmony Pet Resort',
};

// ── CSV parser ───────────────────────────────────────────────────────────────
function parseCSV(filePath) {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const lines = raw.split(/\r?\n/).filter(l => l.trim());

  function parseLine(line) {
    const fields = [];
    let cur = '';
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQuote = !inQuote;
      } else if (ch === ',' && !inQuote) {
        fields.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    }
    fields.push(cur.trim());
    return fields;
  }

  const headers = parseLine(lines[0]);
  return lines.slice(1).map(line => {
    const vals = parseLine(line);
    const row = {};
    headers.forEach((h, i) => { row[h] = vals[i] ?? ''; });
    return row;
  });
}

// ── Phone normalizer ─────────────────────────────────────────────────────────
function normalizePhone(raw) {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
}

// ── Close open SMS session for a phone number ────────────────────────────────
async function closeSessionForPhone(phone) {
  if (!phone) return;
  await p.smsSession.deleteMany({ where: { phone } }).catch(() => {});
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const csvPath = process.argv[2] || path.join(__dirname, 'paylocity-roster.csv');
  if (!fs.existsSync(csvPath)) {
    console.error(`CSV file not found: ${csvPath}`);
    console.error('Usage: node -r dotenv/config sync-roster.js [path/to/file.csv]');
    process.exit(1);
  }

  console.log(`Reading ${csvPath}...`);
  const rows = parseCSV(csvPath);
  console.log(`  ${rows.length} rows read`);

  const activeRows = rows.filter(r => (r['Employee Status Description'] || '').toLowerCase() === 'active');
  console.log(`  ${activeRows.length} active employees`);

  const log = await p.rosterSyncLog.create({
    data: { status: 'running', rowsRead: activeRows.length },
  });

  // ── Step 1: Upsert locations ─────────────────────────────────────────────
  const locationCache = {};
  const existingLocs = await p.location.findMany();
  for (const loc of existingLocs) locationCache[loc.name] = loc;

  const paylocityLocationNames = [...new Set(activeRows.map(r => r['Location Description']).filter(Boolean))];
  for (const plName of paylocityLocationNames) {
    const canonical = LOCATION_MAP[plName] || plName;
    if (!locationCache[canonical]) {
      const created = await p.location.create({
        data: { name: canonical, brand: 'Puppy Haven', region: 'Atlanta' },
      });
      locationCache[canonical] = created;
      console.log(`  Created location: ${canonical}`);
    }
  }

  // ── Step 2: Upsert employees (first pass — no managerId yet) ─────────────
  let updated = 0;
  let skipped = 0;
  const errors = [];
  const phoneConflicts = []; // tracked for exception report

  for (const row of activeRows) {
    const employeeCode = row['Employee Id'];
    if (!employeeCode) {
      console.warn(`  SKIP row — no Employee ID found`);
      skipped++;
      continue;
    }

    const paylocityPhone = normalizePhone(row['Work Mobile Phone']) || null;

    const plLocation = row['Location Description'];
    let locationId = null;
    if (plLocation) {
      const canonical = LOCATION_MAP[plLocation] || plLocation;
      locationId = locationCache[canonical] ? locationCache[canonical].id : null;
    }

    const hireRaw = row['Hire Date'];
    let hireDate = null;
    if (hireRaw) {
      const d = new Date(hireRaw);
      if (!isNaN(d)) hireDate = d;
    }

    // Fields always overwritten from Paylocity
    const paylocityFields = {
      firstName:     row['Preferred/First Name'] || null,
      lastName:      row['Last Name'] || null,
      workEmail:     row['Work Email'] || null,
      paylocityPhone,
      role:          row['Position Description'] || null,
      locationId,
      hireDate,
      active:        true,
      sheetSyncedAt: new Date(),
    };

    try {
      const existing = await p.employee.findUnique({ where: { employeeCode } });

      if (existing) {
        // Determine the SMS phone to use:
        // - If employee has a personal number (phone differs from their old paylocityPhone), keep it
        // - Otherwise update phone to match the new Paylocity number
        let smsPhone = existing.phone;
        const hasPersonalNumber = existing.phone && existing.phone !== existing.paylocityPhone;

        if (paylocityPhone && !hasPersonalNumber) {
          // Check for conflict before updating
          const conflict = await p.employee.findFirst({
            where: { phone: paylocityPhone, employeeCode: { not: employeeCode } },
          });
          if (conflict) {
            console.warn(`  WARN ${employeeCode} (${paylocityFields.firstName} ${paylocityFields.lastName}) — Paylocity phone ${paylocityPhone} already used by employee ${conflict.employeeCode}`);
            phoneConflicts.push({ employeeCode, conflictWith: conflict.employeeCode, phone: paylocityPhone });
            // Keep existing smsPhone unchanged; still save paylocityPhone for reference
          } else {
            smsPhone = paylocityPhone;
          }
        }

        await p.employee.update({
          where: { employeeCode },
          data: { ...paylocityFields, phone: smsPhone },
        });
      } else {
        // New employee — phone starts as paylocityPhone unless it conflicts
        let smsPhone = paylocityPhone;
        if (paylocityPhone) {
          const conflict = await p.employee.findFirst({ where: { phone: paylocityPhone } });
          if (conflict) {
            console.warn(`  WARN ${employeeCode} (${paylocityFields.firstName} ${paylocityFields.lastName}) — Paylocity phone ${paylocityPhone} already used by employee ${conflict.employeeCode}`);
            phoneConflicts.push({ employeeCode, conflictWith: conflict.employeeCode, phone: paylocityPhone });
            smsPhone = null;
          }
        }
        await p.employee.create({
          data: { ...paylocityFields, phone: smsPhone, employeeCode },
        });
      }
      updated++;
    } catch (e) {
      console.error(`  ERROR ${employeeCode}: ${e.message}`);
      errors.push({ employeeCode, error: e.message });
      skipped++;
    }
  }

  // ── Step 3: Second pass — wire up managerId ──────────────────────────────
  console.log('Wiring manager relationships...');
  let managerLinked = 0;

  for (const row of activeRows) {
    const employeeCode = row['Employee Id'];
    const supervisorCode = row["Supervisor's Employee ID"];
    if (!employeeCode || !supervisorCode) continue;

    try {
      const emp = await p.employee.findUnique({ where: { employeeCode } });
      // Supervisor may be active or inactive — look up without active filter
      const mgr = await p.employee.findUnique({ where: { employeeCode: supervisorCode } });
      if (emp && mgr && emp.managerId !== mgr.id) {
        await p.employee.update({ where: { id: emp.id }, data: { managerId: mgr.id } });
        managerLinked++;
      }
    } catch (e) {
      // Non-fatal
    }
  }

  // ── Step 4: Auto-mark supervisors as isManager (never demote) ───────────
  const supervisorCodes = [...new Set(activeRows.map(r => r["Supervisor's Employee ID"]).filter(Boolean))];
  if (supervisorCodes.length > 0) {
    const result = await p.employee.updateMany({
      where: { employeeCode: { in: supervisorCodes }, isManager: false },
      data: { isManager: true },
    });
    console.log(`  Auto-marked ${result.count} supervisors as managers`);
  }

  // ── Step 5: Deactivate employees no longer in the active export ──────────
  const activeCodes = new Set(activeRows.map(r => r['Employee Id']).filter(Boolean));
  const currentlyActive = await p.employee.findMany({
    where: { active: true, employeeCode: { not: null } },
  });

  let deactivated = 0;
  for (const emp of currentlyActive) {
    if (!activeCodes.has(emp.employeeCode)) {
      await p.employee.update({ where: { id: emp.id }, data: { active: false } });
      // Close any open SMS session so they can't continue a mid-flight conversation
      await closeSessionForPhone(emp.phone);
      deactivated++;
      console.log(`  Deactivated: ${emp.firstName} ${emp.lastName} (${emp.employeeCode})`);
    }
  }

  // ── Finalize log ──────────────────────────────────────────────────────────
  await p.rosterSyncLog.update({
    where: { id: log.id },
    data: {
      completedAt: new Date(),
      status: errors.length ? 'completed_with_errors' : 'success',
      rowsUpdated: updated,
      rowsSkipped: skipped,
      errors: errors.length ? errors : undefined,
    },
  });

  console.log('');
  console.log('── Sync complete ──────────────────────');
  console.log(`  Updated/created  : ${updated}`);
  console.log(`  Manager links    : ${managerLinked}`);
  console.log(`  Deactivated      : ${deactivated}`);
  console.log(`  Phone conflicts  : ${phoneConflicts.length}`);
  console.log(`  Skipped/errors   : ${skipped}`);
  if (phoneConflicts.length) {
    console.log('  Phone conflicts (see exception report):');
    phoneConflicts.forEach(c => console.log(`    ${c.employeeCode} conflicts with ${c.conflictWith} on ${c.phone}`));
  }
  if (errors.length) {
    console.log('  Errors:');
    errors.forEach(e => console.log(`    ${e.employeeCode}: ${e.error}`));
  }
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => p.$disconnect());