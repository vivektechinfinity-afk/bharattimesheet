/**
 * End-to-end test against the real route handlers.
 *
 * Runs on PGlite (real Postgres compiled to WASM) in a throwaway directory, so it
 * needs no database install and no query mocking — the SQL exercised here is the
 * same SQL that runs in production.
 */
const path = require('path');
const fs = require('fs');
const os = require('os');

const BACKEND = path.join(__dirname, '..');

process.env.JWT_SECRET = 'test_secret';
process.env.NODE_ENV = 'test';
// Isolated data dir so a test run never touches the dev database.
process.env.PGLITE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ts-test-'));
delete process.env.DATABASE_URL;
delete process.env.DB_HOST;

const bcrypt = require('bcryptjs');
const request = require('supertest');
const db = require(path.join(BACKEND, 'db'));

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} ${extra}`); }
};

async function main() {
  const schema = fs.readFileSync(path.join(BACKEND, 'database/schema.sql'), 'utf8');
  await db.exec(schema);
  console.log(`schema applied (${db.mode})\n`);

  // --- seed users
  const hash = await bcrypt.hash('password123', 10);
  const users = [
    ['admin', 'admin@example.com', 'Admin User', 'admin', 'Administration'],
    ['mgr', 'manager@example.com', 'Priya Sharma', 'manager', 'Engineering'],
    ['emp1', 'emp1@example.com', 'Rahul Verma', 'employee', 'Engineering'],
    ['emp2', 'emp2@example.com', 'Anjali Mehta', 'employee', 'QA'],
  ];
  for (const [u, e, n, r, d] of users) {
    await db.query(
      'INSERT INTO users (username,email,password,full_name,role,department) VALUES ($1,$2,$3,$4,$5,$6)',
      [u, e, hash, n, r, d]
    );
  }

  const app = require(path.join(BACKEND, 'server.js'));
  const agent = request(app);

  // ================================================== AUTH
  console.log('AUTH');
  let r = await agent.post('/api/auth/login').send({ email: 'emp1@example.com', password: 'password123' });
  check('employee login returns token', r.status === 200 && !!r.body.token, `-> ${r.status} ${JSON.stringify(r.body)}`);
  const empToken = r.body.token;
  const empId = r.body.user?.id;

  r = await agent.post('/api/auth/login').send({ email: 'emp1@example.com', password: 'wrong' });
  check('wrong password rejected 401', r.status === 401);

  r = await agent.post('/api/auth/login').send({ email: 'nobody@example.com', password: 'password123' });
  check('unknown email also 401 (no user enumeration)', r.status === 401);

  r = await agent.post('/api/auth/login').send({ email: 'manager@example.com', password: 'password123' });
  const mgrToken = r.body.token;
  r = await agent.post('/api/auth/login').send({ email: 'admin@example.com', password: 'password123' });
  const adminToken = r.body.token;
  check('manager + admin login ok', !!mgrToken && !!adminToken);

  r = await agent.get('/api/timesheets');
  check('no token -> 401', r.status === 401);

  // ================================================== CREATE
  console.log('\nTIMESHEET CREATE');
  const today = new Date().toISOString().split('T')[0];
  const yest = new Date(Date.now() - 864e5).toISOString().split('T')[0];

  r = await agent.post('/api/timesheets/create').set('Authorization', `Bearer ${empToken}`)
    .send({ date: today, startTime: '09:00', endTime: '17:30', hours: 8.5, taskName: 'Login bug fix', category: 'Development', description: 'JWT refresh', status: 'Submitted' });
  check('create valid timesheet', r.status === 201 && r.body.data.status === 'Submitted', `-> ${r.status} ${JSON.stringify(r.body)}`);
  const tsId = r.body.data?.id;

  r = await agent.post('/api/timesheets/create').set('Authorization', `Bearer ${empToken}`)
    .send({ date: '2099-01-01', hours: 8, taskName: 'Time travel', category: 'Development' });
  check('future date rejected', r.status === 400, `-> ${r.status}`);

  r = await agent.post('/api/timesheets/create').set('Authorization', `Bearer ${empToken}`)
    .send({ date: today, hours: 30, taskName: 'Overwork', category: 'Development' });
  check('hours > 24 rejected', r.status === 400);

  r = await agent.post('/api/timesheets/create').set('Authorization', `Bearer ${empToken}`)
    .send({ date: today, hours: 5, taskName: 'Bad cat', category: 'Nonsense' });
  check('unknown category rejected', r.status === 400);

  r = await agent.post('/api/timesheets/create').set('Authorization', `Bearer ${empToken}`)
    .send({ date: today, hours: 5, category: 'Development' });
  check('missing taskName rejected', r.status === 400);

  // privilege: employee tries to file for someone else
  r = await agent.post('/api/timesheets/create').set('Authorization', `Bearer ${empToken}`)
    .send({ employeeId: 4, employeeName: 'Anjali Mehta', date: yest, hours: 4, taskName: 'Spoofed entry', category: 'Testing' });
  check('employee cannot file for another employee', r.status === 201 && r.body.data.employee_id === empId,
    `-> employee_id ${r.body.data?.employee_id}, expected ${empId}`);

  // ================================================== BULK (OCR path)
  console.log('\nBULK IMPORT (OCR path)');
  r = await agent.post('/api/timesheets/bulk').set('Authorization', `Bearer ${empToken}`).send({
    rows: [
      { date: yest, hours: 6, taskName: 'Bulk task A', category: 'Testing' },
      { date: yest, hours: 2, taskName: 'Bulk task B', category: 'Meeting' },
    ],
  });
  check('bulk insert 2 rows', r.status === 201 && r.body.count === 2, `-> ${r.status} ${JSON.stringify(r.body).slice(0,200)}`);

  const before = (await db.query('SELECT COUNT(*)::int n FROM timesheets')).rows[0].n;
  r = await agent.post('/api/timesheets/bulk').set('Authorization', `Bearer ${empToken}`).send({
    rows: [
      { date: yest, hours: 4, taskName: 'Good row', category: 'Development' },
      { date: yest, hours: 99, taskName: 'Bad row', category: 'Development' },
    ],
  });
  const after = (await db.query('SELECT COUNT(*)::int n FROM timesheets')).rows[0].n;
  check('bulk with one bad row rejects whole batch', r.status === 400 && before === after,
    `-> ${r.status}, rows ${before}->${after}`);

  // ================================================== READ / SCOPING
  console.log('\nREAD + SCOPING');
  await db.query(
    `INSERT INTO timesheets (employee_id, employee_name, date, hours, task_name, category, status)
     VALUES (4,'Anjali Mehta',$1,7,'QA regression','Testing','Submitted')`, [yest]
  );

  r = await agent.get('/api/timesheets').set('Authorization', `Bearer ${empToken}`);
  const otherRows = r.body.data.filter((t) => t.employee_id !== empId);
  check('employee sees only own rows', r.status === 200 && otherRows.length === 0,
    `-> saw ${otherRows.length} foreign rows`);

  r = await agent.get('/api/timesheets?employeeId=4').set('Authorization', `Bearer ${empToken}`);
  const leaked = r.body.data.filter((t) => t.employee_id !== empId);
  check('employee cannot query another employee via param', leaked.length === 0, `-> leaked ${leaked.length}`);

  r = await agent.get('/api/timesheets').set('Authorization', `Bearer ${mgrToken}`);
  const distinct = new Set(r.body.data.map((t) => t.employee_id));
  check('manager sees all employees', distinct.size > 1, `-> ${distinct.size} employees`);

  r = await agent.get(`/api/timesheets?status=Submitted`).set('Authorization', `Bearer ${mgrToken}`);
  check('status filter works', r.status === 200 && r.body.data.every((t) => t.status === 'Submitted'));

  r = await agent.get(`/api/timesheets?startDate=${yest}&endDate=${yest}`).set('Authorization', `Bearer ${mgrToken}`);
  check('date range filter works', r.status === 200 && r.body.data.every((t) => String(t.date).startsWith(yest)));

  // ================================================== APPROVALS
  console.log('\nAPPROVALS');
  r = await agent.put(`/api/timesheets/${tsId}`).set('Authorization', `Bearer ${empToken}`)
    .send({ status: 'Approved' });
  check('employee cannot self-approve', r.status === 403, `-> ${r.status}`);

  r = await agent.put(`/api/timesheets/${tsId}`).set('Authorization', `Bearer ${mgrToken}`)
    .send({ status: 'Approved', approverComment: 'Looks good' });
  check('manager can approve', r.status === 200 && r.body.data.status === 'Approved', `-> ${r.status} ${JSON.stringify(r.body).slice(0,200)}`);

  r = await agent.put(`/api/timesheets/${tsId}`).set('Authorization', `Bearer ${empToken}`)
    .send({ taskName: 'Sneaky edit' });
  check('employee cannot edit approved entry', r.status === 403, `-> ${r.status}`);

  const audit = (await db.query('SELECT COUNT(*)::int n FROM audit_logs')).rows[0].n;
  check('approval written to audit log', audit > 0, `-> ${audit} rows`);

  // ================================================== DELETE
  console.log('\nDELETE');
  r = await agent.post('/api/timesheets/create').set('Authorization', `Bearer ${empToken}`)
    .send({ date: yest, hours: 1, taskName: 'Draft to delete', category: 'Other' });
  const draftId = r.body.data?.id;

  r = await agent.delete(`/api/timesheets/${draftId}`).set('Authorization', `Bearer ${empToken}`);
  check('employee can delete own draft', r.status === 200, `-> ${r.status}`);

  r = await agent.delete(`/api/timesheets/${tsId}`).set('Authorization', `Bearer ${empToken}`);
  check('employee cannot delete approved entry', r.status === 403, `-> ${r.status}`);

  // ================================================== REPORTS
  console.log('\nREPORTS');
  r = await agent.get('/api/reports/dashboard').set('Authorization', `Bearer ${empToken}`);
  check('dashboard stats load', r.status === 200 && typeof r.body.data?.totalHours === 'number',
    `-> ${r.status} ${JSON.stringify(r.body).slice(0, 250)}`);

  r = await agent.get(`/api/reports/summary?startDate=${yest}&endDate=${today}&status=All`)
    .set('Authorization', `Bearer ${mgrToken}`);
  check('summary report loads', r.status === 200 && Array.isArray(r.body.data?.rows),
    `-> ${r.status} ${JSON.stringify(r.body).slice(0, 250)}`);

  r = await agent.get(`/api/reports/export?startDate=${yest}&endDate=${today}`)
    .set('Authorization', `Bearer ${mgrToken}`);
  check('CSV export returns csv', r.status === 200 && String(r.headers['content-type']).includes('csv'),
    `-> ${r.status} ${r.headers['content-type']}`);

  // ================================================== USERS
  console.log('\nUSER MANAGEMENT');
  r = await agent.get('/api/users').set('Authorization', `Bearer ${empToken}`);
  check('employee blocked from user list', r.status === 403, `-> ${r.status}`);

  r = await agent.get('/api/users').set('Authorization', `Bearer ${adminToken}`);
  check('admin can list users', r.status === 200 && r.body.data.length === 4, `-> ${r.status} ${r.body.data?.length}`);

  r = await agent.post('/api/users').set('Authorization', `Bearer ${adminToken}`)
    .send({ email: 'new@example.com', password: 'longenough1', fullName: 'New Person', role: 'employee' });
  check('admin creates user', r.status === 201, `-> ${r.status} ${JSON.stringify(r.body)}`);

  r = await agent.post('/api/users').set('Authorization', `Bearer ${adminToken}`)
    .send({ email: 'short@example.com', password: 'abc', fullName: 'Short Pass' });
  check('short password rejected', r.status === 400);

  r = await agent.post('/api/users').set('Authorization', `Bearer ${mgrToken}`)
    .send({ email: 'x@example.com', password: 'longenough1', fullName: 'X' });
  check('manager cannot create users', r.status === 403, `-> ${r.status}`);

  console.log(`\n${'='.repeat(46)}`);
  console.log(`  PASS ${pass}   FAIL ${fail}`);
  console.log('='.repeat(46));
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error('\nRUNNER CRASH:', e); process.exit(2); });
