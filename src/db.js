const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.HEALTH_HOST || process.env.DB_HOST || 'localhost',
  user: process.env.HEALTH_USER || process.env.DB_USER || 'root',
  password: process.env.HEALTH_PASSWORD || process.env.DB_PASSWORD || '',
  database: process.env.HEALTH_DATABASE || process.env.DB_NAME || 'health',
  port: Number(process.env.DB_PORT || 3306),
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

module.exports = pool;
