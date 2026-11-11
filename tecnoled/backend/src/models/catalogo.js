'use strict';
const { query, one } = require('../config/db');

const json = (v) => (Array.isArray(v) ? v : []);
const COLS = `p.id, p.slug, p.nome, p.descricao, p.imagem, p.vantagens, p.aplicacoes, p.fotos_descricao,
  p.palavras_chave, p.ativo, p.data_cadastro, p.data_atualizacao, p.categoria_id, c.slug AS categoria_slug, c.nome AS categoria_nome`;

const dto = (p) => ({ ...p, ativo: !!p.ativo, vantagens: json(p.vantagens), aplicacoes: json(p.aplicacoes), fotos_descricao: json(p.fotos_descricao) });

module.exports = {
  async publico() {
    const cats = await query('SELECT slug, nome FROM categorias ORDER BY ordem, nome');
    const prods = await query(`SELECT ${COLS} FROM produtos p JOIN categorias c ON c.id = p.categoria_id WHERE p.ativo = 1 ORDER BY p.id`);
    return { categorias: cats, produtos: prods.map(dto) };
  },
  async listarAdmin() {
    return (await query(`SELECT ${COLS} FROM produtos p JOIN categorias c ON c.id = p.categoria_id ORDER BY p.nome`)).map(dto);
  },
  porSlug: (slug) => one('SELECT id, nome, ativo FROM produtos WHERE slug = ?', [slug]),
  async porId(id) { const p = await one(`SELECT ${COLS} FROM produtos p JOIN categorias c ON c.id = p.categoria_id WHERE p.id = ?`, [id]); return p && dto(p); },
  async criar(d) {
    const r = await query(
      `INSERT INTO produtos (slug, nome, descricao, categoria_id, imagem, vantagens, aplicacoes, palavras_chave, ativo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [d.slug, d.nome, d.descricao, d.categoria_id, d.imagem, JSON.stringify(d.vantagens), JSON.stringify(d.aplicacoes), d.palavras_chave, d.ativo ? 1 : 0]);
    return r.insertId;
  },
  atualizar: (id, d) => query(
    `UPDATE produtos SET nome=?, descricao=?, categoria_id=?, imagem=?, vantagens=?, aplicacoes=?, palavras_chave=?, ativo=? WHERE id=?`,
    [d.nome, d.descricao, d.categoria_id, d.imagem, JSON.stringify(d.vantagens), JSON.stringify(d.aplicacoes), d.palavras_chave, d.ativo ? 1 : 0, id]),
  remover: (id) => query('DELETE FROM produtos WHERE id = ?', [id]),
  slugExiste: async (slug) => !!(await one('SELECT id FROM produtos WHERE slug = ?', [slug])),

  categorias: () => query('SELECT c.id, c.slug, c.nome, c.ordem, (SELECT COUNT(*) FROM produtos p WHERE p.categoria_id = c.id) AS total_produtos FROM categorias c ORDER BY c.ordem, c.nome'),
  categoriaPorId: (id) => one('SELECT id, slug, nome, ordem FROM categorias WHERE id = ?', [id]),
  async criarCategoria(d) { return (await query('INSERT INTO categorias (slug, nome, ordem) VALUES (?, ?, ?)', [d.slug, d.nome, d.ordem])).insertId; },
  atualizarCategoria: (id, d) => query('UPDATE categorias SET nome=?, ordem=? WHERE id=?', [d.nome, d.ordem, id]),
  removerCategoria: (id) => query('DELETE FROM categorias WHERE id = ?', [id]),
  totalProdutosDaCategoria: async (id) => Number((await one('SELECT COUNT(*) AS n FROM produtos WHERE categoria_id = ?', [id])).n),
};
