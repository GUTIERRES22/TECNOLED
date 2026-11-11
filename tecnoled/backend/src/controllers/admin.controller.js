'use strict';
const { query, one } = require('../config/db');
const { AppError, asyncHandler, paginar, likeEscape } = require('../utils/http');
const { rules, validate, clean, slugify, STATUS } = require('../utils/validators');
const Usuario = require('../models/usuario');
const Orcamento = require('../models/orcamento');
const Catalogo = require('../models/catalogo');
const Config = require('../models/configuracao');

const idParam = (req) => { const n = parseInt(req.params.id, 10); if (!Number.isInteger(n) || n < 1) throw new AppError(404, 'Registro não encontrado.'); return n; };
const invalido = (campos) => new AppError(422, 'Corrija os campos destacados.', { campos });

/* ---------- indicadores ---------- */
exports.indicadores = asyncHandler(async (req, res) => res.json(await Orcamento.indicadores()));

/* ---------- usuários ---------- */
exports.listarUsuarios = asyncHandler(async (req, res) => {
  const pg = paginar(req.query, 20);
  const termo = clean(req.query.q || '').slice(0, 80);
  const where = []; const p = [];
  if (termo) {
    const l = `%${likeEscape(termo)}%`; const dig = `%${likeEscape(termo.replace(/\D/g, '') || '§')}%`;
    where.push('(nome LIKE ? OR email LIKE ? OR empresa LIKE ? OR telefone LIKE ? OR documento LIKE ?)'); p.push(l, l, l, dig, dig);
  }
  if (['ADMIN', 'CLIENTE'].includes(req.query.tipo)) { where.push('tipo_usuario = ?'); p.push(req.query.tipo); }
  const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const itens = await query(
    `SELECT id, nome, empresa, email, telefone, tipo_usuario, ativo, data_cadastro,
            (SELECT COUNT(*) FROM orcamentos o WHERE o.usuario_id = usuarios.id) AS total_orcamentos
       FROM usuarios ${w} ORDER BY data_cadastro DESC LIMIT ? OFFSET ?`, [...p, pg.limit, pg.offset]);
  const total = Number((await one(`SELECT COUNT(*) AS n FROM usuarios ${w}`, p)).n);
  res.json({ itens, total, pagina: pg.page, porPagina: pg.limit });
});

exports.detalheUsuario = asyncHandler(async (req, res) => {
  const u = await Usuario.porId(idParam(req));
  if (!u) throw new AppError(404, 'Usuário não encontrado.');
  res.json({ usuario: u, orcamentos: await Orcamento.doUsuario(u.id) });
});

exports.alterarAtivo = asyncHandler(async (req, res) => {
  const id = idParam(req);
  if (id === req.user.id) throw new AppError(400, 'Você não pode desativar a própria conta.');
  if (typeof req.body?.ativo !== 'boolean') throw new AppError(422, 'Informe "ativo" como verdadeiro ou falso.');
  if (!(await Usuario.porId(id))) throw new AppError(404, 'Usuário não encontrado.');
  await Usuario.definirAtivo(id, req.body.ativo);
  if (!req.body.ativo) await query('DELETE FROM sessoes WHERE usuario_id = ?', [id]);
  res.json({ mensagem: req.body.ativo ? 'Conta reativada.' : 'Conta desativada e desconectada.' });
});

/* ---------- orçamentos ---------- */
exports.listarOrcamentos = asyncHandler(async (req, res) => {
  const pg = paginar(req.query, 20);
  const status = STATUS[req.query.status] ? req.query.status : null;
  const termo = clean(req.query.q || '').slice(0, 80);
  const q = termo ? { like: likeEscape(termo), id: /^\d+$/.test(termo) ? parseInt(termo, 10) : null } : null;
  const { itens, total } = await Orcamento.listarAdmin({ status, q, ...pg });
  res.json({ itens, total, pagina: pg.page, porPagina: pg.limit });
});

exports.detalheOrcamento = asyncHandler(async (req, res) => {
  const o = await Orcamento.detalheAdmin(idParam(req));
  if (!o) throw new AppError(404, 'Solicitação não encontrada.');
  res.json(o);
});

exports.alterarStatus = asyncHandler(async (req, res) => {
  const b = req.body || {};
  if (!STATUS[b.status]) throw invalido({ status: 'Status inválido.' });
  const nota = clean(b.nota || '');
  if (nota.length > 1000) throw invalido({ nota: 'A mensagem deve ter no máximo 1000 caracteres.' });
  let notaInterna;
  if (b.notaInterna !== undefined) { notaInterna = clean(b.notaInterna).slice(0, 4000) || null; }
  const r = await Orcamento.mudarStatus(idParam(req), b.status, nota, req.user.id, notaInterna);
  if (!r) throw new AppError(404, 'Solicitação não encontrada.');
  res.json({ mensagem: 'Solicitação atualizada.', ...r });
});

/* ---------- categorias ---------- */
exports.listarCategorias = asyncHandler(async (req, res) => res.json(await Catalogo.categorias()));

