const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');
const { validateTimesheet } = require('../middleware/validation');
const ocr = require('../services/ocr.service');

const router = express.Router();

// On serverless hosts (Vercel/Lambda) the bundle is read-only and only /tmp is writable,
// so default there instead of a path inside the deployment.
const IS_SERVERLESS = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const UPLOAD_DIR =
  process.env.UPLOAD_DIR || (IS_SERVERLESS ? '/tmp/uploads' : path.join(__dirname, '..', 'uploads'));

// Created on first use rather than at import time — a read-only FS would otherwise
// crash the whole function on cold start, before any request is handled.
let uploadDirReady = false;
function ensureUploadDir() {
  if (!uploadDirReady) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    uploadDirReady = true;
  }
}

const ALLOWED_EXT = ['.pdf', '.png', '.jpg', '.jpeg', '.webp', '.bmp', '.tiff', '.xlsx', '.xls', '.csv'];

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      try { ensureUploadDir(); cb(null, UPLOAD_DIR); }
      catch (err) { cb(err); }
    },
    filename: (req, file, cb) => {
      const safe = path.basename(file.originalname).replace(/[^\w.\-]/g, '_');
      cb(null, `${Date.now()}-${Math.round(Math.random() * 1e6)}-${safe}`);
    },
  }),
  limits: { fileSize: Number(process.env.MAX_FILE_SIZE) || 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXT.includes(ext)) {
      return cb(Object.assign(new Error(`Format ${ext} supported nahi hai`), { statusCode: 415 }));
    }
    cb(null, true);
  },
});

const isPrivileged = (user) => ['admin', 'manager'].includes(user.role);

/** Inserts one timesheet row, returning the created record. */
async function insertTimesheet(client, body, actor) {
  // An employee can only ever file against themselves; managers/admins may file for others.
  const employeeId = isPrivileged(actor) && body.employeeId ? body.employeeId : actor.id;
  const employeeName = isPrivileged(actor) && body.employeeName ? body.employeeName : actor.full_name;

  const { rows } = await client.query(
    `INSERT INTO timesheets
       (employee_id, employee_name, date, start_time, end_time, hours,
        task_name, category, description, status, file_path, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW(),NOW())
     RETURNING *`,
    [
      employeeId,
      employeeName,
      body.date,
      body.startTime || null,
      body.endTime || null,
      Number(body.hours),
      String(body.taskName).trim(),
      body.category,
      body.description || null,
      body.status === 'Submitted' ? 'Submitted' : 'Draft',
      body.filePath || null,
    ]
  );
  return rows[0];
}

// ----------------------------------------------------------------- CREATE

// POST /api/timesheets/create
router.post('/create', authenticate, async (req, res, next) => {
  try {
    const errors = validateTimesheet(req.body);
    if (errors.length) return res.status(400).json({ error: errors.join('; ') });

    const row = await insertTimesheet(db, req.body, req.user);
    res.status(201).json({ success: true, data: row });
  } catch (err) {
    next(err);
  }
});

// POST /api/timesheets/bulk — all-or-nothing so a partial OCR import never lands
router.post('/bulk', authenticate, async (req, res, next) => {
  const { rows: payload } = req.body;
  if (!Array.isArray(payload) || payload.length === 0) {
    return res.status(400).json({ error: 'rows array required' });
  }
  if (payload.length > 500) {
    return res.status(400).json({ error: 'Ek baar mein max 500 rows' });
  }

  const allErrors = payload.flatMap((r, i) => validateTimesheet(r, { index: i }));
  if (allErrors.length) {
    return res.status(400).json({ error: allErrors.slice(0, 20).join('; '), errorCount: allErrors.length });
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const created = [];
    for (const body of payload) {
      created.push(await insertTimesheet(client, body, req.user));
    }
    await client.query('COMMIT');
    res.status(201).json({ success: true, count: created.length, data: created });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

// ----------------------------------------------------------------- UPLOAD

// POST /api/timesheets/upload — scan a document, return rows for review (nothing saved yet)
router.post('/upload', authenticate, upload.single('file'), async (req, res, next) => {
  if (!req.file) return res.status(400).json({ error: 'File attach karein' });

  try {
    const result = await ocr.extract(req.file.path, {
      employeeName: req.body.employeeName || req.user.full_name,
    });

    await db.query(
      `INSERT INTO ocr_extractions (uploaded_by, file_name, file_path, extracted_data, row_count, source, status)
       VALUES ($1,$2,$3,$4,$5,$6,'pending')`,
      [req.user.id, req.file.originalname, req.file.filename,
       JSON.stringify({ rows: result.rows, confidence: result.confidence }),
       result.rows.length, result.source]
    );

    res.json({
      success: true,
      data: {
        rows: result.rows,
        confidence: result.confidence,
        rawText: result.rawText,
        source: result.source,
        fileName: req.file.filename,
      },
    });
  } catch (err) {
    // Scan failed — don't keep the orphan file around.
    fs.unlink(req.file.path, () => {});
    next(err);
  }
});

// ------------------------------------------------------------------- READ

// GET /api/timesheets
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { employeeId, status, category, startDate, endDate, limit } = req.query;
    const where = [];
    const params = [];
    const add = (sql, val) => { params.push(val); where.push(sql.replace('?', `$${params.length}`)); };

    // Employees are scoped to their own rows no matter what they ask for.
    if (!isPrivileged(req.user)) add('employee_id = ?', req.user.id);
    else if (employeeId) add('employee_id = ?', employeeId);

    if (status) add('status = ?', status);
    if (category) add('category = ?', category);
    if (startDate) add('date >= ?', startDate);
    if (endDate) add('date <= ?', endDate);

    let sql = 'SELECT * FROM timesheets';
    if (where.length) sql += ' WHERE ' + where.join(' AND ');
    sql += ' ORDER BY date DESC, id DESC';

    const lim = Math.min(Number(limit) || 500, 2000);
    params.push(lim);
    sql += ` LIMIT $${params.length}`;

    const { rows } = await db.query(sql, params);
    res.json({ success: true, count: rows.length, data: rows });
  } catch (err) {
    next(err);
  }
});

