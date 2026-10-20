const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { generateToken, authenticate } = require('../middleware/auth');
const { validateLogin } = require('../middleware/validation');

const router = express.Router();

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const errors = validateLogin(req.body);
    if (errors.length) return res.status(400).json({ error: errors.join('; ') });

    const { email, password } = req.body;
    const { rows } = await db.query(
      'SELECT id, email, password, full_name, role, department, is_active FROM users WHERE LOWER(email) = LOWER($1)',
      [email]
    );

    const user = rows[0];
    // Same message for unknown user and wrong password — don't leak which emails exist.
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Email ya password galat hai' });
    }
    if (!user.is_active) {
      return res.status(403).json({ error: 'Account deactivated hai. Admin se baat karein.' });
    }

    delete user.password;
    res.json({ success: true, token: generateToken(user), user });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/validate
router.get('/validate', authenticate, async (req, res, next) => {
  try {
    const { rows } = await db.query(
      'SELECT id, email, full_name, role, department, is_active FROM users WHERE id = $1',
      [req.user.id]
    );
    if (!rows[0] || !rows[0].is_active) {
      return res.status(401).json({ error: 'User no longer active' });
    }
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/change-password
router.post('/change-password', authenticate, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ error: 'New password kam se kam 8 characters ka ho' });
    }

    const { rows } = await db.query('SELECT password FROM users WHERE id = $1', [req.user.id]);
    if (!rows[0] || !(await bcrypt.compare(currentPassword || '', rows[0].password))) {
      return res.status(401).json({ error: 'Current password galat hai' });
    }

    const hash = await bcrypt.hash(newPassword, 10);
    await db.query('UPDATE users SET password = $1, updated_at = NOW() WHERE id = $2', [hash, req.user.id]);
    res.json({ success: true, message: 'Password update ho gaya' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
