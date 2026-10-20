#!/usr/bin/env node
/**
 * Creates the schema and seeds demo users + sample timesheets.
 * Idempotent — safe to run again.
 *
 *   npm run init-db
 */
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const db = require('../db');

const SEED_PASSWORD = process.env.SEED_PASSWORD || 'password123';

const USERS = [
  { username: 'admin',    email: 'admin@example.com',   full_name: 'Admin User',     role: 'admin',    department: 'Administration' },
  { username: 'manager1', email: 'manager@example.com', full_name: 'Priya Sharma',   role: 'manager',  department: 'Engineering' },
  { username: 'emp1',     email: 'emp1@example.com',    full_name: 'Rahul Verma',    role: 'employee', department: 'Engineering' },
  { username: 'emp2',     email: 'emp2@example.com',    full_name: 'Anjali Mehta',   role: 'employee', department: 'Engineering' },
  { username: 'emp3',     email: 'emp3@example.com',    full_name: 'Sameer Khan',    role: 'employee', department: 'QA' },
];

const TASKS = [
  ['Login module bug fix', 'Development'],
  ['API integration testing', 'Testing'],
  ['Sprint planning meeting', 'Meeting'],
  ['Dashboard UI redesign', 'Design'],
  ['Deployment runbook update', 'Documentation'],
  ['Customer ticket triage', 'Support'],
  ['Database index optimization', 'Maintenance'],
];

async function main() {
  console.log('→ Applying schema...');
  const sql = fs.readFileSync(path.join(__dirname, '..', 'database', 'schema.sql'), 'utf8');
  await db.exec(sql);
  console.log(`  schema ok (${db.mode})`);

  console.log('→ Seeding users...');
  const hash = await bcrypt.hash(SEED_PASSWORD, 10);
  const ids = {};
  for (const u of USERS) {
    const { rows } = await db.query(
      `INSERT INTO users (username, email, password, full_name, role, department)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name
       RETURNING id, email`,
      [u.username, u.email, hash, u.full_name, u.role, u.department]
    );
    ids[u.email] = rows[0].id;
    console.log(`  ${u.role.padEnd(8)} ${u.email}`);
  }

  console.log('→ Seeding sample timesheets...');
  const employees = USERS.filter((u) => u.role === 'employee');
  const statuses = ['Approved', 'Approved', 'Approved', 'Submitted', 'Draft'];
  let inserted = 0;

  for (let dayOffset = 0; dayOffset < 14; dayOffset++) {
    const d = new Date();
    d.setDate(d.getDate() - dayOffset);
    if (d.getDay() === 0 || d.getDay() === 6) continue; // skip weekends
    const dateStr = d.toISOString().split('T')[0];

    for (const emp of employees) {
      const [task, category] = TASKS[(dayOffset + emp.username.length) % TASKS.length];
      const hours = 4 + ((dayOffset + emp.username.length) % 5);
      const status = statuses[dayOffset % statuses.length];

      const res = await db.query(
        `INSERT INTO timesheets
           (employee_id, employee_name, date, start_time, end_time, hours, task_name, category, description, status)
         VALUES ($1,$2,$3,'09:00',$4,$5,$6,$7,$8,$9)
         ON CONFLICT DO NOTHING RETURNING id`,
        [
          ids[emp.email], emp.full_name, dateStr,
          `${String(9 + hours).padStart(2, '0')}:00`, hours,
          task, category, `${task} — ${hours}h logged`, status,
        ]
      );
      if (res.rowCount) inserted++;
    }
  }
  console.log(`  ${inserted} timesheet rows inserted`);

  console.log('\n✓ Database ready\n');
  console.log('  Login credentials:');
  USERS.forEach((u) => console.log(`    ${u.role.padEnd(8)} ${u.email.padEnd(22)} ${SEED_PASSWORD}`));
  console.log('\n  ⚠  Production mein ye passwords turant badlein.\n');

  await db.pool.end();
}

main().catch((err) => {
  console.error('\n✗ init-db failed:', err.message);
  process.exit(1);
});
