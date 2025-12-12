const express = require('express');
const router = express.Router();
const db = require('../src/db');
const audit = require('../src/audit');

function requireAuth(req, res, next) {
  if (req.session && req.session.user) return next();
  const bpAuth = res.locals.basePath || '';
  const dest = `${bpAuth}/login`;
  const abs = `${req.protocol}://${req.get('host')}${dest}`;
  return res.redirect(abs);
}

router.get('/tools/period', (req, res) => res.redirect(301, `${res.locals.basePath}/period`));

router.get('/period', requireAuth, async (req, res) => {
  audit.log(req, 'view_period');
  try {
    const userId = req.session.user.id;
    const [rows] = await db.query(
      'SELECT id, start_date, cycle_length FROM period_logs WHERE user_id = ? ORDER BY start_date DESC LIMIT 12',
      [userId]
    );
    let nextWindow = null;
    if (rows && rows.length) {
      const latest = rows[0];
      const start = new Date(latest.start_date);
      const cycle = latest.cycle_length || 28;
      const nextStart = new Date(start);
      nextStart.setDate(nextStart.getDate() + cycle);
      const nextEnd = new Date(nextStart);
      nextEnd.setDate(nextEnd.getDate() + 5);
      nextWindow = { start: nextStart.toISOString().slice(0,10), end: nextEnd.toISOString().slice(0,10), cycle };
    }
    const qYear = parseInt((req.query.year || '').trim(), 10);
    const qMonth = parseInt((req.query.month || '').trim(), 10);
    const now = new Date();
    const calYear = Number.isInteger(qYear) ? qYear : now.getFullYear();
    const calMonth = Number.isInteger(qMonth) && qMonth >= 0 && qMonth <= 11 ? qMonth : now.getMonth();
    res.render('period', { user: req.session.user || null, logs: rows, error: null, form: { start_date: '', cycle_length: 28 }, nextWindow, calYear, calMonth });
  } catch (err) {
    console.error('Period view error:', err);
    const now = new Date();
    res.status(500).render('period', { user: req.session.user || null, logs: [], error: 'Unable to load period logs.', form: { start_date: '', cycle_length: 28 }, nextWindow: null, calYear: now.getFullYear(), calMonth: now.getMonth() });
  }
});

router.post('/period', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const startDate = (req.body.start_date || '').trim();
    const cycleLen = parseInt((req.body.cycle_length || '28').trim(), 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
      audit.log(req, 'period_failed', { reason: 'bad_date' });
      return res.status(400).render('period', { user: req.session.user || null, logs: [], error: 'Enter a valid start date (YYYY-MM-DD).', form: { start_date: startDate, cycle_length: cycleLen || 28 }, nextWindow: null });
    }
    if (Number.isNaN(cycleLen) || cycleLen < 20 || cycleLen > 60) {
      audit.log(req, 'period_failed', { reason: 'bad_cycle' });
      return res.status(400).render('period', { user: req.session.user || null, logs: [], error: 'Cycle length must be between 20 and 60 days.', form: { start_date: startDate, cycle_length: cycleLen || 28 }, nextWindow: null });
    }
    await db.query('INSERT INTO period_logs (user_id, start_date, cycle_length) VALUES (?, ?, ?)', [userId, startDate, cycleLen]);
    audit.log(req, 'period_add', { start_date: startDate, cycle_length: cycleLen });
    const bpPeriod = res.locals.basePath || '';
    const dest = `${bpPeriod}/period`;
    const abs = `${req.protocol}://${req.get('host')}${dest}`;
    res.redirect(abs);
  } catch (err) {
    console.error('Period add error:', err);
    audit.log(req, 'period_error', { error: err.message });
    res.status(500).render('period', { user: req.session.user || null, logs: [], error: 'Server error. Please try again.', form: { start_date: (req.body.start_date||'').trim(), cycle_length: parseInt((req.body.cycle_length||'28').trim(),10) || 28 }, nextWindow: null });
  }
});

module.exports = router;
