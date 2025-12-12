# Health & Fitness App

Node.js + Express + EJS + MySQL coursework app.

## Install

1. Create a `.env` file with your MySQL settings:
   - HEALTH_HOST, HEALTH_USER, HEALTH_PASSWORD, HEALTH_DATABASE
   - Do not commit `.env` — it's ignored by `.gitignore`.
2. Create DB and seed data (run inside your MySQL client):

```sql
SOURCE sql/create_db.sql;
SOURCE sql/insert_test_data.sql;
```

Files: [sql/create_db.sql](sql/create_db.sql), [sql/insert_test_data.sql](sql/insert_test_data.sql)

## Run

Install dependencies and start the server:

```sh
npm install
npm start
# or: node index.js
```

App runs on http://localhost:8000 by default (see [index.js](index.js)). If deployed under a subpath set HEALTH_BASE_PATH in your environment.

## Test

A small unit check for the input sanitizer is included:

```sh
node scripts/test_sanitize.js
```

See [`sanitizeText`](src/sanitize.js) and test script [scripts/test_sanitize.js](scripts/test_sanitize.js).

## Features

- Home, About, Login, Register, and user-protected Achievements
- Add, search, filter, paginate achievements; CSV export for current user
- Fitness Tools:
  - BMI, BMR/TDEE (Mifflin‑St Jeor), Heart Rate Zones, Macro Calculator, Water Intake
- Period Tracker (calendar + next-window estimate)
- Medication Tracker (interval / daily / weekly schedules + next due)
- Audit log viewer for site actions
- JSON APIs:
  - GET /api/achievements (paginated, filters)
  - POST /api/achievements (validated)
  - GET /api/trends/weekly (last 8 ISO weeks)
- Simple per-route rate limiting for sensitive endpoints

## Security & Hardening

- Server-side input sanitization via [`sanitizeText`](src/sanitize.js) to reduce stored XSS.
- Audit logging of important events via [`audit.log`](src/audit.js).
- Escaped output in EJS templates; avoid rendering raw user HTML.
- Session-based auth with express-session (see [index.js](index.js)).
- Rate limiting on register/login/API endpoints.

## Data & Files of Interest

- DB connection pool: [`db`](src/db.js)
- Main app & routes: [index.js](index.js)
- Views (EJS): /views/*.ejs
- Styles: public/styles.css

## Deployment

- Provide DB credentials via environment.
- Initialize DB using the SQL files above.
- For VM/subpath deployments set HEALTH_BASE_PATH or rely on X-Forwarded headers.

## Links 

See links.txt for deployed links

## Notes

- Default seeded user: username `gold` (see [sql/insert_test_data.sql](sql/insert_test_data.sql)).
- Audit logs and rate limit events help diagnose issues without exposing secrets.
 