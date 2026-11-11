'use strict';
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const int = (v, d) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : d; };
const bool = (v, d = false) => (v === undefined || v === '' ? d : /^(1|true|sim|yes)$/i.test(String(v)));

const isProd = process.env.NODE_ENV === 'production';
const appUrl = (process.env.APP_URL || `http://localhost:${int(process.env.PORT, 3000)}`).replace(/\/+$/, '');

const config = {
  isProd,
  port: int(process.env.PORT, 3000),
  appUrl,
  appOrigin: new URL(appUrl).origin,
  trustProxy: process.env.TRUST_PROXY === undefined ? 0 : (/^\d+$/.test(process.env.TRUST_PROXY) ? int(process.env.TRUST_PROXY, 0) : bool(process.env.TRUST_PROXY)),
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: int(process.env.DB_PORT, 3306),
    user: process.env.DB_USER || '',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || '',
    ssl: bool(process.env.DB_SSL) ? { minVersion: 'TLSv1.2' } : undefined,
  },
  session: {
    cookieName: isProd ? '__Host-tl_sid' : 'tl_sid',
    horas: int(process.env.SESSION_HORAS, 12),
    lembrarDias: int(process.env.SESSION_LEMBRAR_DIAS, 30),
  },
  // Só para testes automatizados: multiplica os limites de requisições. Sempre 1 em produção.
  rateMult: isProd ? 1 : Math.max(1, int(process.env.RATE_LIMIT_MULT, 1)),
  resetTokenMinutos: int(process.env.RESET_TOKEN_MINUTOS, 60),
  mail: {
    mode: (process.env.MAIL_MODE || (isProd ? 'smtp' : 'file')).toLowerCase(),
    host: process.env.SMTP_HOST || '',
    port: int(process.env.SMTP_PORT, 587),
    secure: bool(process.env.SMTP_SECURE),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.MAIL_FROM || 'Tecno LED <no-reply@localhost>',
    notificarOrcamento: (process.env.ORCAMENTO_NOTIFICAR_EMAIL || '').trim(),
  },
};

/** Falha cedo, com mensagem clara, quando a configuração é insuficiente. */
config.validar = function validar() {
  const erros = [];
  if (!config.db.user) erros.push('DB_USER não definido');
  if (!config.db.database) erros.push('DB_NAME não definido');
  if (isProd) {
    if (!appUrl.startsWith('https://')) erros.push('APP_URL deve começar com https:// em produção');
    if (config.mail.mode !== 'smtp') erros.push('MAIL_MODE deve ser "smtp" em produção');
  }
  if (config.mail.mode === 'smtp' && (!config.mail.host || !config.mail.user || !config.mail.pass)) {
    erros.push('SMTP_HOST, SMTP_USER e SMTP_PASS são obrigatórios com MAIL_MODE=smtp');
  }
  if (erros.length) {
    throw new Error('Configuração inválida (.env):\n - ' + erros.join('\n - '));
  }
};

module.exports = config;
