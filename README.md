# Health & Fitness App

Node.js + Express + EJS + MySQL coursework app.

## Install

1. Create `.env` from `.env.example` with your MySQL settings.
	 - `HEALTH_HOST`, `HEALTH_USER`, `HEALTH_PASSWORD`, `HEALTH_DATABASE`
	 - `HEALTH_BASE_PATH` (optional), `SESSION_SECRET`
 	 - Do not commit `.env` — it's ignored by `.gitignore`.
2. Create DB and seed data:

```sql
SOURCE sql/create_db.sql;
SOURCE sql/insert_test_data.sql;
```

## Run

```powershell
npm install
node index.js
```

App runs on `http://localhost:8000`.

## Features
- Home and About pages
- Login with username `gold` and password `smiths`
- Registration with password policy
- Add achievements (protected by login)
- Per-user achievements with pagination and filters
- Search achievements
- Export achievements as CSV: `GET /achievements/export.csv` (button on Achievements page)
- JSON API:
	- `GET /api/achievements?page=1&limit=25&category=Sleep&metric=hours`
	- `POST /api/achievements` with `{ title, category, metric, amount, notes }`
- Weekly trends:
	- `GET /api/trends/weekly` returns last 8 ISO weeks counts
	- Mini table + sparkline on Achievements page
- Simple rate limiting on login/register/API POST
- Audit log viewer: `GET /audit-log`
- Status endpoint: `GET /status`
- Dark theme styling

## Security

- Input sanitization: all textbox inputs (login/register username, achievement fields, search) are sanitized server-side via `src/sanitize.js` to mitigate XSS and unsafe content in the database.
- Output escaping: EJS escapes variables by default; templates avoid rendering raw HTML from user input.
- Rate limiting: applied to sensitive endpoints to reduce brute-force attempts.

## Deployment
Update `links.txt` with your deployed URLs.

## Repo Hygiene

- `.gitignore` excludes `node_modules/`, `.env`, logs, and common build folders.
- Commit your SQL and views, but keep secrets and local dependencies out of Git.
