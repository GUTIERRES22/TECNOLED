/* TECNO LED — login, cadastro, esqueci a senha e redefinição. */
(function () {
  'use strict';
  const page = document.body.dataset.page;
  const f = document.getElementById('f');
  const msg = document.getElementById('msg');
  const btn = f.querySelector('button[type=submit]');
  const params = new URLSearchParams(location.search);

  const aviso = (texto, tipo) => { msg.textContent = texto; msg.className = 'alert ' + (tipo || ''); msg.hidden = !texto; if (texto) msg.scrollIntoView({ block: 'nearest' }); };
  const val = (n) => f.elements[n].value;

  TL.pwToggle(f);
  if (f.elements.senha && document.querySelector('.meter')) TL.forca(f.elements.senha, document.querySelector('.meter'));
  if (f.elements.telefone) TL.maskTel(f.elements.telefone);
  if (f.elements.documento) TL.maskDoc(f.elements.documento);

  // Quem já está logado não precisa ver login/cadastro.
  if (page === 'login' || page === 'cadastro') {
    TL.me().then((u) => { if (u) location.replace(u.tipo === 'ADMIN' ? '/admin' : '/conta'); }).catch(() => {});
  } else { TL.me().catch(() => {}); }

  let token = '';
  if (page === 'redefinir') {
    token = (new URLSearchParams(location.hash.slice(1))).get('token') || '';
    history.replaceState(null, '', location.pathname);   // não deixa o token no histórico
    window.addEventListener('hashchange', () => location.reload());   // link aberto com a página já carregada
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) { aviso('Link de redefinição inválido. Peça um novo link.', 'erro'); f.hidden = true; }
  }

  async function enviar(fn) {
    aviso(''); TL.mostrarErros(f, {}); TL.busy(btn, true);
    try { await fn(); }
    catch (e) {
      if (e.campos) TL.mostrarErros(f, e.campos);
      aviso(e.campos ? 'Corrija os campos destacados.' : e.message, 'erro');
    } finally { TL.busy(btn, false); }
  }

  f.addEventListener('submit', (ev) => {
    ev.preventDefault();
    if (page === 'login') return enviar(async () => {
      const campos = {};
      if (!val('email').trim()) campos.email = 'Informe seu e-mail.';
      if (!val('senha')) campos.senha = 'Informe sua senha.';
      if (Object.keys(campos).length) { TL.mostrarErros(f, campos); return; }
      const r = await TL.post('/auth/login', { email: val('email').trim(), senha: val('senha'), lembrar: f.elements.lembrar.checked });
      let destino = TL.destinoSeguro(params.get('next'), r.destino);
      if (destino.startsWith('/admin') && r.usuario.tipo !== 'ADMIN') destino = r.destino;
      location.href = destino;
    });

    if (page === 'cadastro') return enviar(async () => {
      const campos = {};
      if (val('senha') !== val('confirmarSenha')) campos.confirmarSenha = 'As senhas não coincidem.';
      if (!f.elements.aceite.checked) campos.aceite = 'É necessário aceitar os Termos de Uso e a Política de Privacidade.';
      if (Object.keys(campos).length) { TL.mostrarErros(f, campos); return; }
      await TL.post('/auth/cadastro', {
        nome: val('nome'), empresa: val('empresa'), documento: val('documento'), email: val('email'), telefone: val('telefone'),
        senha: val('senha'), confirmarSenha: val('confirmarSenha'), aceite: true,
      });
      location.href = TL.destinoSeguro(params.get('next'), '/conta');
    });

    if (page === 'esqueci') return enviar(async () => {
      const r = await TL.post('/auth/esqueci-senha', { email: val('email').trim() });
      aviso(r.mensagem, 'ok'); f.reset();
    });

    if (page === 'redefinir') return enviar(async () => {
      const r = await TL.post('/auth/redefinir-senha', { token, senha: val('senha'), confirmarSenha: val('confirmarSenha') });
      f.hidden = true; aviso(r.mensagem + ' Redirecionando para o login...', 'ok');
      setTimeout(() => { location.href = '/entrar'; }, 2500);
    });
  });
})();
