'use strict';
const config = require('./src/config/env');
const log = require('./src/utils/logger');

try { config.validar(); } catch (e) { console.error(e.message); process.exit(1); }

const app = require('./src/app');
const { pool } = require('./src/config/db');
const Sessao = require('./src/models/sessao');
const Recuperacao = require('./src/models/recuperacao');
const Tentativas = require('./src/models/tentativas');

(async () => {
  try { await pool.query('SELECT 1'); } catch (e) {
    console.error('Não foi possível conectar ao MySQL:', e.code || e.message, '\nVerifique DB_HOST, DB_USER, DB_PASSWORD e DB_NAME no .env e rode "npm run db:init".');
    process.exit(1);
  }
  const limpar = () => Promise.all([Sessao.limparExpiradas(), Recuperacao.limparAntigos(), Tentativas.limparAntigas()]).catch((e) => log.warn('limpeza periódica falhou', { err: e }));
  limpar(); setInterval(limpar, 60 * 60 * 1000).unref();

  const server = app.listen(config.port, () => log.info(`Tecno LED no ar em ${config.appUrl} (porta ${config.port}, ${config.isProd ? 'produção' : 'desenvolvimento'})`));
  const parar = () => server.close(() => pool.end().finally(() => process.exit(0)));
  process.on('SIGTERM', parar); process.on('SIGINT', parar);
})();
process.on('unhandledRejection', (e) => log.error('promessa rejeitada', { err: e }));
