'use strict';
const path = require('path');
const express = require('express');
const { loadSession } = require('../middlewares/auth');

const FRONT = path.resolve(__dirname, '../../../frontend');
const pages = express.Router();

const arquivo = (res, rel) => { res.setHeader('Cache-Control', 'no-store'); res.sendFile(path.join(FRONT, rel)); };

// Páginas públicas de autenticação (URLs limpas)
const PUBLICAS = { '/entrar': 'login.html', '/cadastro': 'cadastro.html', '/esqueci-senha': 'esqueci-senha.html', '/redefinir-senha': 'redefinir-senha.html' };
for (const [url, file] of Object.entries(PUBLICAS)) pages.get(url, (req, res) => arquivo(res, `pages/${file}`));

// Páginas privadas: o servidor só entrega o HTML depois de checar sessão e função.
pages.get('/conta', loadSession, (req, res) => {
  if (!req.user) return res.redirect('/entrar?next=/conta');
  if (req.user.tipo === 'ADMIN') return res.redirect('/admin');
  arquivo(res, 'private/cliente.html');
});
pages.get('/admin', loadSession, (req, res) => {
  if (!req.user) return res.redirect('/entrar?next=/admin');
  if (req.user.tipo !== 'ADMIN') return res.status(404).sendFile(path.join(FRONT, 'pages/404.html'));
  arquivo(res, 'private/admin.html');
});

// Site estático. A pasta "private" nunca é servida diretamente.
pages.use((req, res, next) => (/^\/(private)(\/|$)/i.test(req.path) ? res.status(404).sendFile(path.join(FRONT, 'pages/404.html')) : next()));
pages.use(express.static(FRONT, { index: 'index.html', maxAge: '1h', dotfiles: 'ignore' }));

module.exports = { pages, FRONT };
