'use strict';
const config = require('../config/env');
const Sessao = require('../models/sessao');
const { readCookie, safeEqual } = require('../utils/security');
const { AppError } = require('../utils/http');

const cookieOpts = (maxAgeMs) => ({
  httpOnly: true,
  secure: config.isProd,
  sameSite: 'lax',
  path: '/',
  ...(maxAgeMs ? { maxAge: maxAgeMs } : {}),   // sem maxAge = cookie de sessão do navegador
});

function setSessionCookie(res, sessao) {
  res.cookie(config.session.cookieName, sessao.token, cookieOpts(sessao.persistente ? sessao.maxAgeMs : 0));
}
function clearSessionCookie(res) {
  res.clearCookie(config.session.cookieName, cookieOpts(0));
}

/** Carrega a sessão (se houver) em req.user / req.sessao. Não bloqueia. */
async function loadSession(req, res, next) {
  try {
    const token = readCookie(req.headers.cookie, config.session.cookieName);
    if (token && token.length >= 32 && token.length <= 128) {
      const s = await Sessao.buscar(token);
      if (s) {
        req.user = { id: s.id, nome: s.nome, email: s.email, tipo: s.tipo_usuario };
        req.sessao = { id: s.sessao_id, csrf: s.csrf_token, token };
      } else clearSessionCookie(res);
    }
    next();
  } catch (e) { next(e); }
}

const requireAuth = (req, res, next) => (req.user ? next() : next(new AppError(401, 'Faça login para continuar.')));

const requireRole = (...tipos) => (req, res, next) => {
  if (!req.user) return next(new AppError(401, 'Faça login para continuar.'));
  if (!tipos.includes(req.user.tipo)) return next(new AppError(403, 'Você não tem permissão para esta ação.'));
  next();
};

/** Em requisições de escrita autenticadas, exige o token CSRF da sessão. */
function requireCsrf(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const t = req.get('x-csrf-token');
  if (!req.sessao || !t || !safeEqual(t, req.sessao.csrf)) return next(new AppError(403, 'Sessão inválida. Atualize a página e tente novamente.'));
  next();
}

module.exports = { loadSession, requireAuth, requireRole, requireCsrf, setSessionCookie, clearSessionCookie };
