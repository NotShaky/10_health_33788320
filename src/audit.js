const db = require('./db');

function toJson(value) {
  try {
    if (value == null) return null;
    if (typeof value === 'string') return value;
    return JSON.stringify(value);
  } catch (_) {
    return null;
  }
}

async function log(req, action, details) {
  try {
    const userId = req?.session?.user?.id || null;
    const ip = req?.ip || null;
    const ua = req?.headers?.['user-agent'] || null;
    const det = toJson(details);
    await db.query(
      'INSERT INTO audit_logs (user_id, action, details, ip, user_agent) VALUES (?, ?, ?, ?, ?)',
      [userId, action, det, ip, ua]
    );
  } catch (err) {
    // Avoid crashing on logging failures; just print to console
    console.error('Audit log error:', err.message);
  }
}

module.exports = { log };
