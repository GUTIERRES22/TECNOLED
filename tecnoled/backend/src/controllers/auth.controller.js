'use strict';
const { rules, validate, passwordPolicy } = require('../utils/validators');
const { AppError, asyncHandler, clientIp } = require('../utils/http');
const auth = require('../services/auth.service');
const Sessao = require('../models/sessao');
const Usuario = require('../models/usuario');
const { setSessionCookie, clearSessionCookie } = require('../middlewares/auth');

const ctx = (req) => ({ ip: clientIp(req), userAgent: req.get('user-agent') });
const falhaValidacao = (errors) => new AppError(422, 'Corrija os campos destacados.', { campos: errors });

exports.cadastrar = asyncHandler(async (req, res) => {
  const b = req.body || {};
  const v = validate({ nome: rules.nome, empresa: rules.empresa, documento: rules.documento, email: rules.email, telefone: rules.telefone, senha: rules.senha, aceite: rules.aceite }, b);
  if (b.senha !== b.confirmarSenha) v.errors.confirmarSenha = 'As senhas não coincidem.';
  if (Object.keys(v.errors).length) throw falhaValidacao(v.errors);
  const { id, sessao } = await auth.registrar(v.values, ctx(req));
  setSessionCookie(res, sessao);
  res.status(201).json({ mensagem: 'Conta criada com sucesso!', usuario: { id, nome: v.values.nome, email: v.values.email, tipo: 'CLIENTE' }, csrf: sessao.csrf });
});

exports.entrar = asyncHandler(async (req, res) => {
  const b = req.body || {};
  const e = rules.email(b.email);
  if (e.error || typeof b.senha !== 'string' || !b.senha || b.senha.length > 200) throw new AppError(401, 'E-mail ou senha incorretos.');
  const { usuario, sessao } = await auth.entrar({ email: e.value, senha: b.senha, lembrar: b.lembrar === true }, ctx(req));
  setSessionCookie(res, sessao);
  res.json({ usuario, csrf: sessao.csrf, destino: usuario.tipo === 'ADMIN' ? '/admin' : '/conta' });
});

exports.sair = asyncHandler(async (req, res) => {
  if (req.sessao) await Sessao.remover(req.sessao.token);
  clearSessionCookie(res);
  res.json({ mensagem: 'Você saiu da sua conta.' });
});

exports.eu = asyncHandler(async (req, res) => {
  if (!req.user) return res.json({ usuario: null });
  const u = await Usuario.porId(req.user.id);
  res.json({ usuario: { id: u.id, nome: u.nome, empresa: u.empresa, documento: u.documento, email: u.email, telefone: u.telefone, tipo: u.tipo_usuario, data_cadastro: u.data_cadastro }, csrf: req.sessao.csrf });
});

const MSG_ESQUECI = 'Se o e-mail estiver cadastrado, enviaremos as instruções para redefinir a senha. Verifique também a caixa de spam.';
exports.esqueci = asyncHandler(async (req, res) => {
  const e = rules.email((req.body || {}).email);
  if (!e.error) await auth.solicitarRedefinicao(e.value, ctx(req));
  res.json({ mensagem: MSG_ESQUECI });
});

exports.redefinir = asyncHandler(async (req, res) => {
  const b = req.body || {};
  if (typeof b.token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(b.token)) throw new AppError(400, 'Link inválido ou expirado. Solicite uma nova redefinição de senha.');
  const p = passwordPolicy(b.senha);
  if (p.error) throw falhaValidacao({ senha: p.error });
  if (b.senha !== b.confirmarSenha) throw falhaValidacao({ confirmarSenha: 'As senhas não coincidem.' });
  await auth.redefinirSenha(b.token, b.senha);
  res.json({ mensagem: 'Senha atualizada! Entre com a nova senha.' });
});
