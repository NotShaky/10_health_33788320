require('dotenv').config();
const express = require('express');
const path = require('path');
const session = require('express-session');
const morgan = require('morgan');
const db = require('./src/db');
const audit = require('./src/audit');
const bcrypt = require('bcrypt');
const { Readable } = require('stream');
const { sanitizeText } = require('./src/sanitize');
const https = require('https');

// Simple in-memory rate limiter per IP + route
const rateLimits = new Map();
function rateLimit({ windowMs = 60_000, max = 10 }) {
  return (req, res, next) => {
    const key = `${req.ip}:${req.path}`;
    const now = Date.now();
    const entry = rateLimits.get(key) || { count: 0, reset: now + windowMs };
    if (now > entry.reset) {
      entry.count = 0;
      entry.reset = now + windowMs;
    }
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

// sanitizeText imported from ./src/sanitize

const app = express();
const PORT = 8000;

// Middleware
app.use(morgan('dev'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'change_this_secret',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 }
  })
);

// Simple auth middleware for optional login
function requireAuth(req, res, next) {
  if (req.session && req.session.user) return next();
  return res.redirect('/login');
}

// Routes
app.get('/', async (req, res) => {
  audit.log(req, 'view_home');
  res.render('home', { user: req.session.user || null });
});

app.get('/about', (req, res) => {
  audit.log(req, 'view_about');
  res.render('about', { user: req.session.user || null });
});

// Fitness tools
app.get('/tools', (req, res) => {
  audit.log(req, 'view_tools');
  res.render('tools', { user: req.session.user || null });
});

app.get('/tools/bmi', (req, res) => {
  audit.log(req, 'view_bmi');
  res.render('bmi', { user: req.session.user || null, result: null, error: null, height: '', weight: '', unit: 'metric' });
});

app.post('/tools/bmi', (req, res) => {
  try {
    const heightStr = sanitizeText(req.body.height || '', { maxLen: 10 });
    const weightStr = sanitizeText(req.body.weight || '', { maxLen: 10 });
    const unit = sanitizeText(req.body.unit || 'metric', { maxLen: 10 }).toLowerCase();
    let h = parseFloat(heightStr);
    let w = parseFloat(weightStr);
    if (Number.isNaN(h) || Number.isNaN(w) || h <= 0 || w <= 0) {
      audit.log(req, 'bmi_calc_failed', { height: heightStr, weight: weightStr });
      const errMsg = unit === 'imperial' ? 'Please enter valid positive numbers for height (in) and weight (lb).' : 'Please enter valid positive numbers for height (m) and weight (kg).';
      return res.status(400).render('bmi', { user: req.session.user || null, result: null, error: errMsg, height: heightStr, weight: weightStr, unit });
    }
    // Convert imperial to metric for calculation if needed
    if (unit === 'imperial') {
      // height in inches -> meters; weight in pounds -> kg
      h = h * 0.0254;
      w = w * 0.45359237;
    }
    const bmi = w / (h * h);
    let category = 'Normal';
    if (bmi < 18.5) category = 'Underweight';
    else if (bmi < 25) category = 'Normal';
    else if (bmi < 30) category = 'Overweight';
    else category = 'Obese';
    const result = { bmi: Number(bmi.toFixed(2)), category };
    audit.log(req, 'bmi_calc_success', { bmi: result.bmi, category });
    res.render('bmi', { user: req.session.user || null, result, error: null, height: heightStr, weight: weightStr, unit });
  } catch (err) {
    console.error('BMI error:', err.message);
    audit.log(req, 'bmi_calc_error', { error: err.message });
    res.status(500).render('bmi', { user: req.session.user || null, result: null, error: 'Server error. Please try again.', height: '', weight: '', unit: 'metric' });
  }
});

// BMR & TDEE (Mifflin-St Jeor)
app.get('/tools/bmr', (req, res) => {
  audit.log(req, 'view_bmr');
  res.render('bmr', { user: req.session.user || null, result: null, error: null, form: { sex: 'male', age: '', height: '', weight: '', activity: 'moderate' } });
});

