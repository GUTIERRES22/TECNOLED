'use strict';
// Testes unitários da lógica pura (não exigem MySQL, SMTP nem dependências externas): npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const { rules, validate, passwordPolicy, cpfValido, cnpjValido, slugify, STATUS } = require('../src/utils/validators');
const { Limiter } = require('../src/utils/rateLimit');
const { randomToken, sha256, safeEqual, readCookie } = require('../src/utils/security');
const { scrub } = require('../src/utils/logger');
const { likeEscape } = require('../src/utils/http');

test('CPF e CNPJ: dígitos verificadores', () => {
  assert.ok(cpfValido('52998224725')); assert.ok(!cpfValido('52998224724')); assert.ok(!cpfValido('11111111111'));
  assert.ok(cnpjValido('11222333000181')); assert.ok(!cnpjValido('11222333000182')); assert.ok(!cnpjValido('00000000000000'));
  assert.deepEqual(rules.documento('529.982.247-25'), { value: '52998224725' });
  assert.deepEqual(rules.documento(''), { value: null });
  assert.ok(rules.documento('123').error);
});

test('e-mail: normaliza e rejeita inválidos', () => {
  assert.deepEqual(rules.email('  Maria@Exemplo.COM '), { value: 'maria@exemplo.com' });
  for (const x of ['', 'a', 'a@b', 'a b@c.com', 'a@b.c', '<x>@y.com']) assert.ok(rules.email(x).error, x);
  assert.deepEqual(rules.emailOpcional(''), { value: null });
});

test('telefone brasileiro', () => {
  assert.deepEqual(rules.telefone('(14) 99721-2607'), { value: '14997212607' });
  assert.deepEqual(rules.telefone('+55 14 3471-1234'), { value: '1434711234' });
  for (const x of ['', '123', '(10) 99999-9999', '(14) 89999-9999']) assert.ok(rules.telefone(x).error, x);
});

test('política de senha (limite de 72 bytes do bcrypt)', () => {
  assert.ok(!passwordPolicy('Abcdefg1').error);
  for (const x of ['curta1', 'somenteletras', '123456789012', 'senha1234', 'a1'.repeat(40), undefined]) assert.ok(passwordPolicy(x).error, String(x));
  assert.ok(passwordPolicy('é1'.repeat(30)).error, '60 caracteres com acento passam de 72 bytes');
});

test('validate() separa valores e erros; ignora campos desconhecidos', () => {
  const r = validate({ nome: rules.nome, email: rules.email }, { nome: 'Jo', email: 'x@y.com', tipo_usuario: 'ADMIN' });
  assert.equal(r.ok, false); assert.ok(r.errors.nome); assert.equal(r.values.email, 'x@y.com'); assert.equal('tipo_usuario' in r.values, false);
});

test('orçamento: quantidade, mensagem e cidade', () => {
  assert.deepEqual(rules.quantidade(''), { value: null }); assert.deepEqual(rules.quantidade('12'), { value: 12 });
  assert.ok(rules.quantidade('0').error); assert.ok(rules.quantidade('1.5').error);
  assert.ok(rules.mensagem('curto').error); assert.ok(rules.mensagem('x'.repeat(2001)).error);
});

test('status de orçamento: exatamente os seis exigidos', () => {
  assert.deepEqual(Object.values(STATUS), ['Aguardando análise', 'Em análise', 'Aguardando contato', 'Orçamento enviado', 'Aprovado', 'Recusado']);
});

test('slugify', () => assert.equal(slugify('Painéis de Senha  (LED)!'), 'paineis-de-senha-led'));

test('Limiter: bloqueia após o máximo e libera após a janela', () => {
  const l = new Limiter({ windowMs: 1000, max: 3 }); const t = 1_000_000;
  assert.ok(l.hit('ip', t).allowed && l.hit('ip', t).allowed && l.hit('ip', t).allowed);
  const r = l.hit('ip', t + 10); assert.equal(r.allowed, false); assert.ok(r.retryAfter >= 1);
  assert.ok(l.hit('outro', t).allowed, 'chaves independentes');
  assert.ok(l.hit('ip', t + 1001).allowed, 'nova janela');
  clearInterval(l.timer);
});

test('tokens: aleatórios, 43 caracteres, hash SHA-256 estável', () => {
  const a = randomToken(32); const b = randomToken(32);
  assert.notEqual(a, b); assert.match(a, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(sha256('x').length, 64); assert.equal(sha256('x'), sha256('x')); assert.notEqual(sha256(a), a);
  assert.ok(safeEqual('abc', 'abc')); assert.ok(!safeEqual('abc', 'abd')); assert.ok(!safeEqual('abc', 'abcd'));
});

test('readCookie', () => {
  assert.equal(readCookie('a=1; tl_sid=abc%20d; b=2', 'tl_sid'), 'abc d');
  assert.equal(readCookie('a=1', 'tl_sid'), null); assert.equal(readCookie(undefined, 'x'), null);
});

test('logger nunca expõe campos sensíveis', () => {
  const s = scrub({ email: 'a@b.com', senha: '123', nested: { token: 'x', senha_hash: 'y', ok: 1 } });
  assert.equal(s.senha, '[omitido]'); assert.equal(s.nested.token, '[omitido]'); assert.equal(s.nested.senha_hash, '[omitido]'); assert.equal(s.nested.ok, 1);
});

test('LIKE: escapa curingas', () => assert.equal(likeEscape('50%_\\'), '50\\%\\_\\\\'));
