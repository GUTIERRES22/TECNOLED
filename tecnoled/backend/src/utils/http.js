'use strict';
class AppError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.expose = true;
    Object.assign(this, extra);
  }
}
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function clientIp(req) {
  return (req.ip || req.socket?.remoteAddress || '').replace(/^::ffff:/, '').slice(0, 45);
}
function paginar(query, porPagina = 20) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  return { page, limit: porPagina, offset: (page - 1) * porPagina };
}
/** Escapa % _ \ para uso seguro dentro de LIKE. */
const likeEscape = (s) => String(s).replace(/[\\%_]/g, (c) => '\\' + c);

module.exports = { AppError, asyncHandler, clientIp, paginar, likeEscape };
