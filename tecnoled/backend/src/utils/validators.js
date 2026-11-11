'use strict';
/**
 * Validação no servidor. Cada regra recebe o valor bruto e devolve
 * { value } (já normalizado) ou { error: 'mensagem em português' }.
 */
const ok = (value) => ({ value });
const bad = (error) => ({ error });
const str = (v) => (typeof v === 'string' ? v : v == null ? '' : String(v));
const clean = (v) => str(v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();

/* ---------- CPF / CNPJ ---------- */
function cpfValido(d) {
  if (!/^\d{11}$/.test(d) || /^(\d)\1{10}$/.test(d)) return false;
  for (const t of [9, 10]) {
    let s = 0;
    for (let i = 0; i < t; i++) s += +d[i] * (t + 1 - i);
    const dv = ((s * 10) % 11) % 10;
    if (dv !== +d[t]) return false;
  }
  return true;
}
function cnpjValido(d) {
  if (!/^\d{14}$/.test(d) || /^(\d)\1{13}$/.test(d)) return false;
  const calc = (len) => {
    const pesos = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let s = 0;
    for (let i = 0; i < len; i++) s += +d[i] * pesos[i];
    const r = s % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === +d[12] && calc(13) === +d[13];
}

/* ---------- Regras ---------- */
const rules = {
  nome(v) {
    const s = clean(v).replace(/\s+/g, ' ');
    if (s.length < 3) return bad('Informe seu nome completo.');
    if (s.length > 120) return bad('O nome deve ter no máximo 120 caracteres.');
    if (!/\p{L}/u.test(s)) return bad('Informe um nome válido.');
    return ok(s);
  },
  empresa(v) {
    const s = clean(v).replace(/\s+/g, ' ');
    if (s.length > 120) return bad('O nome da empresa deve ter no máximo 120 caracteres.');
    return ok(s || null);
  },
  documento(v) {
    const d = str(v).replace(/\D/g, '');
    if (!d) return ok(null);
    if (d.length === 11) return cpfValido(d) ? ok(d) : bad('CPF inválido.');
    if (d.length === 14) return cnpjValido(d) ? ok(d) : bad('CNPJ inválido.');
    return bad('Informe um CPF (11 dígitos) ou CNPJ (14 dígitos) válido.');
  },
  email(v) {
    const s = clean(v).toLowerCase();
    if (!s) return bad('Informe seu e-mail.');
    if (s.length > 254 || !/^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[a-z]{2,}$/i.test(s)) return bad('Informe um e-mail válido.');
    return ok(s);
  },
  emailOpcional(v) {
    return clean(v) ? rules.email(v) : ok(null);
  },
  telefone(v) {
    let d = str(v).replace(/\D/g, '');
    if (d.length > 11 && d.startsWith('55')) d = d.slice(2);
    const valido = (d.length === 10 || d.length === 11) && +d.slice(0, 2) >= 11 && (d.length === 10 || d[2] === '9');
    return valido ? ok(d) : bad('Informe um telefone válido com DDD, por exemplo (14) 99721-2607.');
  },
  cidade(v) {
    const s = clean(v).replace(/\s+/g, ' ');
    if (s.length < 2) return bad('Informe sua cidade e estado, por exemplo Garça/SP.');
    if (s.length > 80) return bad('Cidade/UF deve ter no máximo 80 caracteres.');
    return ok(s);
  },
  mensagem(v) {
    const s = clean(v);
    if (s.length < 10) return bad('Descreva em poucas palavras o que você precisa (mínimo de 10 caracteres).');
    if (s.length > 2000) return bad('A descrição deve ter no máximo 2000 caracteres.');
    return ok(s);
  },
  quantidade(v) {
    const s = clean(v);
    if (!s) return ok(null);
    return /^[1-9]\d{0,3}$/.test(s) ? ok(parseInt(s, 10)) : bad('Use apenas números inteiros, por exemplo 2, ou deixe em branco.');
  },
  senha(v) { return passwordPolicy(v); },
  aceite(v) {
    return v === true || v === 'true' || v === 1 || v === '1' || v === 'on'
      ? ok(true) : bad('É necessário aceitar os Termos de Uso e a Política de Privacidade.');
  },
};

const SENHAS_COMUNS = new Set(['12345678', '123456789', '1234567890', 'senha123', 'senha1234', 'password1', 'qwerty123', 'abc12345', 'brasil123', '11111111a', 'mudar123', 'admin123', 'tecnoled1', 'tecnoled123']);

/** Política: 8–72 bytes (limite do bcrypt), com letra e número, fora da lista de senhas comuns. */
function passwordPolicy(v) {
  if (typeof v !== 'string') return bad('Informe uma senha.');
  if (v.length < 8) return bad('A senha deve ter pelo menos 8 caracteres.');
  if (Buffer.byteLength(v, 'utf8') > 72) return bad('A senha deve ter no máximo 72 bytes (cerca de 72 caracteres).');
  if (!/\p{L}/u.test(v) || !/\d/.test(v)) return bad('A senha deve conter pelo menos uma letra e um número.');
  if (SENHAS_COMUNS.has(v.toLowerCase())) return bad('Esta senha é muito comum. Escolha outra.');
  return ok(v);
}

/**
 * Aplica um conjunto de regras a um corpo de requisição.
 * schema: { campo: regra | [regra, 'chaveNoBody'] }. Campos desconhecidos no body são ignorados.
 */
function validate(schema, body = {}) {
  const values = {}; const errors = {};
  for (const [campo, regra] of Object.entries(schema)) {
    const r = regra(body[campo]);
    if (r.error) errors[campo] = r.error; else values[campo] = r.value;
  }
  return { values, errors, ok: Object.keys(errors).length === 0 };
}

const STATUS = {
  AGUARDANDO_ANALISE: 'Aguardando análise',
  EM_ANALISE: 'Em análise',
  AGUARDANDO_CONTATO: 'Aguardando contato',
  ORCAMENTO_ENVIADO: 'Orçamento enviado',
  APROVADO: 'Aprovado',
  RECUSADO: 'Recusado',
};

const slugify = (s) => clean(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);

module.exports = { rules, validate, passwordPolicy, cpfValido, cnpjValido, clean, slugify, STATUS };
