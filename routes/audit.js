const express = require('express');
const router = express.Router();
const db = require('../src/db');

function requireAuth(req, res, next) {
  if (req.session && req.session.user) return next();
  const bpAuth = res.locals.basePath || '';
  const dest = `${bpAuth}/login`;
  const abs = `${req.protocol}://${req.get('host')}${dest}`;
  return res.redirect(abs);
}

router.get('/audit-log', requireAuth, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT a.id, a.created_at, a.action, a.details, a.ip, a.user_agent, u.username
       FROM audit_logs a
       LEFT JOIN users u ON u.id = a.user_id
       ORDER BY a.created_at DESC, a.id DESC
       LIMIT 200`
    );
    res.render('audit_log', { user: req.session.user || null, logs: rows });
  } catch (err) {
    console.error('Audit log view error:', err.message);
    res.status(500).render('audit_log', { user: req.session.user || null, logs: [], error: 'Unable to load audit log.' });
  }
});

module.exports = router;
