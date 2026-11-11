'use strict';
const log = require('../utils/logger');

const notFoundApi = (req, res) => res.status(404).json({ erro: 'Recurso não encontrado.' });

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  if (err.type === 'entity.parse.failed') return res.status(400).json({ erro: 'JSON inválido.' });
  if (err.type === 'entity.too.large') return res.status(413).json({ erro: 'Requisição grande demais.' });
  const status = err.status && err.status < 600 ? err.status : 500;
  if (status >= 500) log.error('erro não tratado', { metodo: req.method, rota: req.path, err });
  const body = { erro: status >= 500 ? 'Erro interno. Tente novamente em instantes.' : err.message };
  if (err.campos) body.campos = err.campos;
  res.status(status).json(body);
}
module.exports = { notFoundApi, errorHandler };
