/* TECNO LED — painel administrativo. O servidor valida a função ADMIN em toda chamada da API. */
(function () {
  'use strict';
  const { esc, badge, fmtData, fmtTel, fmtDoc, STATUS } = TL;
  const view = document.getElementById('view');
  const ROTAS = { painel, orcamentos, usuarios, produtos, categorias, config };
  const st = { orc: { page: 1, status: '', q: '' }, usr: { page: 1, q: '' } };
  let eu = null;

  async function init() {
    try { eu = await TL.me(); } catch (e) { eu = null; }
    if (!eu) { location.replace('/entrar?next=/admin'); return; }
    if (eu.tipo !== 'ADMIN') { location.replace('/conta'); return; }
    document.getElementById('hello').textContent = eu.nome.split(' ')[0];
    document.getElementById('sair').onclick = () => TL.logout();
    window.addEventListener('hashchange', rotear); rotear();
  }
  async function rotear() {
    const nome = (location.hash || '#painel').slice(1).split('?')[0]; const ok = !!ROTAS[nome];
    document.querySelectorAll('.side a').forEach((a) => a.getAttribute('href') === '#' + (ok ? nome : 'painel') ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'));
    view.innerHTML = '<p class="empty2"><span class="spin"></span> Carregando...</p>';
    try { await (ROTAS[nome] || painel)(); } catch (e) { view.innerHTML = `<div class="alert erro" role="alert">${esc(e.message)}</div>`; }
  }

  /* ----- utilidades ----- */
  function dialogo(titulo, html, aoAbrir) {
    const back = document.createElement('div'); back.className = 'dlg-back';
    back.innerHTML = `<div class="dlg" role="dialog" aria-modal="true" aria-labelledby="dt"><div class="dlg-h"><h2 id="dt">${esc(titulo)}</h2><button class="btn o sm" type="button" data-x>Fechar</button></div><div data-body>${html}</div></div>`;
    const fechar = () => { back.remove(); document.removeEventListener('keydown', tecla); };
    const tecla = (e) => { if (e.key === 'Escape') fechar(); };
    back.addEventListener('click', (e) => { if (e.target === back) fechar(); });
    back.querySelector('[data-x]').onclick = fechar; document.addEventListener('keydown', tecla); document.body.appendChild(back);
    back.querySelector('[data-x]').focus(); if (aoAbrir) aoAbrir(back.querySelector('[data-body]'), fechar); return fechar;
  }
  const pager = (pagina, total, por) => { const n = Math.max(1, Math.ceil(total / por)); return n > 1 ? `<div class="pager"><button class="btn o sm" data-pg="-1" ${pagina <= 1 ? 'disabled' : ''}>Anterior</button><span>Página ${pagina} de ${n}</span><button class="btn o sm" data-pg="1" ${pagina >= n ? 'disabled' : ''}>Próxima</button></div>` : ''; };
  const ligarPager = (s) => view.querySelectorAll('[data-pg]').forEach((b) => { b.onclick = () => { s.page += +b.dataset.pg; rotear(); }; });
  const debounce = (fn, ms = 350) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const opts = (obj, sel) => Object.entries(obj).map(([k, v]) => `<option value="${esc(k)}" ${k === sel ? 'selected' : ''}>${esc(v)}</option>`).join('');
  const salvar = async (f, fn, ok) => {
    const b = f.querySelector('button[type=submit]'); TL.mostrarErros(f, {}); TL.busy(b, true);
    try { const r = await fn(); TL.toast(r?.mensagem || 'Salvo.'); if (ok) ok(r); }
    catch (e) { if (e.campos) TL.mostrarErros(f, e.campos); TL.toast(e.message, true); } finally { TL.busy(b, false); }
  };

  /* ----- indicadores ----- */
  async function painel() {
    const d = await TL.get('/admin/indicadores'); const por = Object.fromEntries(d.porStatus.map((s) => [s.status, s.n])); const max = Math.max(1, ...d.porStatus.map((s) => s.n));
    view.innerHTML = `<h1>Indicadores</h1><p class="lead2">Visão geral do site.</p>
<div class="stats"><div class="stat"><b>${d.clientes.total}</b><span>clientes cadastrados</span></div><div class="stat"><b>${d.clientes.novos30}</b><span>novos nos últimos 30 dias</span></div><div class="stat"><b>${d.orcamentos.total}</b><span>orçamentos no total</span></div><div class="stat"><b>${d.orcamentos.ultimos30}</b><span>orçamentos em 30 dias</span></div><div class="stat"><b>${por.AGUARDANDO_ANALISE || 0}</b><span>aguardando análise</span></div><div class="stat"><b>${d.produtos.ativos}/${d.produtos.total}</b><span>produtos ativos</span></div></div>
<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px;margin-top:18px">
<div class="panel"><h2>Orçamentos por status</h2><div class="bars">${Object.keys(STATUS).map((k) => `<div class="bar-r"><span>${esc(STATUS[k])}</span><i style="width:${Math.round(((por[k] || 0) / max) * 100)}%;min-width:${por[k] ? 6 : 0}px"></i><span>${por[k] || 0}</span></div>`).join('')}</div></div>
<div class="panel"><h2>Produtos mais pedidos</h2>${d.topProdutos.length ? `<ol style="margin:0;padding-left:20px">${d.topProdutos.map((t) => `<li>${esc(t.produto_nome)} <small style="color:var(--mut)">(${t.n})</small></li>`).join('')}</ol>` : '<p class="empty2">Sem dados ainda.</p>'}<p class="hint">${d.orcamentos.visitantes} pedido(s) vieram de visitantes sem conta.</p></div></div>
<h2>Solicitações recentes</h2><div class="panel">${d.recentes.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Nº</th><th>Cliente</th><th>Produto</th><th>Data</th><th>Status</th></tr></thead><tbody>${d.recentes.map((o) => `<tr class="click" data-id="${o.id}" tabindex="0"><td data-l="Nº">#${o.id}</td><td data-l="Cliente">${esc(o.contato_nome)}</td><td data-l="Produto">${esc(o.produto_nome)}</td><td data-l="Data">${fmtData(o.data_solicitacao)}</td><td data-l="Status">${badge(o.status)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="empty2">Nenhuma solicitação ainda.</p>'}</div>`;
    view.querySelectorAll('tr.click').forEach((tr) => { tr.onclick = () => abrirOrc(tr.dataset.id); tr.onkeydown = (e) => { if (e.key === 'Enter') abrirOrc(tr.dataset.id); }; });
  }

  /* ----- orçamentos ----- */
  async function orcamentos() {
    const foco = document.activeElement && document.activeElement.id === 'q';
    const s = st.orc; const r = await TL.get(`/admin/orcamentos?page=${s.page}&status=${encodeURIComponent(s.status)}&q=${encodeURIComponent(s.q)}`);
    view.innerHTML = `<h1>Orçamentos</h1>
<div class="toolbar"><input id="q" type="search" placeholder="Buscar por nome, e-mail, empresa, produto ou nº" value="${esc(s.q)}" aria-label="Buscar"><select id="fs" aria-label="Filtrar por status"><option value="">Todos os status</option>${opts(STATUS, s.status)}</select></div>
<div class="panel">${r.itens.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Nº</th><th>Cliente</th><th>Produto</th><th>Data</th><th>Status</th></tr></thead><tbody>${r.itens.map((o) => `<tr class="click" data-id="${o.id}" tabindex="0"><td data-l="Nº">#${o.id}</td><td data-l="Cliente">${esc(o.contato_nome)}${o.contato_empresa ? `<br><small style="color:var(--mut)">${esc(o.contato_empresa)}</small>` : ''}${o.usuario_id ? '' : ' <small style="color:var(--mut)">(visitante)</small>'}</td><td data-l="Produto">${esc(o.produto_nome)}</td><td data-l="Data" class="n">${fmtData(o.data_solicitacao)}</td><td data-l="Status">${badge(o.status)}</td></tr>`).join('')}</tbody></table></div>${pager(s.page, r.total, r.porPagina)}` : '<p class="empty2">Nenhuma solicitação encontrada.</p>'}</div>`;
    const qi = view.querySelector('#q'); if (foco) { qi.focus(); qi.setSelectionRange(qi.value.length, qi.value.length); }
    qi.oninput = debounce((e) => { s.q = e.target.value; s.page = 1; orcamentos(); });
    view.querySelector('#fs').onchange = (e) => { s.status = e.target.value; s.page = 1; orcamentos(); };
    view.querySelectorAll('tr.click').forEach((tr) => { tr.onclick = () => abrirOrc(tr.dataset.id); tr.onkeydown = (e) => { if (e.key === 'Enter') abrirOrc(tr.dataset.id); }; });
    ligarPager(s);
  }

  async function abrirOrc(id) {
    let o; try { o = await TL.get('/admin/orcamentos/' + id); } catch (e) { return TL.toast(e.message, true); }
    dialogo('Solicitação #' + o.id, `<p>${badge(o.status)}</p>
<dl class="dl"><dt>Cliente</dt><dd>${esc(o.contato_nome)}${o.usuario_id ? ` <small>(conta #${o.usuario_id})</small>` : ' <small>(visitante)</small>'}</dd>${o.contato_empresa ? `<dt>Empresa</dt><dd>${esc(o.contato_empresa)}</dd>` : ''}<dt>Telefone</dt><dd><a href="https://wa.me/55${esc(o.contato_telefone)}" target="_blank" rel="noopener">${esc(fmtTel(o.contato_telefone))}</a></dd>${o.contato_email ? `<dt>E-mail</dt><dd><a href="mailto:${esc(o.contato_email)}">${esc(o.contato_email)}</a></dd>` : ''}<dt>Cidade/UF</dt><dd>${esc(o.contato_cidade)}</dd><dt>Produto</dt><dd>${esc(o.produto_nome)}</dd>${o.quantidade ? `<dt>Quantidade</dt><dd>${o.quantidade}</dd>` : ''}<dt>Enviada em</dt><dd>${fmtData(o.data_solicitacao, true)}</dd><dt>Mensagem</dt><dd style="white-space:pre-wrap">${esc(o.mensagem)}</dd></dl>
<h2>Alterar status</h2>
<form id="fo" novalidate><label for="status">Novo status</label><select id="status" name="status">${opts(STATUS, o.status)}</select><div class="err" id="e-status"></div>
<label for="nota">Mensagem ao cliente <small>(aparece no histórico dele)</small></label><textarea id="nota" name="nota" rows="3" maxlength="1000"></textarea><div class="err" id="e-nota"></div>
<label for="notaInterna">Nota interna <small>(somente equipe)</small></label><textarea id="notaInterna" name="notaInterna" rows="3" maxlength="4000" class="nota-int">${esc(o.nota_interna || '')}</textarea>
<div class="actions"><button class="btn" type="submit">Salvar</button></div></form>
<h2>Histórico</h2><ol class="timeline" style="list-style:none">${o.historico.map((h) => `<li><strong>${esc(STATUS[h.status_novo] || h.status_novo)}</strong><br><small>${fmtData(h.data, true)}${h.alterado_por_nome ? ' · ' + esc(h.alterado_por_nome) : ''}</small>${h.nota ? `<div class="nota">${esc(h.nota)}</div>` : ''}</li>`).join('')}</ol>`,
    (body, fechar) => {
      const f = body.querySelector('#fo');
      f.addEventListener('submit', (e) => { e.preventDefault(); salvar(f, () => TL.patch(`/admin/orcamentos/${o.id}/status`, { status: f.status.value, nota: f.nota.value, notaInterna: f.notaInterna.value }), () => { fechar(); rotear(); }); });
    });
  }

  /* ----- clientes ----- */
  async function usuarios() {
    const foco = document.activeElement && document.activeElement.id === 'q';
    const s = st.usr; const r = await TL.get(`/admin/usuarios?page=${s.page}&q=${encodeURIComponent(s.q)}`);
    view.innerHTML = `<h1>Clientes</h1><p class="lead2">${r.total} usuário(s) encontrado(s).</p>
<div class="toolbar"><input id="q" type="search" placeholder="Buscar por nome, e-mail, empresa, telefone ou documento" value="${esc(s.q)}" aria-label="Buscar"></div>
<div class="panel">${r.itens.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Nome</th><th>E-mail</th><th>Telefone</th><th>Pedidos</th><th>Cadastro</th></tr></thead><tbody>${r.itens.map((u) => `<tr class="click" data-id="${u.id}" tabindex="0"><td data-l="Nome">${esc(u.nome)}${u.empresa ? `<br><small style="color:var(--mut)">${esc(u.empresa)}</small>` : ''} ${u.tipo_usuario === 'ADMIN' ? '<span class="badge st-EM_ANALISE">Admin</span>' : ''}${u.ativo ? '' : ' <span class="badge st-RECUSADO">Desativado</span>'}</td><td data-l="E-mail">${esc(u.email)}</td><td data-l="Telefone" class="n">${esc(fmtTel(u.telefone))}</td><td data-l="Pedidos">${u.total_orcamentos}</td><td data-l="Cadastro" class="n">${fmtData(u.data_cadastro)}</td></tr>`).join('')}</tbody></table></div>${pager(s.page, r.total, r.porPagina)}` : '<p class="empty2">Nenhum usuário encontrado.</p>'}</div>`;
    const qi = view.querySelector('#q'); if (foco) { qi.focus(); qi.setSelectionRange(qi.value.length, qi.value.length); }
    qi.oninput = debounce((e) => { s.q = e.target.value; s.page = 1; usuarios(); });
    view.querySelectorAll('tr.click').forEach((tr) => { tr.onclick = () => abrirUsuario(tr.dataset.id); tr.onkeydown = (e) => { if (e.key === 'Enter') abrirUsuario(tr.dataset.id); }; });
    ligarPager(s);
  }
  async function abrirUsuario(id) {
    let r; try { r = await TL.get('/admin/usuarios/' + id); } catch (e) { return TL.toast(e.message, true); }
    const u = r.usuario;
    dialogo(u.nome, `<dl class="dl"><dt>E-mail</dt><dd>${esc(u.email)}</dd><dt>Telefone</dt><dd>${esc(fmtTel(u.telefone))}</dd>${u.empresa ? `<dt>Empresa</dt><dd>${esc(u.empresa)}</dd>` : ''}${u.documento ? `<dt>CPF/CNPJ</dt><dd>${esc(fmtDoc(u.documento))}</dd>` : ''}<dt>Função</dt><dd>${esc(u.tipo_usuario)}</dd><dt>Situação</dt><dd>${u.ativo ? 'Ativa' : 'Desativada'}</dd><dt>Cadastro</dt><dd>${fmtData(u.data_cadastro, true)}</dd></dl>
${u.id !== eu.id ? `<div class="actions"><button class="btn ${u.ativo ? 'danger' : ''}" id="tg" type="button">${u.ativo ? 'Desativar conta' : 'Reativar conta'}</button></div>` : ''}
<h2>Solicitações (${r.orcamentos.length})</h2>${r.orcamentos.length ? `<div class="tbl-wrap"><table class="tbl"><tbody>${r.orcamentos.map((o) => `<tr class="click" data-id="${o.id}" tabindex="0"><td data-l="Nº">#${o.id}</td><td data-l="Produto">${esc(o.produto_nome)}</td><td data-l="Data">${fmtData(o.data_solicitacao)}</td><td data-l="Status">${badge(o.status)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="empty2">Sem solicitações.</p>'}`,
    (body, fechar) => {
      const t = body.querySelector('#tg');
      if (t) t.onclick = async () => {
        if (u.ativo && !confirm('Desativar esta conta? O cliente será desconectado e não poderá entrar.')) return;
        try { const x = await TL.patch(`/admin/usuarios/${u.id}/ativo`, { ativo: !u.ativo }); TL.toast(x.mensagem); fechar(); rotear(); } catch (e) { TL.toast(e.message, true); }
      };
      body.querySelectorAll('tr.click').forEach((tr) => { tr.onclick = () => { fechar(); abrirOrc(tr.dataset.id); }; });
    });
  }

  /* ----- produtos ----- */
  async function produtos() {
    const [lista, cats] = await Promise.all([TL.get('/admin/produtos'), TL.get('/admin/categorias')]);
    view.innerHTML = `<h1>Produtos</h1><div class="actions" style="margin:0 0 14px"><button class="btn" id="novo" type="button">Novo produto</button></div>
<div class="panel">${lista.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Produto</th><th>Categoria</th><th>Situação</th><th></th></tr></thead><tbody>${lista.map((p) => `<tr><td data-l="Produto"><strong>${esc(p.nome)}</strong><br><small style="color:var(--mut)">/${esc(p.slug)}</small></td><td data-l="Categoria">${esc(p.categoria_nome)}</td><td data-l="Situação">${p.ativo ? 'Ativo' : '<span class="badge st-RECUSADO">Oculto</span>'}</td><td><button class="btn o sm" data-ed="${p.id}" type="button">Editar</button></td></tr>`).join('')}</tbody></table></div>` : '<p class="empty2">Nenhum produto.</p>'}</div>`;
    const abrir = (p) => formProduto(p, cats);
    view.querySelector('#novo').onclick = () => abrir(null);
    view.querySelectorAll('[data-ed]').forEach((b) => { b.onclick = () => abrir(lista.find((p) => p.id == b.dataset.ed)); });
  }
  function formProduto(p, cats) {
    if (!cats.length) return TL.toast('Cadastre uma categoria primeiro.', true);
    const v = p || { nome: '', descricao: '', categoria_id: cats[0].id, imagem: '', vantagens: [], aplicacoes: [], palavras_chave: '', ativo: true };
    dialogo(p ? 'Editar produto' : 'Novo produto', `<form id="fp" novalidate>
<label for="nome">Nome</label><input id="nome" name="nome" value="${esc(v.nome)}" maxlength="120" required><div class="err" id="e-nome"></div>
<label for="categoria_id">Categoria</label><select id="categoria_id" name="categoria_id">${cats.map((c) => `<option value="${c.id}" ${c.id == v.categoria_id ? 'selected' : ''}>${esc(c.nome)}</option>`).join('')}</select><div class="err" id="e-categoria_id"></div>
<label for="descricao">Descrição</label><textarea id="descricao" name="descricao" rows="4" maxlength="1500">${esc(v.descricao)}</textarea><div class="err" id="e-descricao"></div>
<label for="vantagens">Vantagens <small>(uma por linha)</small></label><textarea id="vantagens" name="vantagens" rows="4">${esc((v.vantagens || []).join('\n'))}</textarea>
<label for="aplicacoes">Aplicações recomendadas <small>(uma por linha)</small></label><textarea id="aplicacoes" name="aplicacoes" rows="3">${esc((v.aplicacoes || []).join('\n'))}</textarea>
<label for="imagem">Imagem <small>(caminho como images/foto.webp, já enviado à hospedagem, ou https://...)</small></label><input id="imagem" name="imagem" value="${esc(v.imagem || '')}"><div class="err" id="e-imagem"></div>
<label for="palavras_chave">Palavras para a busca <small>(separadas por espaço)</small></label><input id="palavras_chave" name="palavras_chave" value="${esc(v.palavras_chave || '')}">
<label class="chk" for="ativo"><input id="ativo" name="ativo" type="checkbox" ${v.ativo ? 'checked' : ''}><span>Produto visível no site</span></label>
<div class="actions"><button class="btn" type="submit">Salvar produto</button>${p ? '<button class="btn o danger" id="rm" type="button">Excluir</button>' : ''}</div></form>`,
    (body, fechar) => {
      const f = body.querySelector('#fp');
      f.addEventListener('submit', (e) => {
        e.preventDefault();
        const dados = { nome: f.nome.value, categoria_id: f.categoria_id.value, descricao: f.descricao.value, vantagens: f.vantagens.value, aplicacoes: f.aplicacoes.value, imagem: f.imagem.value, palavras_chave: f.palavras_chave.value, ativo: f.ativo.checked };
        salvar(f, () => (p ? TL.put('/admin/produtos/' + p.id, dados) : TL.post('/admin/produtos', dados)), () => { fechar(); rotear(); });
      });
      const rm = body.querySelector('#rm');
      if (rm) rm.onclick = async () => { if (!confirm('Excluir este produto definitivamente? Para só esconder do site, desmarque "Produto visível".')) return; try { const r = await TL.del('/admin/produtos/' + p.id); TL.toast(r.mensagem); fechar(); rotear(); } catch (e) { TL.toast(e.message, true); } };
    });
  }

  /* ----- categorias ----- */
  async function categorias() {
    const cats = await TL.get('/admin/categorias');
    view.innerHTML = `<h1>Categorias</h1>
<div class="panel"><form id="fc" novalidate class="toolbar" style="margin:0"><input name="nome" placeholder="Nome da nova categoria" aria-label="Nome da nova categoria" maxlength="80" required><input name="ordem" type="number" min="0" max="9999" placeholder="Ordem" aria-label="Ordem" style="max-width:110px"><button class="btn" type="submit">Adicionar</button></form><div class="err" id="e-nome"></div></div>
<div class="panel">${cats.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Nome</th><th>Ordem</th><th>Produtos</th><th></th></tr></thead><tbody>${cats.map((c) => `<tr><td data-l="Nome"><input value="${esc(c.nome)}" data-n="${c.id}" aria-label="Nome" maxlength="80"></td><td data-l="Ordem"><input type="number" value="${c.ordem}" data-o="${c.id}" aria-label="Ordem" style="max-width:100px"></td><td data-l="Produtos">${c.total_produtos}</td><td style="white-space:nowrap"><button class="btn o sm" data-s="${c.id}" type="button">Salvar</button> <button class="btn o sm danger" data-r="${c.id}" type="button" ${c.total_produtos ? 'disabled title="Remova ou mova os produtos antes"' : ''}>Excluir</button></td></tr>`).join('')}</tbody></table></div>` : '<p class="empty2">Nenhuma categoria.</p>'}</div>`;
    const f = view.querySelector('#fc');
    f.addEventListener('submit', (e) => { e.preventDefault(); salvar(f, () => TL.post('/admin/categorias', { nome: f.nome.value, ordem: f.ordem.value }).then(() => ({ mensagem: 'Categoria criada.' })), rotear); });
    view.querySelectorAll('[data-s]').forEach((b) => { b.onclick = async () => { const id = b.dataset.s; try { await TL.put('/admin/categorias/' + id, { nome: view.querySelector(`[data-n="${id}"]`).value, ordem: view.querySelector(`[data-o="${id}"]`).value }); TL.toast('Categoria atualizada.'); } catch (e) { TL.toast(e.campos?.nome || e.message, true); } }; });
    view.querySelectorAll('[data-r]').forEach((b) => { b.onclick = async () => { if (!confirm('Excluir esta categoria?')) return; try { await TL.del('/admin/categorias/' + b.dataset.r); TL.toast('Categoria removida.'); rotear(); } catch (e) { TL.toast(e.message, true); } }; });
  }

  /* ----- informações comerciais ----- */
  async function config() {
    const r = await TL.get('/admin/configuracoes');
    view.innerHTML = `<h1>Informações comerciais</h1><p class="lead2">Aparecem no site (contato, rodapé e perguntas frequentes). Campos vazios não são exibidos. A atualização no site pode levar até 1 minuto.</p>
<div class="panel"><form id="fg" novalidate style="max-width:620px">${Object.entries(r.campos).map(([k, rot]) => `<label for="${k}">${esc(rot)}</label>${/INSTALACAO|ENTREGA|GARANTIA/.test(k) ? `<textarea id="${k}" name="${k}" rows="2" maxlength="500">${esc(r.valores[k])}</textarea>` : `<input id="${k}" name="${k}" value="${esc(r.valores[k])}" maxlength="500">`}<div class="err" id="e-${k}"></div>`).join('')}
<div class="actions"><button class="btn" type="submit">Salvar informações</button></div></form></div>`;
    const f = view.querySelector('#fg');
    f.addEventListener('submit', (e) => { e.preventDefault(); salvar(f, () => TL.put('/admin/configuracoes', { valores: Object.fromEntries(Object.keys(r.campos).map((k) => [k, f.elements[k].value])) })); });
  }

  init();
})();
