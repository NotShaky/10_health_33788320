const express = require('express');
const router = express.Router();
const db = require('../src/db');
const audit = require('../src/audit');
const { Readable } = require('stream');
const { sanitizeText } = require('../src/sanitize');

function requireAuth(req, res, next) {
  if (req.session && req.session.user) return next();
  const bpAuth = res.locals.basePath || '';
  const dest = `${bpAuth}/login`;
  const abs = `${req.protocol}://${req.get('host')}${dest}`;
  return res.redirect(abs);
}

router.get('/achievements', async (req, res) => {
  try {
    const user = req.session.user || null;
    if (!user) {
      audit.log(req, 'view_achievements', { loggedIn: false });
      return res.render('achievements', { achievements: [], query: '', user: null, message: 'Please log in to see your achievements.', trends: [] });
    }
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit || '25', 10)));
    const offset = (page - 1) * limit;
    const category = (req.query.category || '').trim();
    const metric = (req.query.metric || '').trim();
    const params = [user.id];
    let where = 'user_id = ?';
    if (category) { where += ' AND category = ?'; params.push(category); }
    if (metric) { where += ' AND metric = ?'; params.push(metric); }
    const [rows] = await db.query(
      `SELECT id, title, category, metric, amount, notes, created_at
       FROM achievements WHERE ${where}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM achievements WHERE ${where}`, params);
    let trends = [];
    let thisWeekCount = 0;
    const [trendRows] = await db.query(
      `SELECT YEAR(created_at) AS year, WEEK(created_at, 3) AS week, COUNT(*) AS count
       FROM achievements
       WHERE user_id = ? AND created_at >= NOW() - INTERVAL 8 WEEK
       GROUP BY YEAR(created_at), WEEK(created_at, 3)
       ORDER BY year DESC, week DESC`,
      [user.id]
    );
    trends = trendRows;
    const [wk] = await db.query(
      `SELECT COUNT(*) AS c
       FROM achievements
       WHERE user_id = ? AND YEARWEEK(created_at, 3) = YEARWEEK(NOW(), 3)`,
      [user.id]
    );
    thisWeekCount = wk[0]?.c || 0;
    audit.log(req, 'view_achievements', { loggedIn: true, count: rows.length, page, limit, thisWeekCount });
    res.render('achievements', { achievements: rows, query: '', user, page, limit, total, category, metric, trends, thisWeekCount });
  } catch (err) {
    console.error('DB error:', err.message);
    audit.log(req, 'view_achievements_error', { error: err.message });
    res.status(500).render('achievements', { achievements: [], query: '', error: 'Database connection error. Check your .env settings and ensure DB is created.', user: req.session.user || null, trends: [] });
  }
});

router.get('/achievements/search', async (req, res) => {
  try {
    const user = req.session.user || null;
    if (!user) {
      audit.log(req, 'search_achievements', { loggedIn: false });
      return res.render('achievements', { achievements: [], query: '', user: null, message: 'Please log in to search your achievements.' });
    }
    const q = sanitizeText((req.query.q || ''), { maxLen: 200 });
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit || '25', 10)));
    const offset = (page - 1) * limit;
    if (!q) {
      audit.log(req, 'search_achievements', { query: '', results: 0 });
      return res.render('achievements', { achievements: [], query: '', user, page, limit, total: 0 });
    }
    const like = `%${q}%`;
    const [rows] = await db.query(
      `SELECT id, title, category, metric, amount, notes, created_at
       FROM achievements
       WHERE user_id = ? AND (title LIKE ? OR category LIKE ? OR notes LIKE ?)
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [user.id, like, like, like, limit, offset]
    );
    const [[{ total }]] = await db.query(
      'SELECT COUNT(*) AS total FROM achievements WHERE user_id = ? AND (title LIKE ? OR category LIKE ? OR notes LIKE ?)',
      [user.id, like, like, like]
    );
    audit.log(req, 'search_achievements', { query: q, results: rows.length, page, limit });
    res.render('achievements', { achievements: rows, query: q, user, page, limit, total });
  } catch (err) {
    console.error('DB error:', err.message);
    audit.log(req, 'search_achievements_error', { error: err.message });
    res.status(500).render('achievements', { achievements: [], query: '', error: 'Database connection error. Check your .env settings and ensure DB is created.', user: req.session.user || null });
  }
});

router.get('/achievements/add', requireAuth, (req, res) => {
  audit.log(req, 'view_add_achievement');
  res.render('add_achievement', { error: null, user: req.session.user || null });
});

router.post('/achievements/add', requireAuth, async (req, res) => {
  try {
    const { title, category, metric, amount, notes } = req.body;
    const safeTitle = sanitizeText(title, { maxLen: 100 });
    const safeCategory = sanitizeText(category, { maxLen: 50 });
    const safeMetric = sanitizeText(metric, { maxLen: 20 });
    const safeNotes = sanitizeText(notes, { maxLen: 500 });
    if (!title || !category || !metric || !amount) {
      return res.status(400).render('add_achievement', { error: 'Please fill required fields.', user: req.session.user || null });
    }
    const amt = parseFloat(amount);
    if (Number.isNaN(amt)) {
      return res.status(400).render('add_achievement', { error: 'Amount must be a number.', user: req.session.user || null });
    }
    await db.query(
      'INSERT INTO achievements (user_id, title, category, metric, amount, notes) VALUES (?, ?, ?, ?, ?, ?)',
      [req.session.user.id, safeTitle, safeCategory, safeMetric, amt, safeNotes || null]
    );
    audit.log(req, 'add_achievement', { title: safeTitle, category: safeCategory, metric: safeMetric, amount: amt });
    const bp7 = res.locals.basePath || '';
    const dest = `${bp7}/achievements`;
    const abs = `${req.protocol}://${req.get('host')}${dest}`;
    res.redirect(abs);
  } catch (err) {
    console.error(err);
    audit.log(req, 'add_achievement_error', { error: err.message });
    res.status(500).render('add_achievement', { error: 'Server error. Please try again.', user: req.session.user || null });
  }
});

router.get('/achievements/export.csv', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const [rows] = await db.query(
      `SELECT id, title, category, metric, amount, notes, created_at
       FROM achievements WHERE user_id = ? ORDER BY created_at DESC`,
      [userId]
    );
    const header = 'id,title,category,metric,amount,notes,created_at\n';
    const lines = rows.map(r => {
      const esc = v => {
        if (v == null) return '';
        const s = String(v).replace(/"/g, '""');
        return `"${s}"`;
      };
      return [r.id, esc(r.title), esc(r.category), esc(r.metric), r.amount, esc(r.notes), new Date(r.created_at).toISOString()].join(',');
    });
    const csv = header + lines.join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="achievements.csv"');
    Readable.from(csv).pipe(res);
    audit.log(req, 'export_csv', { rows: rows.length });
  } catch (err) {
    console.error('CSV export error:', err.message);
    audit.log(req, 'export_csv_error', { error: err.message });
    res.status(500).send('Failed to export CSV');
  }
});

module.exports = router;
