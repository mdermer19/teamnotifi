/**
 * sync-roster.js
 * Reads a Paylocity "Employee Comprehensive Demographic List" CSV and upserts
 * employees into the TeamNotifi database.
 *
 * Safe to run repeatedly — uses employeeCode as the unique key and never
 * touches the isManager flag.
 *
 * Usage:
 *   node -r dotenv/config sync-roster.js [path/to/file.csv]
 *   (defaults to ./paylocity-roster.csv if no path given)
 */

const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const p = new PrismaClient();

// ── Location name mapping ────────────────────────────────────────────────────
// Maps Paylocity "Location Description" values to the canonical name stored
// in the locations table. Add entries here whenever Paylocity names drift.
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

const SKIP_LOCATION = new Set();

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

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const csvPath = process.argv[2] || path.join(__dirname, 'paylocity-roster.csv');
  if (!fs.existsSync(csvPath)) {
    console.error(`CSV file not found: ${csvPath}`);
    console.error('Usage: node -r dotenv/config sync-roster.js [path/to/file.csv]');
    process.exit(1);
  }

  console.log(`Reading ${csvPath}…`);
  const rows = parseCSV(csvPath);
  console.log(`  ${rows.length} rows read`);

  const activeRows = rows.filter(r => (r['Employee Status Description'] || '').toLowerCase() === 'active');
  console.log(`  ${activeRows.length} active employees`);

  const log = await p.rosterSyncLog.create({
    data: { status: 'running', rowsRead: activeRows.length },
  });

  // ── Step 1: Upsert locations ─────────────────────────────────────────────
  const locationCache = {}; // canonical name → Location row

  // Pre-load existing locations
  const existing = await p.location.findMany();
  for (const loc of existing) {
    locationCache[loc.name] = loc;
  }

  const paylocityLocationNames = [...new Set(activeRows.map(r => r['Location Description']).filter(Boolean))];

  for (const plName of paylocityLocationNames) {
    if (SKIP_LOCATION.has(plName)) continue;
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

  for (const row of activeRows) {
    const employeeCode = row['Employee Id'];
    if (!employeeCode) {
      console.warn(`  SKIP row — no Employee ID found`);
      skipped++;
      continue;
    }

    const phone = normalizePhone(row['Mobile Phone']) || null;

    const plLocation = row['Location Description'];
    let locationId = null;
    if (plLocation) {
      const canonical = LOCATION_MAP[plLocation] || plLocation;
      locationId = locationCache[canonical]?.id ?? null;
    }

    const hireRaw = row['Hire Date'];
    let hireDate = null;
    if (hireRaw) {
      const d = new Date(hireRaw);
      if (!isNaN(d)) hireDate = d;
    }

    const data = {
      firstName:    row['Preferred/First Name'] || null,
      lastName:     row['Last Name'] || null,
      phone,
      role:         row['Position Description'] || null,
      locationId,
      hireDate,
      active:       true,
      sheetSyncedAt: new Date(),
      // isManager is intentionally NOT touched here
    };

    try {
      const existing = await p.employee.findUnique({ where: { employeeCode } });
      if (existing) {
        // If phone changed and conflicts with another employee, clear it and warn
        if (phone && phone !== existing.phone) {
          const phoneConflict = await p.employee.findFirst({ where: { phone, employeeCode: { not: employeeCode } } });
          if (phoneConflict) {
            console.warn(`  WARN ${employeeCode} (${data.firstName} ${data.lastName}) — phone ${phone} already used by ${phoneConflict.employeeCode}, importing without phone`);
            data.phone = null;
          }
        }
        await p.employee.update({ where: { employeeCode }, data });
      } else {
        // New employee — if phone conflicts, import without phone and warn
        if (phone) {
          const phoneConflict = await p.employee.findUnique({ where: { phone } });
          if (phoneConflict) {
            console.warn(`  WARN ${employeeCode} (${data.firstName} ${data.lastName}) — phone ${phone} already used by ${phoneConflict.employeeCode}, importing without phone`);
            data.phone = null;
          }
        }
        await p.employee.create({ data: { ...data, employeeCode } });
      }
      updated++;
    } catch (e) {
      console.error(`  ERROR ${employeeCode}: ${e.message}`);
      errors.push({ employeeCode, error: e.message });
      skipped++;
    }
  }

  // ── Step 3: Second pass — wire up managerId ──────────────────────────────
  console.log('Wiring manager relationships…');
  let managerLinked = 0;

  for (const row of activeRows) {
    const employeeCode = row['Employee Id'];
    const supervisorCode = row["Supervisor's Employee ID"];
    if (!employeeCode || !supervisorCode) continue;

    try {
      const emp = await p.employee.findUnique({ where: { employeeCode } });
      const mgr = await p.employee.findUnique({ where: { employeeCode: supervisorCode } });
      if (emp && mgr && emp.managerId !== mgr.id) {
        await p.employee.update({
          where: { id: emp.id },
          data: { managerId: mgr.id },
        });
        managerLinked++;
      }
    } catch (e) {
      // Non-fatal — supervisor may not be in the active list
    }
  }

  // ── Step 4: Auto-mark supervisors as isManager ───────────────────────────
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
  const allEmployees = await p.employee.findMany({ where: { active: true, employeeCode: { not: null } } });
  let deactivated = 0;
  for (const emp of allEmployees) {
    if (emp.employeeCode && !activeCodes.has(emp.employeeCode)) {
      await p.employee.update({ where: { id: emp.id }, data: { active: false } });
      deactivated++;
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
  console.log(`  Updated/created : ${updated}`);
  console.log(`  Manager links   : ${managerLinked}`);
  console.log(`  Deactivated     : ${deactivated}`);
  console.log(`  Skipped/errors  : ${skipped}`);
  if (errors.length) {
    console.log('  Errors:');
    errors.forEach(e => console.log(`    ${e.employeeCode}: ${e.error}`));
  }
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => p.$disconnect());