app.post('/tools/bmr', (req, res) => {
  try {
    const sex = sanitizeText(req.body.sex || 'male', { maxLen: 10 }).toLowerCase();
    const age = parseInt((req.body.age || '').trim(), 10);
    const height = parseFloat((req.body.height || '').trim());
    const weight = parseFloat((req.body.weight || '').trim());
    const activity = sanitizeText(req.body.activity || 'moderate', { maxLen: 20 }).toLowerCase();
    if (!['male','female'].includes(sex) || Number.isNaN(age) || Number.isNaN(height) || Number.isNaN(weight) || age <= 0 || height <= 0 || weight <= 0) {
      audit.log(req, 'bmr_failed');
      return res.status(400).render('bmr', { user: req.session.user || null, result: null, error: 'Please enter valid values.', form: { sex, age: req.body.age || '', height: req.body.height || '', weight: req.body.weight || '', activity } });
    }
    // Mifflin-St Jeor (metric: cm, kg)
    const hCm = height; // expect cm input
    const bmr = sex === 'male' ? (10 * weight + 6.25 * hCm - 5 * age + 5) : (10 * weight + 6.25 * hCm - 5 * age - 161);
    const factors = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, very: 1.9 };
    const factor = factors[activity] || factors.moderate;
    const tdee = Math.round(bmr * factor);
    const result = { bmr: Math.round(bmr), tdee, activity };
    audit.log(req, 'bmr_success', result);
    res.render('bmr', { user: req.session.user || null, result, error: null, form: { sex, age, height: hCm, weight, activity } });
  } catch (err) {
    console.error('BMR error:', err.message);
    audit.log(req, 'bmr_error', { error: err.message });
    res.status(500).render('bmr', { user: req.session.user || null, result: null, error: 'Server error.', form: { sex: 'male', age: '', height: '', weight: '', activity: 'moderate' } });
  }
});

// Heart rate zones
app.get('/tools/hr', (req, res) => {
  audit.log(req, 'view_hr');
  res.render('hr', { user: req.session.user || null, result: null, error: null, age: '' });
});

app.post('/tools/hr', (req, res) => {
  const age = parseInt((req.body.age || '').trim(), 10);
  if (Number.isNaN(age) || age <= 0) {
    audit.log(req, 'hr_failed');
    return res.status(400).render('hr', { user: req.session.user || null, result: null, error: 'Please enter a valid age.', age: req.body.age || '' });
  }
  const max = 220 - age;
  const zones = [
    { name: 'Zone 1 (50–60%)', min: Math.round(max * 0.5), max: Math.round(max * 0.6) },
    { name: 'Zone 2 (60–70%)', min: Math.round(max * 0.6), max: Math.round(max * 0.7) },
    { name: 'Zone 3 (70–80%)', min: Math.round(max * 0.7), max: Math.round(max * 0.8) },
    { name: 'Zone 4 (80–90%)', min: Math.round(max * 0.8), max: Math.round(max * 0.9) },
    { name: 'Zone 5 (90–100%)', min: Math.round(max * 0.9), max: Math.round(max * 1.0) },
  ];
  audit.log(req, 'hr_success', { max });
  res.render('hr', { user: req.session.user || null, result: { max, zones }, error: null, age });
});

// Macro calculator
app.get('/tools/macros', (req, res) => {
  audit.log(req, 'view_macros');
  res.render('macros', { user: req.session.user || null, result: null, error: null, form: { calories: '', goal: 'maintain' } });
});

app.post('/tools/macros', (req, res) => {
  const calories = parseInt((req.body.calories || '').trim(), 10);
  const goal = (req.body.goal || 'maintain').toLowerCase();
  if (Number.isNaN(calories) || calories <= 0) {
    audit.log(req, 'macros_failed');
    return res.status(400).render('macros', { user: req.session.user || null, result: null, error: 'Enter valid daily calories.', form: { calories: req.body.calories || '', goal } });
  }
  const adj = goal === 'cut' ? -0.15 : goal === 'bulk' ? 0.15 : 0;
  const target = Math.round(calories * (1 + adj));
  // Macro split: 30% protein, 40% carbs, 30% fat
  const proteinCals = Math.round(target * 0.30), carbsCals = Math.round(target * 0.40), fatCals = Math.round(target * 0.30);
  const result = {
    calories: target,
    protein_g: Math.round(proteinCals / 4),
    carbs_g: Math.round(carbsCals / 4),
    fat_g: Math.round(fatCals / 9)
  };
  audit.log(req, 'macros_success', result);
  res.render('macros', { user: req.session.user || null, result, error: null, form: { calories, goal } });
});

// Audit page: per-user activity summary
// Registration
app.get('/register', (req, res) => {
  if (req.session.user) return res.redirect('/');
  audit.log(req, 'view_register');
  res.render('register', { error: null, user: null });
});

function isValidPassword(pw) {
  // >=8 chars, at least one lowercase, one uppercase, one number, one special
  if (!pw || pw.length < 8) return false;
  const hasLower = /[a-z]/.test(pw);
  const hasUpper = /[A-Z]/.test(pw);
  const hasDigit = /\d/.test(pw);
  const hasSpecial = /[^A-Za-z0-9]/.test(pw);
  return hasLower && hasUpper && hasDigit && hasSpecial;
}

