'use strict';
const { rules, validate, passwordPolicy } = require('../utils/validators');
const { AppError, asyncHandler, paginar } = require('../utils/http');
const Usuario = require('../models/usuario');
const Orcamento = require('../models/orcamento');
const auth = require('../services/auth.service');

exports.atualizarPerfil = asyncHandler(async (req, res) => {
  const v = validate({ nome: rules.nome, empresa: rules.empresa, documento: rules.documento, telefone: rules.telefone }, req.body);
  if (!v.ok) throw new AppError(422, 'Corrija os campos destacados.', { campos: v.errors });
  await Usuario.atualizarPerfil(req.user.id, v.values);
  res.json({ mensagem: 'Perfil atualizado.', usuario: await Usuario.porId(req.user.id) });
});

exports.alterarSenha = asyncHandler(async (req, res) => {
  const b = req.body || {};
  const p = passwordPolicy(b.novaSenha);
  const campos = {};
  if (typeof b.senhaAtual !== 'string' || !b.senhaAtual) campos.senhaAtual = 'Informe a senha atual.';
  if (p.error) campos.novaSenha = p.error;
  else if (b.novaSenha === b.senhaAtual) campos.novaSenha = 'A nova senha deve ser diferente da atual.';
  if (b.novaSenha !== b.confirmarSenha) campos.confirmarSenha = 'As senhas não coincidem.';
  if (Object.keys(campos).length) throw new AppError(422, 'Corrija os campos destacados.', { campos });
  await auth.alterarSenha(req.user.id, b.senhaAtual, b.novaSenha, req.sessao.id);
  res.json({ mensagem: 'Senha alterada. Os outros dispositivos foram desconectados.' });
});

exports.resumo = asyncHandler(async (req, res) => res.json(await Orcamento.resumoDoUsuario(req.user.id)));

exports.listarOrcamentos = asyncHandler(async (req, res) => {
  const pg = paginar(req.query, 10);
  const { itens, total } = await Orcamento.listarDoUsuario(req.user.id, pg);
  res.json({ itens, total, pagina: pg.page, porPagina: pg.limit });
});

exports.detalheOrcamento = asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  // A consulta filtra por usuario_id: orçamento de outra pessoa responde 404, como se não existisse.
  const o = Number.isInteger(id) ? await Orcamento.detalheDoUsuario(id, req.user.id) : null;
  if (!o) throw new AppError(404, 'Solicitação não encontrada.');
  res.json(o);
});
