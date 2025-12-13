# Health & Fitness App

Node.js + Express + EJS + MySQL coursework app.

## Install

1. Create a `.env` file with your MySQL settings:
   - HEALTH_HOST, HEALTH_USER, HEALTH_PASSWORD, HEALTH_DATABASE
   - Do not commit `.env` — it's ignored by `.gitignore`.

2. Initialize the database in MySQL:

```sql
SOURCE sql/create_db.sql;
SOURCE sql/insert_test_data.sql;
```

Files: [sql/create_db.sql](sql/create_db.sql), [sql/insert_test_data.sql](sql/insert_test_data.sql)

## Run

Install dependencies and start the server:

```sh
npm install
node index.js
```

The app runs at:
- Local: http://localhost:8000
- If deployed under a subpath, set HEALTH_BASE_PATH or rely on proxy headers; the app auto-detects `basePath` in views.

Main entry: [index.js](index.js)

## Project Structure

- Routes are modularized under [routes/](routes):
  - [routes/home.js](routes/home.js), [routes/auth.js](routes/auth.js), [routes/achievements.js](routes/achievements.js), [routes/tools.js](routes/tools.js), [routes/period.js](routes/period.js), [routes/meds.js](routes/meds.js), [routes/audit.js](routes/audit.js), [routes/status.js](routes/status.js), [routes/api.js](routes/api.js)
- Views (EJS): [views/](views)
- Static: [public/styles.css](public/styles.css)
- DB & helpers: [`src/db`](src/db.js), [`audit.log`](src/audit.js), [`sanitizeText`](src/sanitize.js)

## Features

- Auth: Register/Login with sessions ([routes/auth.js](routes/auth.js))
- Achievements: Add/Search/Paginate/Export CSV ([routes/achievements.js](routes/achievements.js))
- Fitness Tools: BMI, BMR/TDEE, Heart Rate, Macros, Water ([routes/tools.js](routes/tools.js))
- Nutrition Lookup: CalorieNinjas `/v1/nutrition` ([views/nutrition.ejs](views/nutrition.ejs), [routes/tools.js](routes/tools.js))
- Period Tracker: Calendar + next window ([routes/period.js](routes/period.js))
- Medication Tracker: Interval/Daily/Weekly ([routes/meds.js](routes/meds.js))
- Audit Log viewer ([routes/audit.js](routes/audit.js))
- Status & JSON APIs ([routes/status.js](routes/status.js), [routes/api.js](routes/api.js))

## JSON APIs

- GET `/api/achievements` — paginated, optional filters
- POST `/api/achievements` — validated insert
- GET `/api/trends/weekly` — last 8 ISO weeks

See [routes/api.js](routes/api.js).

## Security

- Input sanitization via [`sanitizeText`](src/sanitize.js)
- Audit logging via [`audit.log`](src/audit.js)
- Rate limiting on sensitive endpoints (auth/API)
- Escaped EJS output

## Testing

Run the sanitizer checks:

```sh
node scripts/test_sanitize.js
```

Script: [scripts/test_sanitize.js](scripts/test_sanitize.js)

## Notes

- Seeded user: `gold` (see [sql/insert_test_data.sql](sql/insert_test_data.sql))
- Links for deployed instance: [links.txt](links.txt)

