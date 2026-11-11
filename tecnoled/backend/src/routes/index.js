'use strict';
const express = require('express');
const config = require('../config/env');
const { rateLimit: rl } = require('../utils/rateLimit');
const rateLimit = (o) => rl({ ...o, max: o.max * config.rateMult });
const { requireAuth, requireRole, requireCsrf } = require('../middlewares/auth');
const auth = require('../controllers/auth.controller');
const conta = require('../controllers/conta.controller');
const pub = require('../controllers/public.controller');
const admin = require('../controllers/admin.controller');

const HORA = 60 * 60 * 1000;
const router = express.Router();

/* ---------- públicas ---------- */
router.get('/public/catalogo', pub.catalogo);
router.get('/public/config', pub.config);
router.post('/orcamentos', rateLimit({ windowMs: HORA, max: 10, message: 'Muitas solicitações. Tente novamente mais tarde ou fale pelo WhatsApp.' }), pub.criarOrcamento);

/* ---------- autenticação ---------- */
router.get('/auth/me', auth.eu);
router.post('/auth/cadastro', rateLimit({ windowMs: HORA, max: 10, message: 'Muitos cadastros a partir deste endereço. Tente mais tarde.' }), auth.cadastrar);
router.post('/auth/login', rateLimit({ windowMs: 15 * 60 * 1000, max: 30, message: 'Muitas tentativas. Aguarde alguns minutos.' }), auth.entrar);
router.post('/auth/esqueci-senha', rateLimit({ windowMs: HORA, max: 5, message: 'Muitos pedidos de redefinição. Tente novamente mais tarde.' }), auth.esqueci);
router.post('/auth/redefinir-senha', rateLimit({ windowMs: HORA, max: 10, message: 'Muitas tentativas. Tente novamente mais tarde.' }), auth.redefinir);
router.post('/auth/logout', requireAuth, requireCsrf, auth.sair);

/* ---------- área do cliente (qualquer usuário autenticado) ---------- */
const area = express.Router();
area.use(requireAuth, requireCsrf);
area.patch('/perfil', conta.atualizarPerfil);
area.post('/senha', rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: 'Muitas tentativas. Aguarde alguns minutos.' }), conta.alterarSenha);
area.get('/resumo', conta.resumo);
area.get('/orcamentos', conta.listarOrcamentos);
area.get('/orcamentos/:id', conta.detalheOrcamento);
router.use('/conta', area);

/* ---------- administração (somente ADMIN) ---------- */
const adm = express.Router();
adm.use(requireRole('ADMIN'), requireCsrf);
adm.get('/indicadores', admin.indicadores);
adm.get('/usuarios', admin.listarUsuarios);
adm.get('/usuarios/:id', admin.detalheUsuario);
adm.patch('/usuarios/:id/ativo', admin.alterarAtivo);
adm.get('/orcamentos', admin.listarOrcamentos);
adm.get('/orcamentos/:id', admin.detalheOrcamento);
adm.patch('/orcamentos/:id/status', admin.alterarStatus);
adm.get('/categorias', admin.listarCategorias);
adm.post('/categorias', admin.criarCategoria);
adm.put('/categorias/:id', admin.atualizarCategoria);
adm.delete('/categorias/:id', admin.removerCategoria);
adm.get('/produtos', admin.listarProdutos);
adm.get('/produtos/:id', admin.detalheProduto);
adm.post('/produtos', admin.criarProduto);
adm.put('/produtos/:id', admin.atualizarProduto);
adm.delete('/produtos/:id', admin.removerProduto);
adm.get('/configuracoes', admin.verConfig);
adm.put('/configuracoes', admin.salvarConfig);
router.use('/admin', adm);

module.exports = router;
