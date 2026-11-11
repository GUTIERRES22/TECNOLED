'use strict';
const { query, one } = require('../config/db');

module.exports = {
  async criar(usuarioId, tokenHash, minutos, ip) {
    await query('UPDATE recuperacao_senha SET utilizado = 1 WHERE usuario_id = ? AND utilizado = 0', [usuarioId]);
    await query(
      `INSERT INTO recuperacao_senha (usuario_id, token_hash, expiracao, ip)
       VALUES (?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? MINUTE), ?)`, [usuarioId, tokenHash, minutos, ip || null]);
  },
  validoPorHash: (tokenHash) => one(
    `SELECT id, usuario_id FROM recuperacao_senha
      WHERE token_hash = ? AND utilizado = 0 AND expiracao > UTC_TIMESTAMP()`, [tokenHash]),
  limparAntigos: () => query('DELETE FROM recuperacao_senha WHERE expiracao < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 7 DAY)'),
};
