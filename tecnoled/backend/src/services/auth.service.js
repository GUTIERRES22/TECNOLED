'use strict';
const bcrypt = require('bcryptjs');
const config = require('../config/env');
const { transaction } = require('../config/db');
const Usuario = require('../models/usuario');
const Sessao = require('../models/sessao');
const Recuperacao = require('../models/recuperacao');
const Tentativas = require('../models/tentativas');
const mail = require('./mail.service');
const log = require('../utils/logger');
const { randomToken, sha256 } = require('../utils/security');
const { AppError } = require('../utils/http');

const BCRYPT_COST = 12;
const JANELA_MIN = 15;
const MAX_FALHAS_EMAIL = 5;
const MAX_FALHAS_IP = 30;
// Hash descartável: usado para gastar o mesmo tempo quando o e-mail não existe.
const DUMMY_HASH = bcrypt.hashSync('tecnoled-dummy-password', BCRYPT_COST);

const hashSenha = (s) => bcrypt.hash(s, BCRYPT_COST);

async function registrar(dados, ctx) {
  if (await Usuario.porEmail(dados.email)) {
    throw new AppError(409, 'Este e-mail já está cadastrado. Entre na sua conta ou recupere a senha.', { campos: { email: 'E-mail já cadastrado.' } });
  }
  let id;
  try {
    id = await Usuario.criar({ ...dados, senhaHash: await hashSenha(dados.senha), tipo: 'CLIENTE' });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') throw new AppError(409, 'Este e-mail já está cadastrado.', { campos: { email: 'E-mail já cadastrado.' } });
    throw e;
  }
  const sessao = await Sessao.criar({ usuarioId: id, persistente: false, ip: ctx.ip, userAgent: ctx.userAgent });
  return { id, sessao };
}

async function entrar({ email, senha, lembrar }, ctx) {
  const falhas = await Tentativas.contar(email, ctx.ip, JANELA_MIN);
  if (falhas.porEmail >= MAX_FALHAS_EMAIL || falhas.porIp >= MAX_FALHAS_IP) {
    throw new AppError(429, `Muitas tentativas de acesso. Aguarde ${JANELA_MIN} minutos e tente novamente ou use "Esqueci minha senha".`);
  }
  const u = await Usuario.porEmail(email);
  const confere = await bcrypt.compare(senha, u ? u.senha_hash : DUMMY_HASH);
  if (!u || !confere || !u.ativo) {
    await Tentativas.registrar(email, ctx.ip);
    throw new AppError(401, 'E-mail ou senha incorretos.');
  }
  await Tentativas.limparEmail(email);
  const sessao = await Sessao.criar({ usuarioId: u.id, persistente: !!lembrar, ip: ctx.ip, userAgent: ctx.userAgent });
  return { usuario: { id: u.id, nome: u.nome, email: u.email, tipo: u.tipo_usuario }, sessao };
}

/** Resposta sempre igual, exista ou não o e-mail. O envio ocorre em segundo plano. */
async function solicitarRedefinicao(email, ctx) {
  const u = await Usuario.porEmail(email);
  if (!u || !u.ativo) return;
  const token = randomToken(32);
  await Recuperacao.criar(u.id, sha256(token), config.resetTokenMinutos, ctx.ip);
  const link = `${config.appUrl}/redefinir-senha#token=${token}`;
  mail.enviarRedefinicaoSenha({ nome: u.nome, email: u.email }, link)
    .catch((e) => log.error('falha ao enviar e-mail de redefinição', { err: e }));
}

async function redefinirSenha(token, novaSenha) {
  const reg = await Recuperacao.validoPorHash(sha256(token));
  if (!reg) throw new AppError(400, 'Link inválido ou expirado. Solicite uma nova redefinição de senha.');
  const hash = await hashSenha(novaSenha);
  await transaction(async (run) => {
    // Marca como usado condicionalmente: se duas requisições chegarem juntas, só uma passa.
    const r = await run('UPDATE recuperacao_senha SET utilizado = 1 WHERE id = ? AND utilizado = 0 AND expiracao > UTC_TIMESTAMP()', [reg.id]);
    if (r.affectedRows !== 1) throw new AppError(400, 'Link inválido ou expirado. Solicite uma nova redefinição de senha.');
    await run('UPDATE usuarios SET senha_hash = ? WHERE id = ?', [hash, reg.usuario_id]);
    await run('DELETE FROM sessoes WHERE usuario_id = ?', [reg.usuario_id]);   // encerra todos os acessos
  });
  await Tentativas.limparAntigas().catch(() => {});
}

async function alterarSenha(usuarioId, atual, nova, sessaoId) {
  const u = await Usuario.comSenha(usuarioId);
  if (!u || !(await bcrypt.compare(atual, u.senha_hash))) {
    throw new AppError(400, 'A senha atual está incorreta.', { campos: { senhaAtual: 'Senha atual incorreta.' } });
  }
  await Usuario.atualizarSenha(usuarioId, await hashSenha(nova));
  await Sessao.removerDoUsuario(usuarioId, sessaoId);   // mantém só a sessão atual
}

module.exports = { registrar, entrar, solicitarRedefinicao, redefinirSenha, alterarSenha, hashSenha };
