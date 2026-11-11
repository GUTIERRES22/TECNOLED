/* TECNO LED — painel do cliente. */
(function () {
  'use strict';
  const { esc, badge, fmtData, fmtTel, fmtDoc } = TL;
  const view = document.getElementById('view');
  let user = null;

  const ROTAS = { inicio, orcamentos, perfil, seguranca };

  async function init() {
    try { user = await TL.me(); } catch (e) { user = null; }
    if (!user) { location.replace('/entrar?next=/conta'); return; }
    if (user.tipo === 'ADMIN') { location.replace('/admin'); return; }
    document.getElementById('hello').textContent = user.nome.split(' ')[0];
    document.getElementById('sair').onclick = () => TL.logout();
    window.addEventListener('hashchange', rotear);
    rotear();
  }

  async function rotear() {
    const nome = (location.hash || '#inicio').slice(1).split('?')[0];
    const fn = ROTAS[nome] || inicio;
    document.querySelectorAll('.side a').forEach((a) => a.getAttribute('href') === '#' + (ROTAS[nome] ? nome : 'inicio') ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'));
    view.innerHTML = '<p class="empty2"><span class="spin"></span> Carregando...</p>';
    try { await fn(); } catch (e) { view.innerHTML = `<div class="alert erro" role="alert">${esc(e.message)}</div>`; }
    window.scrollTo(0, 0);
  }

  const linhaOrc = (o) => `<tr class="click" data-id="${o.id}" tabindex="0" role="button" aria-label="Ver solicitação ${o.id}">
    <td data-l="Nº" class="n">#${o.id}</td><td data-l="Produto">${esc(o.produto_nome)}</td><td data-l="Data" class="n">${fmtData(o.data_solicitacao)}</td><td data-l="Status">${badge(o.status)}</td></tr>`;
  const tabelaOrc = (itens) => `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Nº</th><th>Produto</th><th>Data</th><th>Status</th></tr></thead><tbody>${itens.map(linhaOrc).join('')}</tbody></table></div>`;
  const ligarLinhas = (root) => root.querySelectorAll('tr.click').forEach((tr) => {
    const abrir = () => detalhe(tr.dataset.id);
    tr.addEventListener('click', abrir); tr.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrir(); } });
  });

  /* ---------- Resumo ---------- */
  async function inicio() {
    const [resumo, lista] = await Promise.all([TL.get('/conta/resumo'), TL.get('/conta/orcamentos?page=1')]);
    const por = Object.fromEntries(resumo.porStatus.map((s) => [s.status, Number(s.n)]));
    const total = lista.total; const abertos = (por.AGUARDANDO_ANALISE || 0) + (por.EM_ANALISE || 0) + (por.AGUARDANDO_CONTATO || 0);
    view.innerHTML = `<h1>Olá, ${esc(user.nome.split(' ')[0])}!</h1>
<p class="lead2">Aqui você acompanha seus pedidos de orçamento e mantém seus dados em dia.</p>
<div class="actions" style="margin:0 0 18px"><a class="btn" href="/#orcamento">Solicitar novo orçamento</a><a class="btn o" href="/#produtos">Ver produtos</a></div>
<div class="stats"><div class="stat"><b>${total}</b><span>solicitações no total</span></div><div class="stat"><b>${abertos}</b><span>em andamento</span></div><div class="stat"><b>${por.ORCAMENTO_ENVIADO || 0}</b><span>orçamentos enviados</span></div><div class="stat"><b>${por.APROVADO || 0}</b><span>aprovados</span></div></div>
<h2>Últimas solicitações</h2>
<div class="panel">${lista.itens.length ? tabelaOrc(lista.itens.slice(0, 5)) + (total > 5 ? '<p style="margin:12px 0 0"><a href="#orcamentos">Ver todas</a></p>' : '') : '<div class="empty2"><p>Você ainda não fez nenhuma solicitação.</p><a class="btn" href="/#orcamento">Pedir meu primeiro orçamento</a></div>'}</div>
<div class="two" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px;margin-top:16px">
<div class="panel"><h2>Produtos de interesse</h2>${resumo.produtos.length ? `<ul style="margin:0;padding-left:18px">${resumo.produtos.map((p) => `<li>${esc(p.produto_nome)} <small style="color:var(--mut)">(${p.vezes}x)</small></li>`).join('')}</ul>` : '<p style="color:var(--mut);margin:0">Os produtos dos seus pedidos aparecerão aqui.</p>'}</div>
<div class="panel"><h2>Contato</h2><dl class="dl" style="grid-template-columns:90px 1fr"><dt>E-mail</dt><dd>${esc(user.email)}</dd><dt>Telefone</dt><dd>${esc(fmtTel(user.telefone))}</dd>${user.empresa ? `<dt>Empresa</dt><dd>${esc(user.empresa)}</dd>` : ''}</dl><p style="margin:12px 0 0"><a href="#perfil">Editar meus dados</a></p></div></div>`;
    ligarLinhas(view);
  }

  /* ---------- Histórico ---------- */
  let pagina = 1;
  async function orcamentos() {
    const r = await TL.get('/conta/orcamentos?page=' + pagina);
    const pags = Math.max(1, Math.ceil(r.total / r.porPagina));
    view.innerHTML = `<h1>Meus orçamentos</h1><p class="lead2">Toque em uma solicitação para ver o andamento e as mensagens da equipe.</p>
<div class="panel">${r.itens.length ? tabelaOrc(r.itens) : '<div class="empty2"><p>Nenhuma solicitação ainda.</p><a class="btn" href="/#orcamento">Solicitar orçamento</a></div>'}
${pags > 1 ? `<div class="pager"><button class="btn o sm" id="prev" ${pagina <= 1 ? 'disabled' : ''}>Anterior</button><span>Página ${pagina} de ${pags}</span><button class="btn o sm" id="next" ${pagina >= pags ? 'disabled' : ''}>Próxima</button></div>` : ''}</div>
<div class="actions"><a class="btn" href="/#orcamento">Solicitar novo orçamento</a></div>`;
    ligarLinhas(view);
    const p = document.getElementById('prev'); const n = document.getElementById('next');
    if (p) p.onclick = () => { pagina--; rotear(); }; if (n) n.onclick = () => { pagina++; rotear(); };
  }

  async function detalhe(id) {
    let o; try { o = await TL.get('/conta/orcamentos/' + id); } catch (e) { return TL.toast(e.message, true); }
    const back = document.createElement('div'); back.className = 'dlg-back';
    back.innerHTML = `<div class="dlg" role="dialog" aria-modal="true" aria-labelledby="dt"><div class="dlg-h"><h2 id="dt">Solicitação #${o.id}</h2><button class="btn o sm" type="button" id="fechar">Fechar</button></div>
<p>${badge(o.status)}</p>
<dl class="dl"><dt>Produto</dt><dd>${esc(o.produto_nome)}</dd>${o.quantidade ? `<dt>Quantidade</dt><dd>${o.quantidade}</dd>` : ''}<dt>Enviada em</dt><dd>${fmtData(o.data_solicitacao, true)}</dd><dt>Sua mensagem</dt><dd style="white-space:pre-wrap">${esc(o.mensagem)}</dd></dl>
<h2>Andamento</h2><ol class="timeline" style="list-style:none">${o.historico.map((h) => `<li><strong>${esc(TL.STATUS[h.status_novo] || h.status_novo)}</strong><br><small>${fmtData(h.data, true)}</small>${h.nota ? `<div class="nota">${esc(h.nota)}</div>` : ''}</li>`).join('')}</ol></div>`;
    const fechar = () => { back.remove(); document.removeEventListener('keydown', esc2); };
    const esc2 = (e) => { if (e.key === 'Escape') fechar(); };
    back.addEventListener('click', (e) => { if (e.target === back) fechar(); });
    document.addEventListener('keydown', esc2); document.body.appendChild(back);
    back.querySelector('#fechar').onclick = fechar; back.querySelector('#fechar').focus();
  }

  /* ---------- Perfil ---------- */
  async function perfil() {
    const u = (await TL.get('/auth/me')).usuario;
    view.innerHTML = `<h1>Meu perfil</h1><p class="lead2">Mantenha seus dados atualizados para agilizar o atendimento.</p>
<div class="panel"><form id="fp" novalidate style="max-width:560px"><div class="alert erro" id="m" role="alert" hidden></div>
<label for="nome">Nome completo</label><input id="nome" name="nome" value="${esc(u.nome)}" autocomplete="name" required aria-invalid="false"><div class="err" id="e-nome"></div>
<label for="empresa">Empresa <small>(opcional)</small></label><input id="empresa" name="empresa" value="${esc(u.empresa || '')}" autocomplete="organization" aria-invalid="false"><div class="err" id="e-empresa"></div>
<div class="row2"><div><label for="documento">CPF ou CNPJ <small>(opcional)</small></label><input id="documento" name="documento" value="${esc(fmtDoc(u.documento))}" inputmode="numeric" aria-invalid="false"><div class="err" id="e-documento"></div></div>
<div><label for="telefone">Telefone / WhatsApp</label><input id="telefone" name="telefone" value="${esc(fmtTel(u.telefone))}" type="tel" autocomplete="tel" required aria-invalid="false"><div class="err" id="e-telefone"></div></div></div>
<label for="email">E-mail <small>(para alterar, fale com a equipe)</small></label><input id="email" value="${esc(u.email)}" disabled>
<div class="actions"><button class="btn" type="submit">Salvar alterações</button></div></form></div>`;
    const f = document.getElementById('fp'); TL.maskTel(f.telefone); TL.maskDoc(f.documento);
    f.addEventListener('submit', async (e) => {
      e.preventDefault(); const b = f.querySelector('button[type=submit]'); TL.mostrarErros(f, {}); TL.busy(b, true);
      try {
        const r = await TL.patch('/conta/perfil', { nome: f.nome.value, empresa: f.empresa.value, documento: f.documento.value, telefone: f.telefone.value });
        user = { ...user, nome: r.usuario.nome }; document.getElementById('hello').textContent = r.usuario.nome.split(' ')[0]; TL.toast(r.mensagem);
      } catch (err) { if (err.campos) TL.mostrarErros(f, err.campos); TL.toast(err.message, true); } finally { TL.busy(b, false); }
    });
  }

  /* ---------- Senha ---------- */
  async function seguranca() {
    view.innerHTML = `<h1>Senha e segurança</h1><p class="lead2">Ao trocar a senha, os outros dispositivos conectados são desconectados.</p>
<div class="panel"><form id="fs" novalidate style="max-width:460px">
<label for="senhaAtual">Senha atual</label><div class="pw"><input id="senhaAtual" name="senhaAtual" type="password" autocomplete="current-password" required aria-invalid="false"><button type="button" aria-pressed="false" aria-label="Mostrar ou ocultar">Mostrar</button></div><div class="err" id="e-senhaAtual"></div>
<label for="novaSenha">Nova senha</label><div class="pw"><input id="novaSenha" name="novaSenha" type="password" autocomplete="new-password" required aria-invalid="false"><button type="button" aria-pressed="false" aria-label="Mostrar ou ocultar">Mostrar</button></div><div class="meter" aria-hidden="true"><i></i></div><div class="hint">Mínimo de 8 caracteres, com letras e números.</div><div class="err" id="e-novaSenha"></div>
<label for="confirmarSenha">Confirme a nova senha</label><div class="pw"><input id="confirmarSenha" name="confirmarSenha" type="password" autocomplete="new-password" required aria-invalid="false"><button type="button" aria-pressed="false" aria-label="Mostrar ou ocultar">Mostrar</button></div><div class="err" id="e-confirmarSenha"></div>
<div class="actions"><button class="btn" type="submit">Alterar senha</button></div></form></div>
<div class="panel"><h2>Sair da conta</h2><p style="margin:0 0 12px;color:var(--mut)">Encerra o acesso neste dispositivo.</p><button class="btn o" id="sair2" type="button">Sair da conta</button></div>`;
    const f = document.getElementById('fs'); TL.pwToggle(f); TL.forca(f.novaSenha, f.querySelector('.meter'));
    document.getElementById('sair2').onclick = () => TL.logout();
    f.addEventListener('submit', async (e) => {
      e.preventDefault(); const b = f.querySelector('button[type=submit]'); TL.mostrarErros(f, {}); TL.busy(b, true);
      try { const r = await TL.post('/conta/senha', { senhaAtual: f.senhaAtual.value, novaSenha: f.novaSenha.value, confirmarSenha: f.confirmarSenha.value }); f.reset(); TL.toast(r.mensagem); }
      catch (err) { if (err.campos) TL.mostrarErros(f, err.campos); TL.toast(err.message, true); } finally { TL.busy(b, false); }
    });
  }

  init();
})();
