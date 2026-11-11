'use strict';
const { query, one } = require('../config/db');

const PUBLICO = 'id, nome, empresa, documento, email, telefone, tipo_usuario, ativo, data_cadastro, data_atualizacao';

module.exports = {
  PUBLICO,
  porEmail: (email) => one('SELECT id, nome, email, senha_hash, tipo_usuario, ativo FROM usuarios WHERE email = ?', [email]),
  porId: (id) => one(`SELECT ${PUBLICO} FROM usuarios WHERE id = ?`, [id]),
  comSenha: (id) => one('SELECT id, senha_hash FROM usuarios WHERE id = ?', [id]),
  async criar(d) {
    const r = await query(
      `INSERT INTO usuarios (nome, empresa, documento, email, telefone, senha_hash, tipo_usuario, aceite_termos_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())`,
      [d.nome, d.empresa, d.documento, d.email, d.telefone, d.senhaHash, d.tipo || 'CLIENTE']);
    return r.insertId;
  },
  atualizarPerfil: (id, d) => query('UPDATE usuarios SET nome=?, empresa=?, documento=?, telefone=? WHERE id=?',
    [d.nome, d.empresa, d.documento, d.telefone, id]),
  atualizarSenha: (id, hash) => query('UPDATE usuarios SET senha_hash=? WHERE id=?', [hash, id]),
  existeAdmin: async () => !!(await one("SELECT id FROM usuarios WHERE tipo_usuario='ADMIN' LIMIT 1")),
  definirAtivo: (id, ativo) => query('UPDATE usuarios SET ativo=? WHERE id=?', [ativo ? 1 : 0, id]),
};
