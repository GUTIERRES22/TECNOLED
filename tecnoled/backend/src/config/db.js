'use strict';
const mysql = require('mysql2/promise');
const config = require('./env');

const pool = mysql.createPool({
  ...config.db,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4',
  timezone: 'Z',          // Date <-> UTC
  multipleStatements: false,
  decimalNumbers: true,
});

// Toda conexão trabalha em UTC, para que CURRENT_TIMESTAMP e comparações de expiração sejam consistentes.
pool.pool.on('connection', (conn) => { conn.query("SET time_zone = '+00:00'"); });

/** Consulta parametrizada (os valores nunca são concatenados ao SQL). */
async function query(sql, params = []) {
  const safe = params.map((p) => (p === undefined ? null : p));
  const [rows] = await pool.query(sql, safe);
  return rows;
}
const one = async (sql, params) => (await query(sql, params))[0] || null;

/** Executa várias operações numa transação; faz rollback em caso de erro. */
async function transaction(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const run = async (sql, params = []) => {
      const [rows] = await conn.query(sql, params.map((p) => (p === undefined ? null : p)));
      return rows;
    };
    const result = await fn(run);
    await conn.commit();
    return result;
  } catch (err) {
    try { await conn.rollback(); } catch (_) { /* ignora */ }
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = { pool, query, one, transaction };
