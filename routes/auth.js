const express = require('express');
const bcrypt = require('bcrypt');
const router = express.Router();
const db = require('../src/db');
const audit = require('../src/audit');
const { sanitizeText } = require('../src/sanitize');

const rateLimits = new Map();
function rateLimit({ windowMs = 60_000, max = 10 }) {
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

function isValidPassword(pw) {
  if (!pw || pw.length < 8) return false;
  const hasLower = /[a-z]/.test(pw);
  const hasUpper = /[A-Z]/.test(pw);
  const hasDigit = /\d/.test(pw);
  const hasSpecial = /[^A-Za-z0-9]/.test(pw);
  return hasLower && hasUpper && hasDigit && hasSpecial;
}

router.get('/register', (req, res) => {
  if (req.session.user) {
    const bp2 = res.locals.basePath || '';
    return res.redirect(`${bp2}/`);
  }
  audit.log(req, 'view_register');
  res.render('register', { error: null, user: null });
});

router.post('/register', rateLimit({ windowMs: 60_000, max: 5 }), async (req, res) => {
  try {
    if (req.session.user) {
      const bp3 = res.locals.basePath || '';
      return res.redirect(`${bp3}/`);
    }
    const { username, password, confirm } = req.body;
    const safeUsername = sanitizeText(username, { maxLen: 50 });
    if (!username || !password || !confirm) {
      audit.log(req, 'register_failed', { reason: 'missing_fields' });
      return res.status(400).render('register', { error: 'Please complete all fields.', user: null });
    }
    if (password !== confirm) {
      audit.log(req, 'register_failed', { reason: 'password_mismatch' });
      return res.status(400).render('register', { error: 'Passwords do not match.', user: null });
    }
    if (!isValidPassword(password)) {
      audit.log(req, 'register_failed', { reason: 'password_policy' });
      return res.status(400).render('register', { error: 'Password must be at least 8 chars and include lowercase, uppercase, number and special character.', user: null });
    }
    const [exists] = await db.query('SELECT id FROM users WHERE username = ? LIMIT 1', [safeUsername]);
    if (exists && exists.length) {
      audit.log(req, 'register_failed', { reason: 'username_exists', username: safeUsername });
      return res.status(409).render('register', { error: 'Username already exists.', user: null });
    }
    const hash = await bcrypt.hash(password, 10);
    await db.query('INSERT INTO users (username, password_hash) VALUES (?, ?)', [safeUsername, hash]);
    audit.log(req, 'register_success', { username: safeUsername });
    const bpReg = res.locals.basePath || '';
    const dest = `${bpReg}/login`;
    const abs = `${req.protocol}://${req.get('host')}${dest}`;
    return res.redirect(abs);
  } catch (err) {
    console.error('Register error:', err.message);
    audit.log(req, 'register_failed', { reason: 'server_error', error: err.message });
    return res.status(500).render('register', { error: 'Server error. Please try again.', user: null });
  }
});

router.get('/login', (req, res) => {
  audit.log(req, 'view_login');
  res.render('login', { error: null });
});

router.post('/login', rateLimit({ windowMs: 60_000, max: 10 }), async (req, res) => {
  try {
    const { username, password } = req.body;
    const safeUsername = sanitizeText(username, { maxLen: 50 });
    if (!username || !password) {
      audit.log(req, 'login_failed', { reason: 'missing_fields' });
      return res.status(400).render('login', { error: 'Please provide username and password.' });
    }
    const [rows] = await db.query('SELECT id, username, password_hash FROM users WHERE username = ? ORDER BY id DESC', [safeUsername]);
    if (!rows || rows.length === 0) {
      audit.log(req, 'login_failed', { reason: 'no_such_user', username: safeUsername });
      return res.status(401).render('login', { error: 'Invalid credentials' });
    }
    const userRow = rows[0];
    const ok = await bcrypt.compare(password, userRow.password_hash);
    if (!ok) {
      audit.log(req, 'login_failed', { reason: 'bad_password', username: safeUsername });
      return res.status(401).render('login', { error: 'Invalid credentials' });
    }
    req.session.user = { id: userRow.id, username: userRow.username };
    audit.log(req, 'login_success', { username: safeUsername });
    const bpLogin = res.locals.basePath || '';
    const dest = `${bpLogin}/`;
    const abs = `${req.protocol}://${req.get('host')}${dest}`;
    return res.redirect(abs);
  } catch (err) {
    console.error('Login error:', err.message);
    audit.log(req, 'login_failed', { reason: 'server_error', error: err.message });
    return res.status(500).render('login', { error: 'Server error. Please try again.' });
  }
});

router.post('/logout', (req, res) => {
  audit.log(req, 'logout');
  req.session.destroy(() => {
    const bp6 = res.locals.basePath || '';
    const dest = `${bp6}/`;
    const abs = `${req.protocol}://${req.get('host')}${dest}`;
    res.redirect(abs);
  });
});

module.exports = router;
