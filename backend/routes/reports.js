const express = require('express');
const db = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();

const isPrivileged = (user) => ['admin', 'manager'].includes(user.role);

/** Builds the employee scope clause so employees only ever see their own numbers. */
function scope(user, params, requestedEmployeeId) {
  if (!isPrivileged(user)) {
    params.push(user.id);
    return ` AND employee_id = $${params.length}`;
  }
  if (requestedEmployeeId) {
    params.push(requestedEmployeeId);
    return ` AND employee_id = $${params.length}`;
  }
  return '';
}

// GET /api/reports/dashboard — headline numbers + charts for the landing page
router.get('/dashboard', authenticate, async (req, res, next) => {
  try {
    const params = [];
    const scopeSql = scope(req.user, params);

    const monthStart = new Date();
    monthStart.setDate(1);
    const monthStartStr = monthStart.toISOString().split('T')[0];
    params.push(monthStartStr);
    const monthParam = `$${params.length}`;

    const [totals, daily, categories] = await Promise.all([
      db.query(
        `SELECT
           COALESCE(SUM(hours) FILTER (WHERE status = 'Approved'), 0) AS total_hours,
           COUNT(*)                                                    AS entry_count,
           COUNT(*) FILTER (WHERE status = 'Approved')                 AS approved_count,
           COUNT(*) FILTER (WHERE status = 'Submitted')                AS pending_count,
           COUNT(*) FILTER (WHERE status = 'Draft')                    AS draft_count,
           COUNT(*) FILTER (WHERE status = 'Rejected')                 AS rejected_count
         FROM timesheets WHERE date >= ${monthParam}${scopeSql}`,
        params
      ),
      db.query(
        `SELECT date, SUM(hours)::float AS hours
         FROM timesheets
         WHERE date >= CURRENT_DATE - INTERVAL '14 days'${scopeSql}
         GROUP BY date ORDER BY date`,
        params.slice(0, scopeSql ? 1 : 0)
      ),
      db.query(
        `SELECT category, SUM(hours)::float AS hours
         FROM timesheets
         WHERE date >= ${monthParam}${scopeSql}
         GROUP BY category ORDER BY hours DESC`,
        params
      ),
    ]);

    const t = totals.rows[0];
    res.json({
      success: true,
      data: {
        totalHours: Number(t.total_hours),
        entryCount: Number(t.entry_count),
        approvedCount: Number(t.approved_count),
        pendingCount: Number(t.pending_count),
        draftCount: Number(t.draft_count),
        rejectedCount: Number(t.rejected_count),
        dailyHours: daily.rows.map((r) => ({
          date: r.date instanceof Date ? r.date.toISOString().split('T')[0] : String(r.date).split('T')[0],
          hours: Number(r.hours),
        })),
        categoryBreakdown: categories.rows,
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/reports/summary — employee x category breakdown for a date range
router.get('/summary', authenticate, async (req, res, next) => {
  try {
    const { startDate, endDate, employeeId, status = 'Approved' } = req.query;
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate aur endDate dono chahiye' });
    }

    const params = [startDate, endDate];
    let sql = `SELECT employee_name, category,
                      SUM(hours)::float AS total_hours,
                      COUNT(*)::int     AS entry_count
               FROM timesheets
               WHERE date >= $1 AND date <= $2`;

    if (status !== 'All') {
      params.push(status);
      sql += ` AND status = $${params.length}`;
    }
    sql += scope(req.user, params, employeeId);
    sql += ' GROUP BY employee_name, category ORDER BY employee_name, total_hours DESC';

    const { rows } = await db.query(sql, params);

    const byEmployee = {};
    let grandTotal = 0;
    rows.forEach((r) => {
      byEmployee[r.employee_name] ??= { employee: r.employee_name, total: 0, categories: [] };
      byEmployee[r.employee_name].total += r.total_hours;
      byEmployee[r.employee_name].categories.push({ category: r.category, hours: r.total_hours, entries: r.entry_count });
      grandTotal += r.total_hours;
    });

    res.json({
      success: true,
      data: {
        rows,
        byEmployee: Object.values(byEmployee),
        grandTotal: Math.round(grandTotal * 100) / 100,
        range: { startDate, endDate },
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/reports/timeline — day-by-day log of what was done
router.get('/timeline', authenticate, async (req, res, next) => {
  try {
    const { startDate, endDate, employeeId } = req.query;
    const params = [startDate || '1900-01-01', endDate || '2999-12-31'];
    let sql = `SELECT date, employee_name, task_name, category, hours, status, description
               FROM timesheets WHERE date >= $1 AND date <= $2`;
    sql += scope(req.user, params, employeeId);
    sql += ' ORDER BY date DESC, employee_name';

    const { rows } = await db.query(sql, params);

    const byDate = {};
    rows.forEach((r) => {
      const key = r.date instanceof Date ? r.date.toISOString().split('T')[0] : r.date;
      byDate[key] ??= { date: key, totalHours: 0, entries: [] };
      byDate[key].totalHours += Number(r.hours);
      byDate[key].entries.push(r);
    });

    res.json({ success: true, data: Object.values(byDate) });
  } catch (err) {
    next(err);
  }
});

// GET /api/reports/export — CSV download
router.get('/export', authenticate, async (req, res, next) => {
  try {
    const { startDate, endDate, employeeId, status } = req.query;
    const params = [startDate || '1900-01-01', endDate || '2999-12-31'];
    let sql = `SELECT date, employee_name, task_name, category, start_time, end_time,
                      hours, status, description, approver_comment, created_at
               FROM timesheets WHERE date >= $1 AND date <= $2`;
    if (status && status !== 'All') {
      params.push(status);
      sql += ` AND status = $${params.length}`;
    }
    sql += scope(req.user, params, employeeId);
    sql += ' ORDER BY date DESC';

    const { rows } = await db.query(sql, params);

    const headers = ['Date', 'Employee', 'Task', 'Category', 'Start', 'End', 'Hours', 'Status', 'Description', 'Approver Comment', 'Created At'];
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [
      headers.join(','),
      ...rows.map((r) => [
        r.date instanceof Date ? r.date.toISOString().split('T')[0] : r.date,
        r.employee_name, r.task_name, r.category, r.start_time, r.end_time,
        r.hours, r.status, r.description, r.approver_comment, r.created_at,
      ].map(esc).join(',')),
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="timesheets-${Date.now()}.csv"`);
    res.send('﻿' + csv); // BOM so Excel reads UTF-8 correctly
  } catch (err) {
    next(err);
  }
});

module.exports = router;
