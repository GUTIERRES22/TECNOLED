'use strict';
const { asyncHandler, AppError, clientIp } = require('../utils/http');
const { rules, validate, clean } = require('../utils/validators');
const Catalogo = require('../models/catalogo');
const Config = require('../models/configuracao');
const Orcamento = require('../models/orcamento');
const Usuario = require('../models/usuario');
const mail = require('../services/mail.service');
const log = require('../utils/logger');

exports.catalogo = asyncHandler(async (req, res) => {
  const { categorias, produtos } = await Catalogo.publico();
  const CATS = {}; for (const c of categorias) CATS[c.slug] = c.nome;
  res.set('Cache-Control', 'public, max-age=60');
  res.json({
    CATS,
    P: produtos.map((p) => ({
      id: p.slug, c: p.categoria_slug, n: p.nome, d: p.descricao, v: p.vantagens, a: p.aplicacoes,
      t: p.fotos_descricao.length ? p.fotos_descricao : undefined, kw: p.palavras_chave || '', img: p.imagem || null,
    })),
  });
});

exports.config = asyncHandler(async (req, res) => {
  const all = await Config.todas(); const pub = {};
  for (const [k, meta] of Object.entries(Config.CHAVES)) if (meta.publica && all[k]) pub[k] = all[k];
  res.set('Cache-Control', 'public, max-age=60');
  res.json(pub);
});

/** Solicitação de orçamento: aberta a visitantes; se houver sessão, associa à conta. */
exports.criarOrcamento = asyncHandler(async (req, res) => {
  const b = req.body || {};
  if (clean(b.website)) return res.status(201).json({ id: 0 });          // honeypot: robôs preenchem
  const u = req.user ? await Usuario.porId(req.user.id) : null;
  const v = validate({
    nome: rules.nome, empresa: rules.empresa, telefone: rules.telefone, cidade: rules.cidade,
    email: rules.emailOpcional, quantidade: rules.quantidade, mensagem: rules.mensagem,
  }, { ...b, nome: b.nome || u?.nome, telefone: b.telefone || u?.telefone, email: b.email || u?.email, empresa: b.empresa ?? u?.empresa });
  const slug = clean(b.produto);
  let produtoId = null; let produtoNome = 'Outro / ainda não sei qual escolher';
  if (!slug) v.errors.produto = 'Escolha um produto de interesse.';
  else if (slug !== 'outro') {
    const p = await Catalogo.porSlug(slug);
    if (!p || !p.ativo) v.errors.produto = 'Produto inválido.'; else { produtoId = p.id; produtoNome = p.nome; }
  }
  if (Object.keys(v.errors).length) throw new AppError(422, 'Corrija os campos destacados.', { campos: v.errors });
  const d = { ...v.values, usuarioId: u ? u.id : null, produtoId, produtoNome };
  d.id = await Orcamento.criar(d);
  mail.enviarAvisoNovoOrcamento(d).catch((e) => log.error('falha ao avisar novo orçamento', { err: e }));
  res.status(201).json({ id: d.id, associadoAConta: !!u, mensagem: 'Solicitação registrada.' });
});
