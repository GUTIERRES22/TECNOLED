'use strict';
const { query } = require('../config/db');

/** Chaves editáveis no painel. "publica" = enviada ao site público. */
const CHAVES = {
  WHATSAPP_COMERCIAL: { rotulo: 'WhatsApp comercial (somente dígitos, com 55 e DDD)', publica: true },
  TELEFONE: { rotulo: 'Telefone', publica: true },
  EMAIL: { rotulo: 'E-mail comercial', publica: true },
  ENDERECO: { rotulo: 'Endereço', publica: true },
  CNPJ: { rotulo: 'CNPJ', publica: true },
  HORARIO: { rotulo: 'Horário de funcionamento', publica: true },
  AREA_ATENDIMENTO: { rotulo: 'Área de atendimento', publica: true },
  INSTALACAO: { rotulo: 'Texto sobre instalação', publica: true },
  ENTREGA: { rotulo: 'Texto sobre prazo e entrega', publica: true },
  GARANTIA: { rotulo: 'Texto sobre garantia', publica: true },
  INSTAGRAM: { rotulo: 'Link do Instagram (https://...)', publica: true },
};

module.exports = {
  CHAVES,
  async todas() {
    const rows = await query('SELECT chave, valor FROM configuracoes');
    const m = {}; for (const k of Object.keys(CHAVES)) m[k] = '';
    for (const r of rows) if (r.chave in CHAVES) m[r.chave] = r.valor;
    return m;
  },
  async salvar(valores) {
    for (const [k, v] of Object.entries(valores)) {
      await query('INSERT INTO configuracoes (chave, valor) VALUES (?, ?) ON DUPLICATE KEY UPDATE valor = VALUES(valor)', [k, v]);
    }
  },
};
