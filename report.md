# Outline

A compact Health & Fitness web app to record personal achievements (e.g., runs, workouts) and search them later. Users can log in with fixed coursework credentials (gold/smiths), add new achievements with category/metric/amount/notes, and view/search a list of previous entries. Built with Node.js, Express, EJS, and MySQL.

# Architecture

Technologies: Node.js + Express (application tier), EJS (views), MySQL (data tier). Express serves EJS templates and exposes routes for home/about/login/achievements. Data access uses `mysql2/promise` with a pooled connection.

Diagram:
```
[Browser]
   | HTTP
[Express + EJS] --- SQL ---> [MySQL]
```

# Data Model

Single table `achievements` stores entries. Fields: `id`, `title`, `category`, `metric`, `amount`, `notes`, `created_at`.

Diagram:
```
achievements(id PK, title, category, metric, amount, notes, created_at)
```

# User Functionality

- Home: Overview and quick links to Achievements and Add.
- About: Module stack and feature summary.
- Login: Fixed credentials (username `gold`, password `smiths`) create a session; logout clears it.
- Achievements List: Shows recent entries in a table; provides search box for title/category/notes.
- Search: Server-side LIKE search (`/achievements/search?q=...`) across title/category/notes.
- Add Achievement: Form (protected) with validation for required fields and numeric amount; on success redirects to list.

# Advanced Techniques

- Connection Pooling:
```js
// src/db.js
const mysql = require('mysql2/promise');
const pool = mysql.createPool({ host: process.env.DB_HOST, user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME });
module.exports = pool;
```

- Parameterized Queries (SQL Injection-safe):
```js
// index.js (search)
const like = `%${q}%`;
const [rows] = await db.query(
  'SELECT id, title, category, metric, amount, notes, created_at FROM achievements WHERE title LIKE ? OR category LIKE ? OR notes LIKE ? ORDER BY created_at DESC',
  [like, like, like]
);
```

- Session-based Auth:
```js
// index.js
app.use(require('express-session')({ secret: process.env.SESSION_SECRET, resave: false, saveUninitialized: false }));
function requireAuth(req, res, next) { if (req.session && req.session.user) return next(); return res.redirect('/login'); }
```

# AI Declaration

