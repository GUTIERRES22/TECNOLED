/* TECNO LED — utilitários compartilhados pelas páginas de conta. */
(function () {
  'use strict';
  const TL = { csrf: null, user: null };

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const STATUS = {
    AGUARDANDO_ANALISE: 'Aguardando análise', EM_ANALISE: 'Em análise', AGUARDANDO_CONTATO: 'Aguardando contato',
    ORCAMENTO_ENVIADO: 'Orçamento enviado', APROVADO: 'Aprovado', RECUSADO: 'Recusado',
  };
  const badge = (s) => `<span class="badge st-${esc(s)}">${esc(STATUS[s] || s)}</span>`;
  const fmtData = (d, hora) => d ? new Date(d).toLocaleString('pt-BR', hora ? { dateStyle: 'short', timeStyle: 'short' } : { dateStyle: 'short' }) : '';
  const fmtTel = (t) => { const d = String(t || '').replace(/\D/g, ''); return d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : d.length === 10 ? `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}` : d; };
  const fmtDoc = (d) => { d = String(d || ''); return d.length === 11 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : d.length === 14 ? d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5') : d; };

  /** Chamada à API. Lança Error com .status e .campos (erros por campo) quando falha. */
  async function api(method, url, body) {
    const headers = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (method !== 'GET' && TL.csrf) headers['X-CSRF-Token'] = TL.csrf;
    let res;
    try {
      res = await fetch('/api' + url, { method, headers, credentials: 'same-origin', body: body === undefined ? undefined : JSON.stringify(body) });
    } catch (_) { const e = new Error('Sem conexão com o servidor. Verifique sua internet e tente de novo.'); e.status = 0; throw e; }
    let data = null; try { data = await res.json(); } catch (_) { /* corpo vazio */ }
    if (!res.ok) {
      const e = new Error((data && data.erro) || 'Não foi possível concluir a ação.');
      e.status = res.status; e.campos = data && data.campos;
      if (res.status === 401 && TL.user) { location.href = '/entrar?next=' + encodeURIComponent(location.pathname); }
      throw e;
    }
    return data;
  }
  TL.get = (u) => api('GET', u);
  TL.post = (u, b) => api('POST', u, b === undefined ? {} : b);
  TL.put = (u, b) => api('PUT', u, b);
  TL.patch = (u, b) => api('PATCH', u, b);
  TL.del = (u) => api('DELETE', u);

  TL.me = async function () {
    const r = await TL.get('/auth/me');
    TL.user = r.usuario; TL.csrf = r.csrf || null; return r.usuario;
  };
  TL.logout = async function () { try { await TL.post('/auth/logout'); } finally { location.href = '/'; } };

  /** Redireciona só para caminhos internos (evita open redirect). */
  TL.destinoSeguro = (next, padrao) => (typeof next === 'string' && /^\/[A-Za-z0-9\-_/]*$/.test(next) && !next.startsWith('//') ? next : padrao);

  let toastT;
  TL.toast = function (msg, erro) {
    document.querySelectorAll('.toast').forEach((t) => t.remove());
    const t = document.createElement('div'); t.className = 'toast' + (erro ? ' erro' : ''); t.setAttribute('role', erro ? 'alert' : 'status'); t.textContent = msg;
    document.body.appendChild(t); clearTimeout(toastT); toastT = setTimeout(() => t.remove(), 4500);
  };

  /** Mostra erros por campo (.err com id "e-<campo>") e marca aria-invalid. */
  TL.mostrarErros = function (form, campos) {
    form.querySelectorAll('.err').forEach((e) => { e.textContent = ''; });
    form.querySelectorAll('[aria-invalid]').forEach((i) => i.setAttribute('aria-invalid', 'false'));
    let primeiro = null;
    for (const [k, m] of Object.entries(campos || {})) {
      const e = form.querySelector('#e-' + k); const i = form.querySelector('[name="' + k + '"]');
      if (e) e.textContent = m; if (i) { i.setAttribute('aria-invalid', 'true'); primeiro = primeiro || i; }
    }
    if (primeiro) primeiro.focus();
  };
  TL.busy = (btn, on) => { btn.disabled = on; btn.classList.toggle('is-loading', on); };

  TL.maskTel = function (el) {
    el.addEventListener('input', () => {
      let d = el.value.replace(/\D/g, ''); if (d.length > 11 && d.startsWith('55')) d = d.slice(2); d = d.slice(0, 11);
      el.value = d.length <= 2 ? (d ? '(' + d : '') : d.length <= 6 ? `(${d.slice(0, 2)}) ${d.slice(2)}` : d.length <= 10 ? `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}` : `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
    });
  };
  TL.maskDoc = function (el) {
    el.addEventListener('input', () => {
      const d = el.value.replace(/\D/g, '').slice(0, 14);
      el.value = d.length <= 11 ? d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2')
        : d.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2');
    });
  };
  TL.pwToggle = function (root) {
    root.querySelectorAll('.pw').forEach((w) => {
      const i = w.querySelector('input'); const b = w.querySelector('button');
      b.addEventListener('click', () => { const show = i.type === 'password'; i.type = show ? 'text' : 'password'; b.textContent = show ? 'Ocultar' : 'Mostrar'; b.setAttribute('aria-pressed', show); });
    });
  };
  TL.forca = function (input, meter) {
    input.addEventListener('input', () => {
      const v = input.value; let n = 0;
      if (v.length >= 8) n++; if (/\p{L}/u.test(v) && /\d/.test(v)) n++; if (v.length >= 12) n++; if (/[^\p{L}\d]/u.test(v) && v.length >= 8) n++;
      meter.firstElementChild.style.width = v ? n * 25 + '%' : '0'; meter.firstElementChild.dataset.n = n;
    });
  };
  TL.esc = esc; TL.STATUS = STATUS; TL.badge = badge; TL.fmtData = fmtData; TL.fmtTel = fmtTel; TL.fmtDoc = fmtDoc;
  window.TL = TL;
})();
