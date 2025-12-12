const express = require('express');
const router = express.Router();
const db = require('../src/db');
const audit = require('../src/audit');
const { sanitizeText } = require('../src/sanitize');

const rateLimits = new Map();
function rateLimit({ windowMs = 60_000, max = 20 }) {
  return (req, res, next) => {
    const key = `${req.ip}:${req.path}`;
    const now = Date.now();
    const entry = rateLimits.get(key) || { count: 0, reset: now + windowMs };
    if (now > entry.reset) { entry.count = 0; entry.reset = now + windowMs; }
    entry.count += 1;
    rateLimits.set(key, entry);
    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, max - entry.count)));
    res.setHeader('X-RateLimit-Reset', String(entry.reset));
    if (entry.count > max) {
      audit.log(req, 'rate_limit_block', { path: req.path });
      return res.status(429).json({ error: 'Too many requests' });
    }
    next();
  };
}

function requireAuth(req, res, next) {
  if (req.session && req.session.user) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}

router.get('/api/achievements', requireAuth, async (req, res) => {
  try {
    const user = req.session.user;
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
    res.json({ page, limit, total, items: rows });
  } catch (err) {
    console.error('API get achievements error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/api/achievements', rateLimit({ windowMs: 60_000, max: 20 }), requireAuth, async (req, res) => {
  try {
    const { title, category, metric, amount, notes } = req.body || {};
    const safeTitle = sanitizeText(title, { maxLen: 100 });
    const safeCategory = sanitizeText(category, { maxLen: 50 });
    const safeMetric = sanitizeText(metric, { maxLen: 20 });
    const safeNotes = sanitizeText(notes, { maxLen: 500 });
    const errs = [];
    if (!safeTitle || safeTitle.length > 100) errs.push('title is required and must be <=100 chars');
    if (!safeCategory || safeCategory.length > 50) errs.push('category is required and must be <=50 chars');
    if (!safeMetric || safeMetric.length > 20) errs.push('metric is required and must be <=20 chars');
    const amt = parseFloat(amount);
    if (Number.isNaN(amt)) errs.push('amount must be a number');
    if (errs.length) return res.status(400).json({ errors: errs });
    await db.query(
      'INSERT INTO achievements (user_id, title, category, metric, amount, notes) VALUES (?, ?, ?, ?, ?, ?)',
      [req.session.user.id, safeTitle, safeCategory, safeMetric, amt, safeNotes || null]
    );
    audit.log(req, 'api_add_achievement', { title: safeTitle, category: safeCategory, metric: safeMetric, amount: amt });
    res.status(201).json({ ok: true });
  } catch (err) {
    console.error('API add achievement error:', err.message);
    audit.log(req, 'api_add_achievement_error', { error: err.message });
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/api/trends/weekly', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const [rows] = await db.query(
      `SELECT YEARWEEK(created_at, 3) AS yw, COUNT(*) AS count
       FROM achievements
       WHERE user_id = ? AND created_at >= NOW() - INTERVAL 8 WEEK
       GROUP BY YEARWEEK(created_at, 3)
       ORDER BY yw DESC`,
      [userId]
    );
    const now = new Date();
    const result = [];
    const byYW = new Map(rows.map(r => [String(r.yw), r.count]));
    for (let i = 0; i < 8; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() - i * 7);
      const year = d.getUTCFullYear();
      const tmp = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
      const dayNum = (tmp.getUTCDay() + 6) % 7;
      tmp.setUTCDate(tmp.getUTCDate() - dayNum + 3);
      const firstThursday = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 4));
      const week = 1 + Math.round(((tmp.getTime() - firstThursday.getTime()) / 86400000 - 3) / 7);
      const key = `${year}${String(week).padStart(2, '0')}`;
      result.unshift({ year, week, count: byYW.get(key) || 0 });
    }
    res.json({ items: result });
  } catch (err) {
    console.error('Weekly trends error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
