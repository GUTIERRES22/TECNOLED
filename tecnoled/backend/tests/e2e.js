'use strict';
/**
 * Teste de ponta a ponta contra um servidor REAL (Node + MySQL já configurados).
 *
 * Pré-requisitos: servidor rodando (npm start) com MAIL_MODE=file e NODE_ENV != production;
 *                 banco criado (db:init + db:seed); um ADMIN criado (npm run criar-admin).
 * Uso:
 *   E2E_ADMIN_EMAIL=admin@seudominio.com E2E_ADMIN_SENHA='...' npm run test:e2e
 *   (opcional) E2E_BASE=http://localhost:3000
 *
 * IMPORTANTE: suba o servidor de TESTE com RATE_LIMIT_MULT=20 (os limites por IP, como 10 cadastros/hora,
 * seriam estourados pela própria bateria). O multiplicador é ignorado quando NODE_ENV=production.
 *
 * Cria usuários de teste com e-mails únicos (e2e-<timestamp>-*@example.com) e orçamentos marcados como [E2E].
 */
const fs = require('fs');
const http = require('http');
const path = require('path');

const BASE = (process.env.E2E_BASE || 'http://localhost:3000').replace(/\/$/, '');
const ADMIN = { email: process.env.E2E_ADMIN_EMAIL, senha: process.env.E2E_ADMIN_SENHA };
const OUTBOX = path.resolve(__dirname, '../.mail-outbox');
const T = Date.now();
const SENHA = 'Teste1234x', SENHA2 = 'Outra5678y';

let passou = 0, falhou = 0;
const ok = (cond, nome, extra = '') => { if (cond) { passou++; console.log('  OK    ' + nome); } else { falhou++; console.log('  FALHA ' + nome + (extra ? '  -> ' + extra : '')); } };
const secao = (t) => console.log('\n' + t);

/** Cliente HTTP com "jar" de cookies e token CSRF, como um navegador. */
class Cli {
  constructor() { this.cookie = ''; this.csrf = null; }
  async req(method, url, body, opts = {}) {
    const headers = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (this.cookie) headers.Cookie = this.cookie;
    if (this.csrf && method !== 'GET' && !opts.semCsrf) headers['X-CSRF-Token'] = this.csrf;
    if (opts.origin) headers.Origin = opts.origin;
    const r = await fetch(BASE + url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual' });
    const set = r.headers.getSetCookie ? r.headers.getSetCookie() : [];
    for (const c of set) {
      const [kv] = c.split(';'); const [k, v] = kv.split('=');
      if (/Max-Age=0|Expires=Thu, 01 Jan 1970/i.test(c) || !v) this.cookie = this.cookie.split('; ').filter((x) => !x.startsWith(k + '=')).join('; ');
      else this.cookie = this.cookie.split('; ').filter((x) => x && !x.startsWith(k + '=')).concat(`${k}=${v}`).join('; ');
    }
    let data = null; try { data = await r.json(); } catch (_) { /* html/redirect */ }
    if (data && data.csrf) this.csrf = data.csrf;
    return { status: r.status, data, headers: r.headers, setCookie: set };
  }
  get(u, o) { return this.req('GET', u, undefined, o); }
  post(u, b, o) { return this.req('POST', u, b === undefined ? {} : b, o); }
  patch(u, b, o) { return this.req('PATCH', u, b, o); }
  put(u, b, o) { return this.req('PUT', u, b, o); }
  del(u, o) { return this.req('DELETE', u, undefined, o); }
}


/** POST com cabeçalho Origin garantido (o fetch do Node pode descartá-lo). */
function postComOrigem(cli, url, body, origin) {
  return new Promise((resolve, reject) => {
    const u = new URL(BASE + url); const data = JSON.stringify(body);
    const req = http.request({ hostname: u.hostname, port: u.port, path: u.pathname, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), Cookie: cli.cookie, 'X-CSRF-Token': cli.csrf, Origin: origin } },
    (res) => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
    req.on('error', reject); req.end(data);
  });
}

