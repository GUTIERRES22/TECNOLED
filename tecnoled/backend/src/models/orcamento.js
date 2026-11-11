'use strict';
const { query, one, transaction } = require('../config/db');

const LISTA = `o.id, o.produto_id, o.produto_nome, o.quantidade, o.status, o.mensagem, o.data_solicitacao, o.data_atualizacao`;

module.exports = {
  async criar(d) {
    return transaction(async (run) => {
      const r = await run(
        `INSERT INTO orcamentos (usuario_id, produto_id, produto_nome, mensagem, quantidade, contato_nome, contato_empresa,
                                 contato_email, contato_telefone, contato_cidade)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [d.usuarioId, d.produtoId, d.produtoNome, d.mensagem, d.quantidade, d.nome, d.empresa, d.email, d.telefone, d.cidade]);
      await run('INSERT INTO orcamento_historico (orcamento_id, status_anterior, status_novo, alterado_por) VALUES (?, NULL, ?, NULL)',
        [r.insertId, 'AGUARDANDO_ANALISE']);
      return r.insertId;
    });
  },

  /* ----- cliente: SEMPRE filtrado por usuario_id ----- */
  async listarDoUsuario(usuarioId, { limit, offset }) {
    const itens = await query(`SELECT ${LISTA} FROM orcamentos o WHERE o.usuario_id = ? ORDER BY o.data_solicitacao DESC, o.id DESC LIMIT ? OFFSET ?`, [usuarioId, limit, offset]);
    const total = Number((await one('SELECT COUNT(*) AS n FROM orcamentos WHERE usuario_id = ?', [usuarioId])).n);
    return { itens, total };
  },
  async detalheDoUsuario(id, usuarioId) {
    const o = await one(`SELECT ${LISTA}, o.contato_nome, o.contato_empresa, o.contato_email, o.contato_telefone, o.contato_cidade
                           FROM orcamentos o WHERE o.id = ? AND o.usuario_id = ?`, [id, usuarioId]);
    if (!o) return null;
    o.historico = await query('SELECT status_anterior, status_novo, nota, data FROM orcamento_historico WHERE orcamento_id = ? ORDER BY data, id', [id]);
    return o;
  },
  async resumoDoUsuario(usuarioId) {
    const porStatus = await query('SELECT status, COUNT(*) AS n FROM orcamentos WHERE usuario_id = ? GROUP BY status', [usuarioId]);
    const produtos = await query(
      `SELECT produto_nome, COUNT(*) AS vezes, MAX(data_solicitacao) AS ultima FROM orcamentos
        WHERE usuario_id = ? GROUP BY produto_nome ORDER BY ultima DESC LIMIT 8`, [usuarioId]);
    return { porStatus, produtos };
  },

  /* ----- administração ----- */
  async listarAdmin({ status, q, limit, offset }) {
    const where = []; const p = [];
    if (status) { where.push('o.status = ?'); p.push(status); }
    if (q) { where.push("(o.contato_nome LIKE ? OR o.contato_email LIKE ? OR o.contato_empresa LIKE ? OR o.produto_nome LIKE ? OR o.id = ?)"); const l = `%${q.like}%`; p.push(l, l, l, l, q.id); }
    const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const itens = await query(
      `SELECT ${LISTA}, o.usuario_id, o.contato_nome, o.contato_empresa, o.contato_telefone
         FROM orcamentos o ${w} ORDER BY o.data_solicitacao DESC, o.id DESC LIMIT ? OFFSET ?`, [...p, limit, offset]);
    const total = Number((await one(`SELECT COUNT(*) AS n FROM orcamentos o ${w}`, p)).n);
    return { itens, total };
  },
  async detalheAdmin(id) {
    const o = await one(
      `SELECT o.*, u.nome AS usuario_nome, u.email AS usuario_email
         FROM orcamentos o LEFT JOIN usuarios u ON u.id = o.usuario_id WHERE o.id = ?`, [id]);
    if (!o) return null;
    o.historico = await query(
      `SELECT h.status_anterior, h.status_novo, h.nota, h.data, a.nome AS alterado_por_nome
         FROM orcamento_historico h LEFT JOIN usuarios a ON a.id = h.alterado_por
        WHERE h.orcamento_id = ? ORDER BY h.data, h.id`, [id]);
    return o;
  },
  async mudarStatus(id, novo, nota, adminId, notaInterna) {
    return transaction(async (run) => {
      const [atual] = await run('SELECT status FROM orcamentos WHERE id = ? FOR UPDATE', [id]);
      if (!atual) return null;
      if (notaInterna !== undefined) await run('UPDATE orcamentos SET nota_interna = ? WHERE id = ?', [notaInterna, id]);
      if (atual.status !== novo || nota) {
        await run('UPDATE orcamentos SET status = ? WHERE id = ?', [novo, id]);
        await run('INSERT INTO orcamento_historico (orcamento_id, status_anterior, status_novo, nota, alterado_por) VALUES (?, ?, ?, ?, ?)',
          [id, atual.status, novo, nota || null, adminId]);
      }
      return { anterior: atual.status, novo };
    });
  },
  async doUsuario(usuarioId) {
    return query(`SELECT ${LISTA} FROM orcamentos o WHERE o.usuario_id = ? ORDER BY o.data_solicitacao DESC LIMIT 50`, [usuarioId]);
  },
  async indicadores() {
    const [u] = await query("SELECT COUNT(*) AS total, SUM(data_cadastro > DATE_SUB(UTC_TIMESTAMP(), INTERVAL 30 DAY)) AS novos FROM usuarios WHERE tipo_usuario = 'CLIENTE'");
    const [o] = await query('SELECT COUNT(*) AS total, SUM(data_solicitacao > DATE_SUB(UTC_TIMESTAMP(), INTERVAL 30 DAY)) AS ultimos30, SUM(usuario_id IS NULL) AS visitantes FROM orcamentos');
    const porStatus = await query('SELECT status, COUNT(*) AS n FROM orcamentos GROUP BY status');
    const [p] = await query('SELECT SUM(ativo = 1) AS ativos, COUNT(*) AS total FROM produtos');
    const topProdutos = await query('SELECT produto_nome, COUNT(*) AS n FROM orcamentos GROUP BY produto_nome ORDER BY n DESC LIMIT 5');
    const recentes = await query(`SELECT ${LISTA}, o.contato_nome FROM orcamentos o ORDER BY o.data_solicitacao DESC, o.id DESC LIMIT 6`);
    return {
      clientes: { total: Number(u.total), novos30: Number(u.novos || 0) },
      orcamentos: { total: Number(o.total), ultimos30: Number(o.ultimos30 || 0), visitantes: Number(o.visitantes || 0) },
      porStatus: porStatus.map((s) => ({ status: s.status, n: Number(s.n) })),
      produtos: { ativos: Number(p.ativos || 0), total: Number(p.total) },
      topProdutos: topProdutos.map((t) => ({ produto_nome: t.produto_nome, n: Number(t.n) })),
      recentes,
    };
  },
};
