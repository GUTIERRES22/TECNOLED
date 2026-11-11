'use strict';
// Cria todas as tabelas executando database/schema.sql. Seguro para rodar mais de uma vez.
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const config = require('../src/config/env');

(async () => {
  if (!config.db.user || !config.db.database) { console.error('Defina DB_USER e DB_NAME no .env'); process.exit(1); }
  const sql = fs.readFileSync(path.resolve(__dirname, '../../database/schema.sql'), 'utf8');
  let conn;
  try {
    conn = await mysql.createConnection({ ...config.db, multipleStatements: true, charset: 'utf8mb4' });
    await conn.query(sql);
    const [rows] = await conn.query('SHOW TABLES');
    console.log(`Banco "${config.db.database}" pronto. Tabelas: ${rows.map((r) => Object.values(r)[0]).join(', ')}`);
  } catch (e) {
    console.error('Falha ao criar as tabelas:', e.code || '', e.message);
    process.exitCode = 1;
  } finally { if (conn) await conn.end(); }
})();
