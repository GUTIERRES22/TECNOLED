'use strict';
const fs = require('fs');
const path = require('path');
const config = require('../config/env');
const log = require('../utils/logger');

let transporter;
function getTransporter() {
  if (!transporter) {
    const nodemailer = require('nodemailer');
    transporter = nodemailer.createTransport({
      host: config.mail.host, port: config.mail.port, secure: config.mail.secure,
      auth: { user: config.mail.user, pass: config.mail.pass },
      connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000,
    });
  }
  return transporter;
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function enviar({ to, subject, text, html }) {
  if (config.mail.mode === 'file') {
    if (config.isProd) throw new Error('MAIL_MODE=file não é permitido em produção');
    const dir = path.resolve(__dirname, '../../.mail-outbox');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`),
      JSON.stringify({ to, subject, text, html }, null, 2));
    return;
  }
  await getTransporter().sendMail({ from: config.mail.from, to, subject, text, html });
}

const moldura = (titulo, corpo) => `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:auto;color:#1B1F23">
<div style="background:#0B3D2E;color:#fff;padding:16px 20px;border-radius:10px 10px 0 0;font-weight:700;letter-spacing:.05em">TECNO <span style="color:#8CD1AE">LED</span></div>
<div style="border:1px solid #E7E0D0;border-top:0;padding:20px;border-radius:0 0 10px 10px"><h2 style="margin-top:0">${esc(titulo)}</h2>${corpo}</div></div>`;

async function enviarRedefinicaoSenha(usuario, link) {
  const min = config.resetTokenMinutos;
  const text = `Olá, ${usuario.nome}.\n\nRecebemos um pedido para redefinir a senha da sua conta na Tecno LED.\nAbra o link abaixo (válido por ${min} minutos e de uso único):\n\n${link}\n\nSe você não fez este pedido, ignore este e-mail: sua senha continua a mesma.`;
  const html = moldura('Redefinir sua senha', `<p>Olá, ${esc(usuario.nome)}.</p><p>Recebemos um pedido para redefinir a senha da sua conta. O link vale por ${min} minutos e só pode ser usado uma vez.</p>
<p><a href="${esc(link)}" style="display:inline-block;background:#0B3D2E;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:700">Criar nova senha</a></p>
<p style="font-size:13px;color:#4A554F">Se o botão não funcionar, copie este endereço no navegador:<br>${esc(link)}</p>
<p style="font-size:13px;color:#4A554F">Se você não fez este pedido, ignore este e-mail. Sua senha continua a mesma.</p>`);
  return enviar({ to: usuario.email, subject: 'Redefinição de senha - Tecno LED', text, html });
}

async function enviarAvisoNovoOrcamento(o) {
  if (!config.mail.notificarOrcamento) return;
  const linhas = [['Nº', o.id], ['Cliente', o.nome], ['Empresa', o.empresa || '-'], ['Telefone', o.telefone], ['E-mail', o.email || '-'], ['Cidade', o.cidade], ['Produto', o.produtoNome], ['Quantidade', o.quantidade || '-'], ['Conta', o.usuarioId ? 'cliente cadastrado' : 'visitante'], ['Mensagem', o.mensagem]];
  const text = linhas.map(([k, v]) => `${k}: ${v}`).join('\n') + `\n\nPainel: ${config.appUrl}/admin`;
  const html = moldura(`Novo orçamento #${o.id}`, `<table style="border-collapse:collapse;width:100%">${linhas.map(([k, v]) => `<tr><td style="padding:6px 8px;font-weight:700;vertical-align:top">${esc(k)}</td><td style="padding:6px 8px;white-space:pre-wrap">${esc(v)}</td></tr>`).join('')}</table><p><a href="${esc(config.appUrl)}/admin">Abrir painel</a></p>`);
  return enviar({ to: config.mail.notificarOrcamento, subject: `Novo orçamento #${o.id} - ${o.produtoNome}`, text, html });
}

module.exports = { enviar, enviarRedefinicaoSenha, enviarAvisoNovoOrcamento };
