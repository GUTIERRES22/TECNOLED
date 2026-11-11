'use strict';
const { query, one } = require('../config/db');

module.exports = {
  registrar: (email, ip) => query('INSERT INTO tentativas_login (email, ip) VALUES (?, ?)', [email.slice(0, 254), ip]),
  async contar(email, ip, minutos) {
    const r = await one(
      `SELECT SUM(email = ?) AS por_email, SUM(ip = ?) AS por_ip FROM tentativas_login
        WHERE data > DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? MINUTE) AND (email = ? OR ip = ?)`,
      [email, ip, minutos, email, ip]);
    return { porEmail: Number(r?.por_email || 0), porIp: Number(r?.por_ip || 0) };
  },
  limparEmail: (email) => query('DELETE FROM tentativas_login WHERE email = ?', [email]),
  limparAntigas: () => query('DELETE FROM tentativas_login WHERE data < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 DAY)'),
};
