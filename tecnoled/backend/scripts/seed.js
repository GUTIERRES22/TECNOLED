'use strict';
// Importa categorias, produtos e configurações iniciais. Não sobrescreve o que já existe.
const fs = require('fs');
const path = require('path');
const { query, one, pool } = require('../src/config/db');

(async () => {
  try {
    const data = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../database/seed-data.json'), 'utf8'));
    let ordem = 0; const catId = {};
    for (const [slug, nome] of Object.entries(data.categorias)) {
      await query('INSERT INTO categorias (slug, nome, ordem) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE slug = slug', [slug, nome, ordem += 10]);
      catId[slug] = (await one('SELECT id FROM categorias WHERE slug = ?', [slug])).id;
    }
    let novos = 0;
    for (const p of data.produtos) {
      if (await one('SELECT id FROM produtos WHERE slug = ?', [p.slug])) continue;
      await query(
        `INSERT INTO produtos (slug, nome, descricao, categoria_id, imagem, vantagens, aplicacoes, fotos_descricao, palavras_chave, ativo)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        [p.slug, p.nome, p.descricao, catId[p.categoria], p.imagem, JSON.stringify(p.vantagens), JSON.stringify(p.aplicacoes), JSON.stringify(p.fotos_descricao), p.palavras_chave]);
      novos++;
    }
    const cfg = { WHATSAPP_COMERCIAL: '5514997212607', INSTAGRAM: 'https://www.instagram.com/tecnoledpaineis/' };
    for (const [k, v] of Object.entries(cfg)) await query('INSERT INTO configuracoes (chave, valor) VALUES (?, ?) ON DUPLICATE KEY UPDATE chave = chave', [k, v]);
    console.log(`Catálogo importado: ${Object.keys(catId).length} categorias, ${novos} produtos novos.`);
  } catch (e) { console.error('Falha no seed:', e.code || '', e.message); process.exitCode = 1; }
  finally { await pool.end(); }
})();
