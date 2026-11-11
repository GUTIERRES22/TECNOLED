'use strict';
const config = require('../config/env');
const { AppError } = require('../utils/http');

const CSP = [
  "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:", "font-src 'self'", "connect-src 'self'",
  "form-action 'self'", "frame-ancestors 'none'", "base-uri 'self'", "object-src 'none'",
].join('; ');

function securityHeaders(req, res, next) {
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  if (config.isProd) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
}

const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Rejeita requisições de escrita vindas de outra origem e exige JSON (força preflight CORS). */
function originAndJson(req, res, next) {
  if (!UNSAFE.has(req.method)) return next();
  const origin = req.get('origin');
  if (origin) {
    const aceitas = new Set([config.appOrigin, `${req.protocol}://${req.get('host')}`]);
    if (!aceitas.has(origin)) return next(new AppError(403, 'Origem não permitida.'));
  }
  const len = Number(req.get('content-length') || 0);
  if ((len > 0 || req.get('transfer-encoding')) && !req.is('application/json')) {
    return next(new AppError(415, 'Envie os dados em JSON.'));
  }
  next();
}

const noStore = (req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); };

module.exports = { securityHeaders, originAndJson, noStore };
