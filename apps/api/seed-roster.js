const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  // ── Locations ────────────────────────────────────────────────────────
  const locationData = [
    { name: 'Brookhaven',      brand: 'Puppy Haven', region: 'Atlanta', storeNumber: 1 },
    { name: 'Sandy Springs',   brand: 'Puppy Haven', region: 'Atlanta', storeNumber: 2 },
    { name: 'Buckhead',        brand: 'Puppy Haven', region: 'Atlanta', storeNumber: 3 },
    { name: 'Decatur',         brand: 'Puppy Haven', region: 'Atlanta', storeNumber: 4 },
    { name: 'Alpharetta',      brand: 'Puppy Haven', region: 'North Atlanta', storeNumber: 5 },
    { name: 'Roswell',         brand: 'Puppy Haven', region: 'North Atlanta', storeNumber: 6 },
    { name: 'Smyrna',          brand: 'Puppy Haven', region: 'West Atlanta', storeNumber: 7 },
  ];

  // Upsert locations (keep Brookhaven id=1)
  const locations = [];
  for (const loc of locationData) {
    const existing = await p.location.findFirst({ where: { name: loc.name, brand: loc.brand } });
    if (existing) {
      locations.push(existing);
    } else {
      const created = await p.location.create({ data: loc });
      locations.push(created);
    }
  }
  console.log('Locations ready:', locations.map(l => `${l.id}:${l.name}`).join(', '));

  // ── Managers (7) ────────────────────────────────────────────────────
  // One manager per location
  const managerData = [
    { firstName: 'Rachel',   lastName: 'Nguyen',     phone: '+14045550101', employeeCode: 'MGR001', role: 'manager', locationIndex: 0 },
    { firstName: 'Derek',    lastName: 'Caldwell',   phone: '+14045550102', employeeCode: 'MGR002', role: 'manager', locationIndex: 1 },
    { firstName: 'Tamara',   lastName: 'Washington', phone: '+14045550103', employeeCode: 'MGR003', role: 'manager', locationIndex: 2 },
    { firstName: 'Justin',   lastName: 'Morales',    phone: '+14045550104', employeeCode: 'MGR004', role: 'manager', locationIndex: 3 },
    { firstName: 'Brittany', lastName: 'Foster',     phone: '+14045550105', employeeCode: 'MGR005', role: 'manager', locationIndex: 4 },
    { firstName: 'Marcus',   lastName: 'Henderson',  phone: '+14045550106', employeeCode: 'MGR006', role: 'manager', locationIndex: 5 },
    { firstName: 'Alicia',   lastName: 'Pham',       phone: '+14045550107', employeeCode: 'MGR007', role: 'manager', locationIndex: 6 },
  ];

  const managers = [];
  for (const m of managerData) {
    const loc = locations[m.locationIndex];
    const existing = await p.employee.findFirst({ where: { OR: [{ phone: m.phone }, { employeeCode: m.employeeCode }] } });
    const data = {
      firstName: m.firstName,
      lastName: m.lastName,
      phone: m.phone,
      employeeCode: m.employeeCode,
      role: m.role,
      isManager: true,
      locationId: loc.id,
      active: true,
    };
    const mgr = existing
      ? await p.employee.update({ where: { id: existing.id }, data })
      : await p.employee.create({ data });
    managers.push({ ...mgr, locationId: loc.id });
    console.log(`Manager: ${mgr.firstName} ${mgr.lastName} @ ${loc.name} (id=${mgr.id})`);
  }

  // ── Staff employees (43) ─────────────────────────────────────────────
  // Distributed across all 7 locations (roughly 6 per location)
  const staffData = [
    // Brookhaven (loc 0) — 6 staff
    { firstName: 'Jasmine',   lastName: 'Brooks',     phone: '+14045550201', employeeCode: 'BKH001', role: 'daycare_attendant', locationIndex: 0 },
    { firstName: 'Tyler',     lastName: 'Grant',      phone: '+14045550202', employeeCode: 'BKH002', role: 'bather',           locationIndex: 0 },
    { firstName: 'Monique',   lastName: 'Parker',     phone: '+14045550203', employeeCode: 'BKH003', role: 'daycare_attendant', locationIndex: 0 },
    { firstName: 'Evan',      lastName: 'Simmons',    phone: '+14045550204', employeeCode: 'BKH004', role: 'front_desk',       locationIndex: 0 },
    { firstName: 'Destiny',   lastName: 'Robinson',   phone: '+14045550205', employeeCode: 'BKH005', role: 'trainer',          locationIndex: 0 },
    { firstName: 'Caleb',     lastName: 'Mitchell',   phone: '+14045550206', employeeCode: 'BKH006', role: 'daycare_attendant', locationIndex: 0 },

    // Sandy Springs (loc 1) — 6 staff
    { firstName: 'Amber',     lastName: 'Torres',     phone: '+14045550207', employeeCode: 'SS001',  role: 'bather',           locationIndex: 1 },
    { firstName: 'Brandon',   lastName: 'Lee',        phone: '+14045550208', employeeCode: 'SS002',  role: 'daycare_attendant', locationIndex: 1 },
    { firstName: 'Kayla',     lastName: 'Johnson',    phone: '+14045550209', employeeCode: 'SS003',  role: 'front_desk',       locationIndex: 1 },
    { firstName: 'Darius',    lastName: 'White',      phone: '+14045550210', employeeCode: 'SS004',  role: 'daycare_attendant', locationIndex: 1 },
    { firstName: 'Nikki',     lastName: 'Adams',      phone: '+14045550211', employeeCode: 'SS005',  role: 'bather',           locationIndex: 1 },
    { firstName: 'Trevor',    lastName: 'Hall',       phone: '+14045550212', employeeCode: 'SS006',  role: 'daycare_attendant', locationIndex: 1 },

    // Buckhead (loc 2) — 6 staff
    { firstName: 'Priya',     lastName: 'Patel',      phone: '+14045550213', employeeCode: 'BKD001', role: 'front_desk',       locationIndex: 2 },
    { firstName: 'Marcus',    lastName: 'King',       phone: '+14045550214', employeeCode: 'BKD002', role: 'daycare_attendant', locationIndex: 2 },
    { firstName: 'Ashley',    lastName: 'Turner',     phone: '+14045550215', employeeCode: 'BKD003', role: 'bather',           locationIndex: 2 },
    { firstName: 'Devon',     lastName: 'Scott',      phone: '+14045550216', employeeCode: 'BKD004', role: 'daycare_attendant', locationIndex: 2 },
    { firstName: 'Lauren',    lastName: 'Baker',      phone: '+14045550217', employeeCode: 'BKD005', role: 'trainer',          locationIndex: 2 },
    { firstName: 'Chris',     lastName: 'Evans',      phone: '+14045550218', employeeCode: 'BKD006', role: 'daycare_attendant', locationIndex: 2 },

    // Decatur (loc 3) — 6 staff
    { firstName: 'Tanya',     lastName: 'Green',      phone: '+14045550219', employeeCode: 'DEC001', role: 'bather',           locationIndex: 3 },
    { firstName: 'Jordan',    lastName: 'Harris',     phone: '+14045550220', employeeCode: 'DEC002', role: 'daycare_attendant', locationIndex: 3 },
    { firstName: 'Simone',    lastName: 'Martinez',   phone: '+14045550221', employeeCode: 'DEC003', role: 'front_desk',       locationIndex: 3 },
    { firstName: 'Kyle',      lastName: 'Thompson',   phone: '+14045550222', employeeCode: 'DEC004', role: 'daycare_attendant', locationIndex: 3 },
    { firstName: 'Renee',     lastName: 'Wilson',     phone: '+14045550223', employeeCode: 'DEC005', role: 'bather',           locationIndex: 3 },
    { firstName: 'Isaiah',    lastName: 'Carter',     phone: '+14045550224', employeeCode: 'DEC006', role: 'daycare_attendant', locationIndex: 3 },

    // Alpharetta (loc 4) — 6 staff
    { firstName: 'Megan',     lastName: 'Collins',    phone: '+14045550225', employeeCode: 'ALP001', role: 'front_desk',       locationIndex: 4 },
    { firstName: 'Andre',     lastName: 'Stewart',    phone: '+14045550226', employeeCode: 'ALP002', role: 'daycare_attendant', locationIndex: 4 },
    { firstName: 'Vanessa',   lastName: 'Rivera',     phone: '+14045550227', employeeCode: 'ALP003', role: 'bather',           locationIndex: 4 },
    { firstName: 'Dylan',     lastName: 'Cooper',     phone: '+14045550228', employeeCode: 'ALP004', role: 'daycare_attendant', locationIndex: 4 },
    { firstName: 'Chantel',   lastName: 'Reed',       phone: '+14045550229', employeeCode: 'ALP005', role: 'trainer',          locationIndex: 4 },
    { firstName: 'Nathan',    lastName: 'Morgan',     phone: '+14045550230', employeeCode: 'ALP006', role: 'daycare_attendant', locationIndex: 4 },

    // Roswell (loc 5) — 7 staff
    { firstName: 'Tiffany',   lastName: 'Bell',       phone: '+14045550231', employeeCode: 'ROS001', role: 'bather',           locationIndex: 5 },
    { firstName: 'Elijah',    lastName: 'Murphy',     phone: '+14045550232', employeeCode: 'ROS002', role: 'daycare_attendant', locationIndex: 5 },
    { firstName: 'Crystal',   lastName: 'Cook',       phone: '+14045550233', employeeCode: 'ROS003', role: 'front_desk',       locationIndex: 5 },
    { firstName: 'Malik',     lastName: 'Bailey',     phone: '+14045550234', employeeCode: 'ROS004', role: 'daycare_attendant', locationIndex: 5 },
    { firstName: 'Alexis',    lastName: 'Flores',     phone: '+14045550235', employeeCode: 'ROS005', role: 'bather',           locationIndex: 5 },
    { firstName: 'Jared',     lastName: 'Sanchez',    phone: '+14045550236', employeeCode: 'ROS006', role: 'daycare_attendant', locationIndex: 5 },
    { firstName: 'Whitney',   lastName: 'Gonzalez',   phone: '+14045550237', employeeCode: 'ROS007', role: 'front_desk',       locationIndex: 5 },

    // Smyrna (loc 6) — 6 staff
    { firstName: 'Terrence',  lastName: 'Howard',     phone: '+14045550238', employeeCode: 'SMY001', role: 'daycare_attendant', locationIndex: 6 },
    { firstName: 'Brianna',   lastName: 'Ward',       phone: '+14045550239', employeeCode: 'SMY002', role: 'bather',           locationIndex: 6 },
    { firstName: 'Antoine',   lastName: 'Patterson',  phone: '+14045550240', employeeCode: 'SMY003', role: 'daycare_attendant', locationIndex: 6 },
    { firstName: 'Keisha',    lastName: 'James',      phone: '+14045550241', employeeCode: 'SMY004', role: 'front_desk',       locationIndex: 6 },
    { firstName: 'Garrett',   lastName: 'Hughes',     phone: '+14045550242', employeeCode: 'SMY005', role: 'daycare_attendant', locationIndex: 6 },
    { firstName: 'Latoya',    lastName: 'Price',      phone: '+14045550243', employeeCode: 'SMY006', role: 'bather',           locationIndex: 6 },
  ];

  let staffCreated = 0;
  for (const s of staffData) {
    const loc = locations[s.locationIndex];
    const mgr = managers[s.locationIndex];
    const existing = await p.employee.findFirst({ where: { OR: [{ phone: s.phone }, { employeeCode: s.employeeCode }] } });
    const data = {
      firstName: s.firstName,
      lastName: s.lastName,
      phone: s.phone,
      employeeCode: s.employeeCode,
      role: s.role,
      isManager: false,
      locationId: loc.id,
      managerId: mgr.id,
      active: true,
    };
    if (existing) {
      await p.employee.update({ where: { id: existing.id }, data });
    } else {
      await p.employee.create({ data });
      staffCreated++;
    }
  }

  // Also assign Michael Dermer (id=1) to Brookhaven manager
  await p.employee.update({
    where: { id: 1 },
    data: { managerId: managers[0].id, locationId: locations[0].id },
  }).catch(() => {});

  const total = await p.employee.count({ where: { active: true } });
  console.log(`\nDone. ${staffCreated} staff created. Total active employees: ${total}`);
}

main()
  .then(() => process.exit(0))
  .catch(e => { console.error(e); process.exit(1); });
