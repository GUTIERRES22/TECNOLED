'use strict';
const { clientIp } = require('./http');

/** Contador de janela fixa, em memória. */
class Limiter {
  constructor({ windowMs, max }) {
    this.windowMs = windowMs; this.max = max; this.hits = new Map();
    this.timer = setInterval(() => this.sweep(), Math.min(windowMs, 60_000));
    if (this.timer.unref) this.timer.unref();
  }
  hit(key, now = Date.now()) {
    let e = this.hits.get(key);
    if (!e || e.reset <= now) { e = { count: 0, reset: now + this.windowMs }; this.hits.set(key, e); }
    e.count += 1;
    return { allowed: e.count <= this.max, remaining: Math.max(0, this.max - e.count), retryAfter: Math.ceil((e.reset - now) / 1000) };
  }
  sweep(now = Date.now()) { for (const [k, e] of this.hits) if (e.reset <= now) this.hits.delete(k); }
}

/** Middleware Express. Por padrão limita por IP. */
function rateLimit({ windowMs, max, message = 'Muitas requisições. Tente novamente em instantes.', key = (req) => clientIp(req) }) {
  const limiter = new Limiter({ windowMs, max });
  return (req, res, next) => {
    const r = limiter.hit(key(req));
    res.setHeader('RateLimit-Remaining', String(r.remaining));
    if (!r.allowed) {
      res.setHeader('Retry-After', String(r.retryAfter));
      return res.status(429).json({ erro: message });
    }
    next();
  };
}

module.exports = { Limiter, rateLimit };