app.post('/register', rateLimit({ windowMs: 60_000, max: 5 }), async (req, res) => {
  try {
    if (req.session.user) return res.redirect('/');
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
    return res.redirect('/login');
  } catch (err) {
    console.error('Register error:', err.message);
    audit.log(req, 'register_failed', { reason: 'server_error', error: err.message });
    return res.status(500).render('register', { error: 'Server error. Please try again.', user: null });
  }
});
// Status route: DB connectivity and user check
app.get('/status', async (req, res) => {
  const result = { db: { connected: false }, userGold: { exists: false } };
  try {
    const [ping] = await db.query('SELECT 1 AS ok');
    result.db.connected = !!(ping && ping.length);
    const [u] = await db.query('SELECT username FROM users WHERE username = ? LIMIT 1', ['gold']);
    result.userGold.exists = !!(u && u.length);
    res.json(result);
  } catch (err) {
    result.db.error = err.message;
    res.status(500).json(result);
  }
});

// CSV export of achievements for current user
app.get('/achievements/export.csv', requireAuth, async (req, res) => {
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

// JSON API: GET achievements (paginated)
app.get('/api/achievements', requireAuth, async (req, res) => {
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

// JSON API: POST achievement (validation)
app.post('/api/achievements', rateLimit({ windowMs: 60_000, max: 20 }), requireAuth, async (req, res) => {
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
// Login
app.get('/login', (req, res) => {
  audit.log(req, 'view_login');
  res.render('login', { error: null });
});

app.post('/login', rateLimit({ windowMs: 60_000, max: 10 }), async (req, res) => {
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
    return res.redirect('/');
  } catch (err) {
    console.error('Login error:', err.message);
    audit.log(req, 'login_failed', { reason: 'server_error', error: err.message });
    return res.status(500).render('login', { error: 'Server error. Please try again.' });
  }
});

app.post('/logout', (req, res) => {
  audit.log(req, 'logout');
  req.session.destroy(() => {
    res.redirect('/');
  });
});

// Health achievements: add + search
app.get('/achievements', async (req, res) => {
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
    const [trendRows] = await db.query(
      `SELECT YEARWEEK(created_at, 3) AS yw, COUNT(*) AS count
       FROM achievements
       WHERE user_id = ? AND created_at >= DATE_SUB(CURDATE(), INTERVAL 56 DAY)
       GROUP BY YEARWEEK(created_at, 3)
       ORDER BY yw DESC`,
      [user.id]
    );
    const now = new Date();
    const trends = [];
    const byYW = new Map(trendRows.map(r => [String(r.yw), r.count]));
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
      trends.unshift({ year, week, count: byYW.get(key) || 0 });
    }
    audit.log(req, 'view_achievements', { loggedIn: true, count: rows.length, page, limit });
    res.render('achievements', { achievements: rows, query: '', user, page, limit, total, category, metric, trends });
  } catch (err) {
    console.error('DB error:', err.message);
    audit.log(req, 'view_achievements_error', { error: err.message });
    res.status(500).render('achievements', { achievements: [], query: '', error: 'Database connection error. Check your .env settings and ensure DB is created.', user: req.session.user || null, trends: [] });
  }
});

app.get('/achievements/search', async (req, res) => {
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

app.get('/achievements/add', requireAuth, (req, res) => {
  audit.log(req, 'view_add_achievement');
  res.render('add_achievement', { error: null, user: req.session.user || null });
});

app.post('/achievements/add', requireAuth, async (req, res) => {
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
    res.redirect('/achievements');
  } catch (err) {
    console.error(err);
    audit.log(req, 'add_achievement_error', { error: err.message });
    res.status(500).render('add_achievement', { error: 'Server error. Please try again.', user: req.session.user || null });
  }
});

// Audit log viewer (recent activity)
app.get('/audit-log', requireAuth, async (req, res) => {
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

// Weekly trends API: achievements per week for current user (last 8 weeks)
app.get('/api/trends/weekly', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const [rows] = await db.query(
      `SELECT YEARWEEK(created_at, 3) AS yw, COUNT(*) AS count
       FROM achievements
       WHERE user_id = ? AND created_at >= DATE_SUB(CURDATE(), INTERVAL 56 DAY)
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
      const dayNum = (tmp.getUTCDay() + 6) % 7; // Mon=0..Sun=6
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

// 404 (keep this last)
app.use((req, res) => {
  audit.log(req, 'not_found', { url: req.originalUrl });
  res.status(404).render('404', { user: req.session.user || null });
});

app.listen(PORT, () => {
  console.log(`App running on http://localhost:${PORT}`);
});