const regraCategoria = {
  nome: (v) => { const s = clean(v); return s.length < 2 || s.length > 80 ? { error: 'Informe o nome (2 a 80 caracteres).' } : { value: s }; },
  ordem: (v) => { const n = parseInt(v, 10); return { value: Number.isInteger(n) && n >= 0 && n <= 9999 ? n : 0 }; },
};
exports.criarCategoria = asyncHandler(async (req, res) => {
  const v = validate(regraCategoria, req.body); if (!v.ok) throw invalido(v.errors);
  const slug = slugify(v.values.nome); if (!slug) throw invalido({ nome: 'Nome inválido.' });
  try { res.status(201).json({ id: await Catalogo.criarCategoria({ ...v.values, slug }) }); }
  catch (e) { if (e.code === 'ER_DUP_ENTRY') throw invalido({ nome: 'Já existe uma categoria com este nome.' }); throw e; }
});
exports.atualizarCategoria = asyncHandler(async (req, res) => {
  const id = idParam(req); const v = validate(regraCategoria, req.body); if (!v.ok) throw invalido(v.errors);
  if (!(await Catalogo.categoriaPorId(id))) throw new AppError(404, 'Categoria não encontrada.');
  await Catalogo.atualizarCategoria(id, v.values); res.json({ mensagem: 'Categoria atualizada.' });
});
exports.removerCategoria = asyncHandler(async (req, res) => {
  const id = idParam(req);
  if (!(await Catalogo.categoriaPorId(id))) throw new AppError(404, 'Categoria não encontrada.');
  if (await Catalogo.totalProdutosDaCategoria(id)) throw new AppError(409, 'Esta categoria possui produtos. Mova ou remova os produtos antes.');
  await Catalogo.removerCategoria(id); res.json({ mensagem: 'Categoria removida.' });
});

/* ---------- produtos ---------- */
const lista = (v) => String(v ?? '').split(/\r?\n/).map((s) => clean(s)).filter(Boolean).slice(0, 12).map((s) => s.slice(0, 160));
const regraProduto = {
  nome: (v) => { const s = clean(v); return s.length < 2 || s.length > 120 ? { error: 'Informe o nome (2 a 120 caracteres).' } : { value: s }; },
  descricao: (v) => { const s = clean(v); return s.length < 10 || s.length > 1500 ? { error: 'A descrição deve ter de 10 a 1500 caracteres.' } : { value: s }; },
  categoria_id: (v) => { const n = parseInt(v, 10); return Number.isInteger(n) && n > 0 ? { value: n } : { error: 'Escolha uma categoria.' }; },
  imagem: (v) => {
    const s = clean(v); if (!s) return { value: null };
    return /^(images\/[A-Za-z0-9._-]+|https:\/\/[^\s"'<>]+)$/.test(s) && s.length <= 255 ? { value: s } : { error: 'Use um caminho como images/foto.webp ou um endereço https://.' };
  },
  vantagens: (v) => ({ value: Array.isArray(v) ? lista(v.join('\n')) : lista(v) }),
  aplicacoes: (v) => ({ value: Array.isArray(v) ? lista(v.join('\n')) : lista(v) }),
  palavras_chave: (v) => ({ value: clean(v).slice(0, 500) }),
  ativo: (v) => ({ value: v === true || v === 'true' || v === 1 }),
};
exports.listarProdutos = asyncHandler(async (req, res) => res.json(await Catalogo.listarAdmin()));
exports.detalheProduto = asyncHandler(async (req, res) => {
  const p = await Catalogo.porId(idParam(req)); if (!p) throw new AppError(404, 'Produto não encontrado.'); res.json(p);
});
exports.criarProduto = asyncHandler(async (req, res) => {
  const v = validate(regraProduto, req.body); if (!v.ok) throw invalido(v.errors);
  if (!(await Catalogo.categoriaPorId(v.values.categoria_id))) throw invalido({ categoria_id: 'Categoria inexistente.' });
  const base = slugify(v.values.nome) || 'produto'; let slug = base; let i = 2;
  while (await Catalogo.slugExiste(slug)) slug = `${base}-${i++}`;
  res.status(201).json({ id: await Catalogo.criar({ ...v.values, slug }) });
});
exports.atualizarProduto = asyncHandler(async (req, res) => {
  const id = idParam(req); const v = validate(regraProduto, req.body); if (!v.ok) throw invalido(v.errors);
  if (!(await Catalogo.porId(id))) throw new AppError(404, 'Produto não encontrado.');
  if (!(await Catalogo.categoriaPorId(v.values.categoria_id))) throw invalido({ categoria_id: 'Categoria inexistente.' });
  await Catalogo.atualizar(id, v.values); res.json({ mensagem: 'Produto atualizado.' });
});
exports.removerProduto = asyncHandler(async (req, res) => {
  const id = idParam(req); if (!(await Catalogo.porId(id))) throw new AppError(404, 'Produto não encontrado.');
  await Catalogo.remover(id); res.json({ mensagem: 'Produto removido. Os orçamentos antigos mantêm o nome do produto.' });
});

/* ---------- informações comerciais ---------- */
exports.verConfig = asyncHandler(async (req, res) => {
  res.json({ valores: await Config.todas(), campos: Object.fromEntries(Object.entries(Config.CHAVES).map(([k, m]) => [k, m.rotulo])) });
});
exports.salvarConfig = asyncHandler(async (req, res) => {
  const entrada = req.body?.valores || {}; const out = {}; const campos = {};
  for (const k of Object.keys(Config.CHAVES)) {
    if (!(k in entrada)) continue;
    const v = clean(entrada[k]).slice(0, 500);
    if (k === 'WHATSAPP_COMERCIAL' && v && !/^\d{12,13}$/.test(v.replace(/\D/g, ''))) campos[k] = 'Use somente dígitos com 55 e DDD, por exemplo 5514997212607.';
    else if (k === 'EMAIL' && v && rules.email(v).error) campos[k] = 'E-mail inválido.';
    else if (k === 'INSTAGRAM' && v && !/^https:\/\/[^\s"'<>]+$/.test(v)) campos[k] = 'Use um endereço que comece com https://';
    else out[k] = k === 'WHATSAPP_COMERCIAL' ? v.replace(/\D/g, '') : v;
  }
  if (Object.keys(campos).length) throw invalido(campos);
  await Config.salvar(out); res.json({ mensagem: 'Informações salvas.' });
});