// GET /api/timesheets/:id
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const { rows } = await db.query('SELECT * FROM timesheets WHERE id = $1', [req.params.id]);
    const row = rows[0];
    if (!row) return res.status(404).json({ error: 'Timesheet nahi mili' });
    if (!isPrivileged(req.user) && row.employee_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    res.json({ success: true, data: row });
  } catch (err) {
    next(err);
  }
});

// ----------------------------------------------------------------- UPDATE

// PUT /api/timesheets/:id
router.put('/:id', authenticate, async (req, res, next) => {
  try {
    const { rows: existing } = await db.query('SELECT * FROM timesheets WHERE id = $1', [req.params.id]);
    const row = existing[0];
    if (!row) return res.status(404).json({ error: 'Timesheet nahi mili' });

    const privileged = isPrivileged(req.user);
    const owner = row.employee_id === req.user.id;
    if (!privileged && !owner) return res.status(403).json({ error: 'Access denied' });

    // An employee can only edit their own Draft/Rejected rows — approved history is immutable.
    if (!privileged && !['Draft', 'Rejected'].includes(row.status)) {
      return res.status(403).json({ error: `${row.status} entry edit nahi kar sakte` });
    }

    const { status, approverComment } = req.body;
    // Only managers/admins may move a row to Approved/Rejected.
    if (status && ['Approved', 'Rejected'].includes(status) && !privileged) {
      return res.status(403).json({ error: 'Approve/reject sirf manager kar sakta hai' });
    }

    const merged = {
      date: req.body.date ?? row.date,
      taskName: req.body.taskName ?? row.task_name,
      category: req.body.category ?? row.category,
      hours: req.body.hours ?? row.hours,
      startTime: req.body.startTime ?? row.start_time,
      endTime: req.body.endTime ?? row.end_time,
      status: status ?? row.status,
    };
    const errors = validateTimesheet(merged);
    if (errors.length) return res.status(400).json({ error: errors.join('; ') });

    const { rows: updated } = await db.query(
      `UPDATE timesheets SET
         date = $1, task_name = $2, category = $3, hours = $4,
         start_time = $5, end_time = $6, description = $7, status = $8,
         approver_id = $9, approver_comment = $10, updated_at = NOW()
       WHERE id = $11 RETURNING *`,
      [
        merged.date, merged.taskName, merged.category, Number(merged.hours),
        merged.startTime || null, merged.endTime || null,
        req.body.description ?? row.description,
        merged.status,
        ['Approved', 'Rejected'].includes(merged.status) ? req.user.id : row.approver_id,
        approverComment ?? row.approver_comment,
        req.params.id,
      ]
    );

    await db.query(
      `INSERT INTO audit_logs (user_id, action, table_name, record_id, old_data, new_data)
       VALUES ($1,'update','timesheets',$2,$3,$4)`,
      [req.user.id, req.params.id, JSON.stringify(row), JSON.stringify(updated[0])]
    );

    res.json({ success: true, data: updated[0] });
  } catch (err) {
    next(err);
  }
});

// ----------------------------------------------------------------- DELETE

// DELETE /api/timesheets/:id
router.delete('/:id', authenticate, async (req, res, next) => {
  try {
    const { rows: existing } = await db.query('SELECT * FROM timesheets WHERE id = $1', [req.params.id]);
    const row = existing[0];
    if (!row) return res.status(404).json({ error: 'Timesheet nahi mili' });

    const privileged = isPrivileged(req.user);
    if (!privileged && row.employee_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    if (!privileged && row.status !== 'Draft') {
      return res.status(403).json({ error: 'Sirf Draft entry delete kar sakte hain' });
    }

    await db.query('DELETE FROM timesheets WHERE id = $1', [req.params.id]);
    await db.query(
      `INSERT INTO audit_logs (user_id, action, table_name, record_id, old_data)
       VALUES ($1,'delete','timesheets',$2,$3)`,
      [req.user.id, req.params.id, JSON.stringify(row)]
    );

    res.json({ success: true, message: 'Delete ho gaya' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
