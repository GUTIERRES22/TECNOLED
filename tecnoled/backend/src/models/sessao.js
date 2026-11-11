'use strict';
const { query, one } = require('../config/db');
const config = require('../config/env');
const { randomToken, sha256 } = require('../utils/security');

module.exports = {
  /** Cria sessão nova (novo id a cada login: evita fixação de sessão). */
  async criar({ usuarioId, persistente, ip, userAgent }) {
    const token = randomToken(32);
    const csrf = randomToken(32);
    const minutos = persistente ? config.session.lembrarDias * 1440 : config.session.horas * 60;
    await query(
      `INSERT INTO sessoes (id, usuario_id, csrf_token, persistente, ip, user_agent, expiracao)
       VALUES (?, ?, ?, ?, ?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? MINUTE))`,
      [sha256(token), usuarioId, csrf, persistente ? 1 : 0, ip || null, (userAgent || '').slice(0, 255), minutos]);
    return { token, csrf, maxAgeMs: minutos * 60_000, persistente: !!persistente };
  },
  buscar: (token) => one(
    `SELECT s.id AS sessao_id, s.csrf_token, u.id, u.nome, u.email, u.tipo_usuario
       FROM sessoes s JOIN usuarios u ON u.id = s.usuario_id
      WHERE s.id = ? AND s.expiracao > UTC_TIMESTAMP() AND u.ativo = 1`, [sha256(token)]),
  remover: (token) => query('DELETE FROM sessoes WHERE id = ?', [sha256(token)]),
  removerDoUsuario: (usuarioId, manterId = null) =>
    query('DELETE FROM sessoes WHERE usuario_id = ? AND id <> ?', [usuarioId, manterId || '']),
  limparExpiradas: () => query('DELETE FROM sessoes WHERE expiracao <= UTC_TIMESTAMP()'),
};