const novoUsuario = (tag) => ({ nome: 'Cliente Teste ' + tag, empresa: 'Empresa E2E', documento: '', email: `e2e-${T}-${tag}@example.com`, telefone: '(14) 99721-2607', senha: SENHA, confirmarSenha: SENHA, aceite: true });
const ultimoEmail = (para) => {
  if (!fs.existsSync(OUTBOX)) return null;
  const arqs = fs.readdirSync(OUTBOX).sort().reverse();
  for (const a of arqs) { const m = JSON.parse(fs.readFileSync(path.join(OUTBOX, a), 'utf8')); if (m.to === para) return m; }
  return null;
};
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  console.log('Testando', BASE);
  if (!ADMIN.email || !ADMIN.senha) { console.error('Defina E2E_ADMIN_EMAIL e E2E_ADMIN_SENHA.'); process.exit(2); }

  secao('1. Proteção de páginas privadas e rotas');
  const anon = new Cli();
  ok((await anon.get('/')).status === 200, 'site público abre');
  let r = await anon.get('/conta'); ok(r.status === 302 && /\/entrar/.test(r.headers.get('location')), '/conta sem login redireciona para /entrar', r.status);
  r = await anon.get('/admin'); ok(r.status === 302 && /\/entrar/.test(r.headers.get('location')), '/admin sem login redireciona para /entrar', r.status);
  r = await anon.get('/private/admin.html'); ok(r.status === 404, 'arquivo privado não é servido diretamente', r.status);
  r = await anon.get('/api/conta/resumo'); ok(r.status === 401, 'API da área do cliente exige login');
  r = await anon.get('/api/admin/indicadores'); ok(r.status === 401, 'API admin exige login');
  r = await anon.get('/api/public/catalogo'); ok(r.status === 200 && r.data.P.length > 0, 'catálogo público vem do banco (' + (r.data?.P?.length) + ' produtos)');

  secao('2. Cadastro');
  const u1 = novoUsuario('a'); const A = new Cli();
  r = await A.post('/api/auth/cadastro', { ...u1, senha: '123', confirmarSenha: '123' }); ok(r.status === 422 && r.data.campos.senha, 'senha fraca recusada');
  r = await A.post('/api/auth/cadastro', { ...u1, confirmarSenha: 'diferente1A' }); ok(r.status === 422 && r.data.campos.confirmarSenha, 'confirmação diferente recusada');
  r = await A.post('/api/auth/cadastro', { ...u1, aceite: false }); ok(r.status === 422 && r.data.campos.aceite, 'sem aceite dos termos recusado');
  r = await A.post('/api/auth/cadastro', { ...u1, email: 'invalido' }); ok(r.status === 422 && r.data.campos.email, 'e-mail inválido recusado');
  r = await A.post('/api/auth/cadastro', { ...u1, documento: '111.111.111-11' }); ok(r.status === 422 && r.data.campos.documento, 'CPF inválido recusado');
  r = await A.post('/api/auth/cadastro', u1);
  ok(r.status === 201 && r.data.usuario.tipo === 'CLIENTE', 'cadastro válido cria conta CLIENTE e já autentica');
  ok(r.setCookie.some((c) => /HttpOnly/i.test(c) && /SameSite=Lax/i.test(c)), 'cookie de sessão é HttpOnly + SameSite=Lax');
  r = await new Cli().post('/api/auth/cadastro', u1); ok(r.status === 409, 'e-mail duplicado recusado (409)');
  r = await new Cli().post('/api/auth/cadastro', { ...novoUsuario('b'), tipo_usuario: 'ADMIN', tipo: 'ADMIN' }); ok(r.status === 201 && r.data.usuario.tipo === 'CLIENTE', 'tentativa de se cadastrar como ADMIN é ignorada');

  secao('3. Sessão, logout e login');
  r = await A.get('/api/auth/me'); ok(r.data.usuario?.email === u1.email && !!r.data.csrf, '/me devolve o usuário logado');
  r = await A.post('/api/auth/logout', undefined, { semCsrf: true }); ok(r.status === 403, 'logout sem token CSRF é recusado');
  r = await A.post('/api/auth/logout'); ok(r.status === 200, 'logout com CSRF funciona');
  r = await A.get('/api/auth/me'); ok(r.data.usuario === null, 'após logout a sessão não vale mais');
  const B = new Cli();
  r = await B.post('/api/auth/login', { email: u1.email, senha: 'SenhaErrada9' }); ok(r.status === 401 && /incorretos/.test(r.data.erro), 'senha incorreta -> 401 com mensagem genérica');
  r = await B.post('/api/auth/login', { email: 'naoexiste-' + T + '@example.com', senha: 'SenhaErrada9' }); ok(r.status === 401 && /incorretos/.test(r.data.erro), 'e-mail inexistente -> mesma mensagem (sem enumeração)');
  r = await B.post('/api/auth/login', { email: u1.email, senha: SENHA });
  ok(r.status === 200 && r.data.destino === '/conta', 'login correto');
  ok(!r.setCookie.some((c) => /Max-Age|Expires/i.test(c)), 'sem "permanecer conectado" o cookie é de sessão do navegador');
  const Bl = new Cli(); r = await Bl.post('/api/auth/login', { email: u1.email, senha: SENHA, lembrar: true });
  ok(r.setCookie.some((c) => /Max-Age=\d{6,}/i.test(c)), '"permanecer conectado" cria cookie persistente');
  r = await anon.get('/api/auth/me'); ok(r.data.usuario === null, 'cliente anônimo continua sem sessão');

  secao('4. CSRF e origem');
  r = await B.post('/api/conta/senha', { senhaAtual: SENHA, novaSenha: SENHA2, confirmarSenha: SENHA2 }, { semCsrf: true }); ok(r.status === 403, 'escrita autenticada sem token CSRF -> 403');
  ok(await postComOrigem(B, '/api/conta/senha', { senhaAtual: SENHA, novaSenha: SENHA2, confirmarSenha: SENHA2 }, 'https://site-malicioso.example') === 403, 'escrita vinda de outra origem -> 403 (mesmo com CSRF válido)');

  secao('5. Proteção contra força bruta');
  const bf = novoUsuario('bf'); await new Cli().post('/api/auth/cadastro', bf);
  const C = new Cli(); let ultimo;
  for (let i = 0; i < 6; i++) ultimo = await C.post('/api/auth/login', { email: bf.email, senha: 'Errada' + i + 'aaa' });
  ok(ultimo.status === 429, 'após 5 falhas o login é bloqueado (429)', ultimo.status);
  r = await C.post('/api/auth/login', { email: bf.email, senha: SENHA }); ok(r.status === 429, 'mesmo a senha correta é bloqueada durante o período');

  secao('6. Recuperação de senha');
  const rec = novoUsuario('rec'); await new Cli().post('/api/auth/cadastro', rec); const D = new Cli();
  const r1 = await D.post('/api/auth/esqueci-senha', { email: 'naoexiste-' + T + '@example.com' });
  const r2 = await D.post('/api/auth/esqueci-senha', { email: rec.email });
  ok(r1.status === 200 && r2.status === 200 && r1.data.mensagem === r2.data.mensagem, 'resposta idêntica para e-mail existente e inexistente');
  let mail = null; for (let i = 0; i < 20 && !mail; i++) { mail = ultimoEmail(rec.email); if (!mail) await esperar(250); }
  ok(!!mail, 'e-mail de redefinição foi enviado (arquivo em backend/.mail-outbox)');
  ok(!!mail && !mail.text.includes(SENHA), 'e-mail não contém senha');
  ok(!ultimoEmail('naoexiste-' + T + '@example.com'), 'nenhum e-mail para endereço inexistente');
  const token = mail && (mail.text.match(/#token=([A-Za-z0-9_-]{43})/) || [])[1];
  ok(!!token, 'link contém token aleatório de 43 caracteres no fragmento (#)');
  r = await D.post('/api/auth/redefinir-senha', { token: 'x'.repeat(43), senha: SENHA2, confirmarSenha: SENHA2 }); ok(r.status === 400, 'token inventado é recusado');
  r = await D.post('/api/auth/redefinir-senha', { token, senha: '123', confirmarSenha: '123' }); ok(r.status === 422, 'nova senha fraca é recusada (token continua válido)');
  r = await D.post('/api/auth/redefinir-senha', { token, senha: SENHA2, confirmarSenha: 'outra' }); ok(r.status === 422, 'confirmação diferente é recusada');
  const sessaoAntiga = new Cli(); await sessaoAntiga.post('/api/auth/login', { email: rec.email, senha: SENHA });
  r = await D.post('/api/auth/redefinir-senha', { token, senha: SENHA2, confirmarSenha: SENHA2 }); ok(r.status === 200, 'redefinição com token válido');
  r = await D.post('/api/auth/redefinir-senha', { token, senha: SENHA2 + 'z', confirmarSenha: SENHA2 + 'z' }); ok(r.status === 400, 'token é de uso único (reuso recusado)');
  r = await new Cli().post('/api/auth/login', { email: rec.email, senha: SENHA }); ok(r.status === 401, 'senha antiga deixa de funcionar');
  r = await new Cli().post('/api/auth/login', { email: rec.email, senha: SENHA2 }); ok(r.status === 200, 'nova senha funciona');
  r = await sessaoAntiga.get('/api/auth/me'); ok(r.data.usuario === null, 'sessões antigas foram encerradas após a redefinição');

  secao('7. Área do cliente: perfil e senha');
  r = await B.patch('/api/conta/perfil', { nome: 'Cliente Editado', empresa: 'Nova Empresa', documento: '', telefone: '(14) 3471-1234' }); ok(r.status === 200 && r.data.usuario.nome === 'Cliente Editado', 'editar perfil');
  r = await B.patch('/api/conta/perfil', { nome: 'X', telefone: '1' }); ok(r.status === 422, 'perfil inválido recusado');
  r = await B.post('/api/conta/senha', { senhaAtual: 'errada123A', novaSenha: SENHA2, confirmarSenha: SENHA2 }); ok(r.status === 400, 'alterar senha exige a senha atual correta');
  r = await B.post('/api/conta/senha', { senhaAtual: SENHA, novaSenha: SENHA2, confirmarSenha: SENHA2 }); ok(r.status === 200, 'alterar senha');
  r = await B.get('/api/auth/me'); ok(!!r.data.usuario, 'a sessão atual continua ativa após trocar a senha');
  r = await new Cli().post('/api/auth/login', { email: u1.email, senha: SENHA2 }); ok(r.status === 200, 'login com a senha alterada');

  secao('8. Orçamentos');
  const cat = (await anon.get('/api/public/catalogo')).data; const slug = cat.P[0].id;
  const base = { nome: 'Visitante E2E', telefone: '(14) 99721-2607', cidade: 'Garça/SP', produto: slug, quantidade: '2', mensagem: '[E2E] Preciso de orçamento de teste automatizado' };
  r = await anon.post('/api/orcamentos', { ...base, mensagem: 'curto' }); ok(r.status === 422, 'orçamento com mensagem curta recusado');
  r = await anon.post('/api/orcamentos', { ...base, produto: 'produto-que-nao-existe' }); ok(r.status === 422, 'produto inexistente recusado');
  r = await anon.post('/api/orcamentos', base); ok(r.status === 201 && r.data.associadoAConta === false, 'visitante consegue pedir orçamento (sem conta)');
  const U = new Cli(); await U.post('/api/auth/login', { email: u1.email, senha: SENHA2 });
  r = await U.post('/api/orcamentos', { ...base, nome: undefined, telefone: undefined }); ok(r.status === 201 && r.data.associadoAConta === true, 'logado: pedido é associado à conta (dados vêm do perfil)');
  const idMeu = r.data.id;
  const V = new Cli(); await V.post('/api/auth/login', { email: rec.email, senha: SENHA2 });
  r = await V.post('/api/orcamentos', base); const idOutro = r.data.id;
  r = await U.get('/api/conta/orcamentos'); ok(r.data.itens.some((o) => o.id === idMeu) && !r.data.itens.some((o) => o.id === idOutro), 'histórico lista só os pedidos do próprio cliente');
  r = await U.get('/api/conta/orcamentos/' + idOutro); ok(r.status === 404, 'cliente NÃO vê orçamento de outra pessoa (404)');
  r = await U.get('/api/conta/orcamentos/' + idMeu); ok(r.status === 200 && r.data.status === 'AGUARDANDO_ANALISE' && r.data.historico.length === 1, 'detalhe do próprio orçamento com status inicial');

  secao('9. Painel administrativo');
  r = await U.get('/api/admin/indicadores'); ok(r.status === 403, 'cliente não acessa API admin (403)');
  r = await U.get('/api/admin/usuarios'); ok(r.status === 403, 'cliente não lista usuários');
  r = await U.patch('/api/admin/orcamentos/' + idMeu + '/status', { status: 'APROVADO' }); ok(r.status === 403, 'cliente não altera status');
  r = await U.get('/admin'); ok(r.status === 404, 'cliente não abre /admin pela URL (404)', r.status);
  const ADM = new Cli(); r = await ADM.post('/api/auth/login', ADMIN);
  ok(r.status === 200 && r.data.destino === '/admin', 'login do administrador');
  r = await ADM.get('/admin'); ok(r.status === 200, 'administrador abre /admin');
  r = await ADM.get('/api/admin/indicadores'); ok(r.status === 200 && r.data.orcamentos.total >= 3, 'indicadores gerais');
  r = await ADM.get('/api/admin/usuarios?q=' + encodeURIComponent(`e2e-${T}-a`)); ok(r.status === 200 && r.data.itens.length === 1, 'pesquisa de clientes');
  const uid = r.data.itens[0]?.id; r = await ADM.get('/api/admin/usuarios/' + uid); ok(r.status === 200 && !('senha_hash' in r.data.usuario), 'detalhe do usuário (sem senha_hash)');
  r = await ADM.get('/api/admin/orcamentos?q=E2E'); ok(r.status === 200 && r.data.total >= 3, 'lista e busca de orçamentos');
  r = await ADM.patch('/api/admin/orcamentos/' + idMeu + '/status', { status: 'INVALIDO' }); ok(r.status === 422, 'status inválido recusado');
  r = await ADM.patch('/api/admin/orcamentos/' + idMeu + '/status', { status: 'EM_ANALISE', nota: 'Estamos analisando seu pedido.', notaInterna: 'cliente teste' }); ok(r.status === 200, 'admin altera status com mensagem ao cliente');
  r = await U.get('/api/conta/orcamentos/' + idMeu);
  ok(r.data.status === 'EM_ANALISE' && r.data.historico.length === 2 && r.data.historico[1].nota === 'Estamos analisando seu pedido.', 'cliente enxerga novo status e a mensagem no histórico');
  ok(!('nota_interna' in r.data), 'nota interna NÃO é exposta ao cliente');
  for (const s of ['AGUARDANDO_CONTATO', 'ORCAMENTO_ENVIADO', 'APROVADO', 'RECUSADO']) { r = await ADM.patch('/api/admin/orcamentos/' + idMeu + '/status', { status: s }); if (r.status !== 200) ok(false, 'status ' + s); }
  ok(true, 'os seis status são aceitos');
  r = await ADM.patch('/api/admin/usuarios/' + uid + '/ativo', { ativo: false }); ok(r.status === 200, 'admin desativa conta');
  r = await new Cli().post('/api/auth/login', { email: u1.email, senha: SENHA2 }); ok(r.status === 401, 'conta desativada não entra');
  r = await U.get('/api/auth/me'); ok(r.data.usuario === null, 'sessão da conta desativada é encerrada');
  await ADM.patch('/api/admin/usuarios/' + uid + '/ativo', { ativo: true });

  secao('10. Catálogo e informações comerciais');
  r = await ADM.post('/api/admin/categorias', { nome: 'Categoria E2E ' + T, ordem: 99 }); ok(r.status === 201, 'criar categoria'); const cid = r.data.id;
  r = await ADM.post('/api/admin/produtos', { nome: 'Produto E2E ' + T, categoria_id: cid, descricao: 'Produto criado pelo teste automatizado.', vantagens: 'Rápido\nSeguro', aplicacoes: 'Testes', imagem: 'images/nao-existe.webp', ativo: true });
  ok(r.status === 201, 'criar produto'); const pid = r.data.id;
  r = await ADM.post('/api/admin/produtos', { nome: 'X', categoria_id: cid, descricao: 'curta' }); ok(r.status === 422, 'produto inválido recusado');
  r = await ADM.post('/api/admin/produtos', { nome: 'Produto XSS', categoria_id: cid, descricao: 'Descrição suficiente para validar.', imagem: 'javascript:alert(1)' }); ok(r.status === 422, 'URL de imagem perigosa recusada');
  r = await anon.get('/api/public/catalogo'); ok(r.data.P.some((p) => p.n === 'Produto E2E ' + T), 'produto novo aparece no site público');
  r = await ADM.put('/api/admin/produtos/' + pid, { nome: 'Produto E2E ' + T, categoria_id: cid, descricao: 'Produto oculto pelo teste.', ativo: false });
  ok(r.status === 200, 'editar/ocultar produto');
  r = await anon.get('/api/public/catalogo'); ok(!r.data.P.some((p) => p.n === 'Produto E2E ' + T), 'produto oculto some do site');
  r = await ADM.del('/api/admin/categorias/' + cid); ok(r.status === 409, 'categoria com produtos não pode ser removida');
  r = await ADM.del('/api/admin/produtos/' + pid); ok(r.status === 200, 'remover produto');
  r = await ADM.del('/api/admin/categorias/' + cid); ok(r.status === 200, 'remover categoria vazia');
  r = await ADM.put('/api/admin/configuracoes', { valores: { HORARIO: 'Seg a Sex, 8h às 18h (E2E)' } }); ok(r.status === 200, 'salvar informações comerciais');
  r = await anon.get('/api/public/config'); ok(r.data.HORARIO === 'Seg a Sex, 8h às 18h (E2E)', 'informação comercial aparece no site');
  await ADM.put('/api/admin/configuracoes', { valores: { HORARIO: '' } });

  secao('11. Cabeçalhos de segurança');
  r = await anon.get('/entrar'); ok(/default-src 'self'/.test(r.headers.get('content-security-policy') || ''), 'Content-Security-Policy presente');
  ok(r.headers.get('x-content-type-options') === 'nosniff' && r.headers.get('x-frame-options') === 'DENY', 'nosniff e X-Frame-Options');
  ok(!r.headers.get('x-powered-by'), 'sem X-Powered-By');

  console.log(`\nResultado: ${passou} OK, ${falhou} falha(s).`);
  console.log('Obs.: os usuários e orçamentos de teste continuam no banco (e-mails e2e-' + T + '-*@example.com); remova-os no painel se desejar.');
  process.exit(falhou ? 1 : 0);
})().catch((e) => { console.error('Erro inesperado no teste:', e); process.exit(1); });
