# Outline

A compact Health & Fitness web app to record personal achievements (e.g., runs, workouts) and search them later. Users can register and log in, add new achievements with category/metric/amount/notes, and view/search a list of previous entries. Built with Node.js, Express, EJS, and MySQL. Extended with a Period Tracker (calendar + next-window estimate), Medication Tracker (interval/daily/weekly schedules), and a suite of Fitness Tools (BMI, BMR/TDEE, HR zones, Macros, Water).

# Architecture

Technologies: Node.js + Express (application tier), EJS (views), MySQL (data tier). Express serves EJS templates and exposes routes for home/about/login/achievements using an Express Router for modular endpoints. Data access uses `mysql2/promise` with a pooled connection.

Diagram:
```
[Browser]
   | HTTP
[Express + EJS] --- SQL ---> [MySQL]
```

# Data Model

Single table `achievements` stores entries. Fields: `id`, `title`, `category`, `metric`, `amount`, `notes`, `created_at`.
Core tables:
- `achievements`: `id`, `user_id`, `title`, `category`, `metric`, `amount`, `notes`, `created_at`
- `users`: `id`, `username`, `password_hash`, `created_at`
- `audit_logs`: audit trail of actions
- `period_logs`: `user_id`, `start_date`, `cycle_length`, `created_at`
- `medications`: `user_id`, `name`, `dosage`, `interval_hours` (nullable), `freq_type` (interval/daily/weekly), `time_of_day`, `days_of_week`, `notes`, `created_at`

Diagram:
```
achievements(id PK, title, category, metric, amount, notes, created_at)
```

# User Functionality

Home: Overview and quick links to Achievements, Tools, Period, Meds.
Add Achievement: Form (protected) with validation for required fields and numeric amount; on success redirects to list.
Period Tracker: Log cycle start dates; calendar view with prev/next navigation; estimated next period window; color legend.
Medication Tracker: Add meds with frequency types — interval (every N hours), daily (HH:MM), weekly (days + time); shows next due and upcoming times.
Fitness Tools: BMI (metric/imperial), BMR/TDEE (Mifflin-St Jeor), Heart rate zones, Macro calculator, Water intake (units/activity/climate).

# Advanced Techniques

```js
// src/db.js
const mysql = require('mysql2/promise');
const pool = mysql.createPool({ host: process.env.DB_HOST, user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME });
module.exports = pool;
```

```js
// index.js (search)
const like = `%${q}%`;
const [rows] = await db.query(
  'SELECT id, title, category, metric, amount, notes, created_at FROM achievements WHERE title LIKE ? OR category LIKE ? OR notes LIKE ? ORDER BY created_at DESC',
  [like, like, like]
);
```

```js
// index.js
app.use(require('express-session')({ secret: process.env.SESSION_SECRET, resave: false, saveUninitialized: false }));
function requireAuth(req, res, next) { if (req.session && req.session.user) return next(); return res.redirect('/login'); }
```
 - Router-based modular routes:
```js
// index.js
const router = express.Router();
router.get('/achievements', async (req, res) => { /* ... */ });
app.use('/', router);
```

- Simple rate limiting utility applied per-route; audit logging on key actions.

## Analytics & Trends
- Weekly trends API computes last 8 ISO weeks; Achievements page renders sparkline + counts.
- Period calendar highlights logged starts and the estimated next window.

## Security
- Input sanitization, output escaping, session hardening, basic rate limiting.

## Future Work
- Swagger/OpenAPI docs, test coverage, CI, notification/reminder system, A11y polish, Dockerization.

# AI Declaration

