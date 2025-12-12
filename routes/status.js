const express = require('express');
const router = express.Router();
const db = require('../src/db');

router.get('/status', async (req, res) => {
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

module.exports = router;
