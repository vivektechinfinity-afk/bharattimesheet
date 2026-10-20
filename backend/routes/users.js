const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();

const ROLES = ['employee', 'manager', 'admin'];

// GET /api/users — managers need the list to filter reports; admins manage it
router.get('/', authenticate, requireRole('admin', 'manager'), async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT u.id, u.username, u.email, u.full_name, u.role, u.department, u.is_active, u.created_at,
              COALESCE(SUM(t.hours) FILTER (WHERE t.status = 'Approved'), 0)::float AS approved_hours,
              COUNT(t.id)::int AS entry_count
       FROM users u
       LEFT JOIN timesheets t ON t.employee_id = u.id
       GROUP BY u.id ORDER BY u.full_name`
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
});

// POST /api/users
router.post('/', authenticate, requireRole('admin'), async (req, res, next) => {
  try {
    const { username, email, password, fullName, role = 'employee', department } = req.body;

    if (!email || !/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Valid email chahiye' });
    if (!password || password.length < 8) return res.status(400).json({ error: 'Password kam se kam 8 characters ka ho' });
    if (!fullName?.trim()) return res.status(400).json({ error: 'Full name chahiye' });
    if (!ROLES.includes(role)) return res.status(400).json({ error: `Role must be: ${ROLES.join(', ')}` });

    const hash = await bcrypt.hash(password, 10);
    const { rows } = await db.query(
      `INSERT INTO users (username, email, password, full_name, role, department)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING id, username, email, full_name, role, department, is_active, created_at`,
      [username || email.split('@')[0], email.toLowerCase(), hash, fullName.trim(), role, department || null]
    );
    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Ye email ya username pehle se registered hai' });
    next(err);
  }
});

// PUT /api/users/:id
router.put('/:id', authenticate, requireRole('admin'), async (req, res, next) => {
  try {
    const { fullName, role, department, isActive, password } = req.body;
    if (role && !ROLES.includes(role)) return res.status(400).json({ error: `Role must be: ${ROLES.join(', ')}` });

    // Guard: don't let the last active admin demote or deactivate themselves out of the system.
    if (String(req.params.id) === String(req.user.id) && (role === 'employee' || role === 'manager' || isActive === false)) {
      const { rows } = await db.query(`SELECT COUNT(*)::int AS n FROM users WHERE role = 'admin' AND is_active = true`);
      if (rows[0].n <= 1) return res.status(400).json({ error: 'Aap akele admin hain — apna role/status nahi badal sakte' });
    }

    const fields = [];
    const params = [];
    const set = (col, val) => { params.push(val); fields.push(`${col} = $${params.length}`); };

    if (fullName !== undefined) set('full_name', fullName);
    if (role !== undefined) set('role', role);
    if (department !== undefined) set('department', department);
    if (isActive !== undefined) set('is_active', isActive);
    if (password) {
      if (password.length < 8) return res.status(400).json({ error: 'Password kam se kam 8 characters ka ho' });
      set('password', await bcrypt.hash(password, 10));
    }
    if (!fields.length) return res.status(400).json({ error: 'Kuch update karne ko nahi hai' });

    params.push(req.params.id);
    const { rows } = await db.query(
      `UPDATE users SET ${fields.join(', ')}, updated_at = NOW()
       WHERE id = $${params.length}
       RETURNING id, username, email, full_name, role, department, is_active`,
      params
    );
    if (!rows[0]) return res.status(404).json({ error: 'User nahi mila' });
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/users/:id — soft delete, so their timesheet history survives
router.delete('/:id', authenticate, requireRole('admin'), async (req, res, next) => {
  try {
    if (String(req.params.id) === String(req.user.id)) {
      return res.status(400).json({ error: 'Apna account khud deactivate nahi kar sakte' });
    }
    const { rows } = await db.query(
      'UPDATE users SET is_active = false, updated_at = NOW() WHERE id = $1 RETURNING id, full_name',
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'User nahi mila' });
    res.json({ success: true, message: `${rows[0].full_name} deactivate ho gaya` });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
