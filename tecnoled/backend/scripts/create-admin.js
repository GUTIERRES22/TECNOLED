'use strict';
/**
 * Cria um ADMINISTRADOR. É o único caminho para isso: o cadastro público só cria CLIENTE.
 *
 * Interativo:       npm run criar-admin
 * Não interativo:   ADMIN_NOME="Fulano" ADMIN_EMAIL=a@b.com ADMIN_SENHA='...' npm run criar-admin
 * Se já existir um ADMIN, é preciso confirmar (ou usar ADMIN_FORCAR=1) para criar outro.
 */
const readline = require('readline');
const { rules, passwordPolicy } = require('../src/utils/validators');
const Usuario = require('../src/models/usuario');
const { hashSenha } = require('../src/services/auth.service');
const { pool } = require('../src/config/db');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q, hidden) => new Promise((res) => {
  if (!hidden) return rl.question(q, res);
  const w = rl._writeToOutput; process.stdout.write(q);
  rl._writeToOutput = () => {};
  rl.question('', (a) => { rl._writeToOutput = w; process.stdout.write('\n'); res(a); });
});

(async () => {
  try {
    const env = process.env;
    if (await Usuario.existeAdmin() && env.ADMIN_FORCAR !== '1') {
      const r = (await ask('Já existe um administrador. Criar outro? (s/N) ')).trim().toLowerCase();
      if (r !== 's') { console.log('Nada foi alterado.'); return; }
    }
    const nome = rules.nome(env.ADMIN_NOME || await ask('Nome completo: '));
    const email = rules.email(env.ADMIN_EMAIL || await ask('E-mail (será o login): '));
    const tel = rules.telefone(env.ADMIN_TELEFONE || await ask('Telefone com DDD: '));
    const senha = env.ADMIN_SENHA || await ask('Senha (mín. 8, com letra e número): ', true);
    if (!env.ADMIN_SENHA && senha !== await ask('Repita a senha: ', true)) throw new Error('As senhas não coincidem.');
    for (const r of [nome, email, tel, passwordPolicy(senha)]) if (r.error) throw new Error(r.error);
    if (await Usuario.porEmail(email.value)) throw new Error('Já existe um usuário com este e-mail.');
    const id = await Usuario.criar({ nome: nome.value, empresa: 'Tecno LED', documento: null, email: email.value, telefone: tel.value, senhaHash: await hashSenha(senha), tipo: 'ADMIN' });
    console.log(`Administrador criado (id ${id}). Acesse /entrar com ${email.value}.`);
  } catch (e) { console.error('Erro:', e.message); process.exitCode = 1; }
  finally { rl.close(); await pool.end(); }
})();
