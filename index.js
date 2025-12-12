require('dotenv').config();
const express = require('express');
const path = require('path');
const session = require('express-session');
const morgan = require('morgan');
const audit = require('./src/audit');

const app = express();
app.set('trust proxy', true);
const PORT = 8000;
// Support deployment under a subpath (e.g., /usr/361)
const BASE_PATH = (process.env.HEALTH_BASE_PATH || '').replace(/"/g, '').trim();
// No local router definitions; routes are split into modules

// Middleware
app.use(morgan('dev'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/usr', express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Auto-detect base path from proxy header or URL segment
app.use((req, res, next) => {
  const hdr = req.headers['x-forwarded-prefix'];
  const match = req.originalUrl && req.originalUrl.match(/^\/usr\/\d+/);
  const inferred = (match ? match[0] : '') || hdr || '';
  res.locals.basePath = inferred;
  next();
});

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'change_this_secret',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 }
  })
);

// Routes
const homeRoutes = require('./routes/home');
const authRoutes = require('./routes/auth');
const achievementsRoutes = require('./routes/achievements');
const toolsRoutes = require('./routes/tools');
const periodRoutes = require('./routes/period');
const medsRoutes = require('./routes/meds');
const auditRoutes = require('./routes/audit');
const statusRoutes = require('./routes/status');
const apiRoutes = require('./routes/api');

app.use('/', homeRoutes);
app.use('/', authRoutes);
app.use('/', achievementsRoutes);
app.use('/', toolsRoutes);
app.use('/', periodRoutes);
app.use('/', medsRoutes);
app.use('/', auditRoutes);
app.use('/', statusRoutes);
app.use('/', apiRoutes);

// 404 (keep this last)
app.use((req, res) => {
  audit.log(req, 'not_found', { url: req.originalUrl });
  res.status(404).render('404', { user: req.session.user || null });
});

app.listen(PORT, () => {
  const base = BASE_PATH || '';
  console.log(`App running on http://localhost:${PORT}${base}`);
});
