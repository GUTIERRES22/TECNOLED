'use strict';
// Logger mínimo. Nunca registre senhas, tokens, cookies ou corpos de requisição.
const SENSITIVE = /(senha|password|token|cookie|authorization|secret|hash)/i;

function scrub(value) {
  if (value instanceof Error) return { name: value.name, message: value.message, code: value.code };
  if (value && typeof value === 'object') {
    const out = Array.isArray(value) ? [] : {};
    for (const [k, v] of Object.entries(value)) out[k] = SENSITIVE.test(k) ? '[omitido]' : scrub(v);
    return out;
  }
  return value;
}
function write(level, msg, meta) {
  const line = { t: new Date().toISOString(), level, msg };
  if (meta !== undefined) line.meta = scrub(meta);
  (level === 'error' ? console.error : console.log)(JSON.stringify(line));
}
module.exports = {
  info: (m, meta) => write('info', m, meta),
  warn: (m, meta) => write('warn', m, meta),
  error: (m, meta) => write('error', m, meta),
  scrub,
};
