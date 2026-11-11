'use strict';
const express = require('express');
const config = require('./config/env');
const { securityHeaders, originAndJson, noStore } = require('./middlewares/security');
const { loadSession } = require('./middlewares/auth');
const { notFoundApi, errorHandler } = require('./middlewares/errors');
const { rateLimit } = require('./utils/rateLimit');
const routes = require('./routes');
const { pages } = require('./routes/pages');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', config.trustProxy);

app.use(securityHeaders);
app.use('/api', noStore, rateLimit({ windowMs: 60_000, max: 300 }), express.json({ limit: '20kb' }), originAndJson, loadSession, routes, notFoundApi);
app.use(pages);
app.use((req, res) => res.status(404).sendFile(require('path').join(require('./routes/pages').FRONT, 'pages/404.html')));
app.use(errorHandler);

module.exports = app;
