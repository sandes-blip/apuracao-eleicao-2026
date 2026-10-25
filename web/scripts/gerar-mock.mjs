#!/usr/bin/env node
// Gera um MOCK determinístico (semente fixa) de todos os JSON estáticos que o portal consome,
// espelhando /data/... em web/mock-data/... (ex.: /data/latest/br.json -> web/mock-data/latest/br.json).
// Uma única simulação de baixo para cima (município -> UF -> região -> BR), amostrada em vários momentos.
//
// Uso:
//   node scripts/gerar-mock.mjs                  cenário padrão: ~60% apurado, ao_vivo (placar 22 à frente, P2 13 à frente)
//   node scripts/gerar-mock.mjs --pct=3          latest = momento mais próximo de 3% das seções (projeção indisponível)
//   node scripts/gerar-mock.mjs --status=parado  latest com status "parado" (TSE sem atualização há ~7 min)
//   node scripts/gerar-mock.mjs --final          latest = momento final (100%, eleito definido pelo TSE)
//   node scripts/gerar-mock.mjs --diag           imprime a tabela de diagnóstico por momento (stderr)
// Todos os cenários regravam latest/, timeline/, ia/, eventos.json e status.json. replay/ é sempre o mesmo.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.resolve(__dirname, '..');
const OUT = path.join(WEB, 'mock-data');
const CACHE_DIR = path.join(__dirname, 'cache');
const CACHE_SLIM = path.join(CACHE_DIR, 'municipios-ibge.json');
const IBGE_URL = 'https://servicodados.ibge.gov.br/api/v1/localidades/municipios';

// ---------------------------------------------------------------- CLI
const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  return m ? [m[1], m[2] ?? true] : [a, true];
}));
const ARG_PCT = args.pct !== undefined ? Number(args.pct) : null;
const ARG_PARADO = args.status === 'parado';
const ARG_FINAL = !!args.final;
const DIAG = !!args.diag;

// ---------------------------------------------------------------- PRNG
let _s = 20261025 >>> 0;
function rand() { // mulberry32
  _s = (_s + 0x6d2b79f5) >>> 0;
  let t = _s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function randn() {
  let u = 0; while (u === 0) u = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}
const logit = (p) => Math.log(p / (1 - p));
const invlogit = (x) => 1 / (1 + Math.exp(-x));
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const r1 = (x) => Math.round(x * 10) / 10;
const r2 = (x) => Math.round(x * 100) / 100;
const r3 = (x) => Math.round(x * 1000) / 1000;
function erf(x) { // Abramowitz-Stegun
  const s = Math.sign(x); x = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return s * y;
}
const Phi = (z) => 0.5 * (1 + erf(z / Math.SQRT2));

// ---------------------------------------------------------------- referência
const REGIOES = { N: ['ac', 'am', 'ap', 'pa', 'ro', 'rr', 'to'], NE: ['al', 'ba', 'ce', 'ma', 'pb', 'pe', 'pi', 'rn', 'se'], CO: ['df', 'go', 'ms', 'mt'], SE: ['es', 'mg', 'rj', 'sp'], S: ['pr', 'rs', 'sc'], EXT: ['zz'] };
const REG_ORDEM = ['N', 'NE', 'CO', 'SE', 'S', 'EXT'];
const REG_NOME = { N: 'Norte', NE: 'Nordeste', CO: 'Centro-Oeste', SE: 'Sudeste', S: 'Sul', EXT: 'Exterior' };
const UF_REG = {}; for (const r of REG_ORDEM) for (const u of REGIOES[r]) UF_REG[u] = r;
const UF_ORDEM = REG_ORDEM.flatMap((r) => REGIOES[r]);
const UF_NOME = { ac: 'Acre', am: 'Amazonas', ap: 'Amapá', pa: 'Pará', ro: 'Rondônia', rr: 'Roraima', to: 'Tocantins', al: 'Alagoas', ba: 'Bahia', ce: 'Ceará', ma: 'Maranhão', pb: 'Paraíba', pe: 'Pernambuco', pi: 'Piauí', rn: 'Rio Grande do Norte', se: 'Sergipe', df: 'Distrito Federal', go: 'Goiás', ms: 'Mato Grosso do Sul', mt: 'Mato Grosso', es: 'Espírito Santo', mg: 'Minas Gerais', rj: 'Rio de Janeiro', sp: 'São Paulo', pr: 'Paraná', rs: 'Rio Grande do Sul', sc: 'Santa Catarina', zz: 'Exterior' };
// eleitorado aproximado por UF (ordem de grandeza do TSE)
const UF_ELEIT = { sp: 34.9e6, mg: 16.4e6, rj: 12.9e6, ba: 11.4e6, rs: 8.65e6, pr: 8.55e6, pe: 7.08e6, ce: 6.88e6, pa: 6.18e6, sc: 5.55e6, ma: 5.1e6, go: 4.98e6, pb: 3.12e6, es: 2.95e6, am: 2.7e6, pi: 2.6e6, rn: 2.58e6, mt: 2.5e6, al: 2.36e6, df: 2.2e6, ms: 2.0e6, se: 1.72e6, ro: 1.24e6, to: 1.1e6, ac: 0.6e6, ap: 0.56e6, rr: 0.38e6, zz: 0.70e6 };
const CAPITAIS = { ac: ['Rio Branco', 0.27e6], al: ['Maceió', 0.62e6], ap: ['Macapá', 0.32e6], am: ['Manaus', 1.52e6], ba: ['Salvador', 2.0e6], ce: ['Fortaleza', 1.8e6], df: ['Brasília', 2.2e6], es: ['Vitória', 0.27e6], go: ['Goiânia', 1.05e6], ma: ['São Luís', 0.72e6], mt: ['Cuiabá', 0.43e6], ms: ['Campo Grande', 0.63e6], mg: ['Belo Horizonte', 1.95e6], pa: ['Belém', 1.06e6], pb: ['João Pessoa', 0.58e6], pr: ['Curitiba', 1.36e6], pe: ['Recife', 1.21e6], pi: ['Teresina', 0.6e6], rj: ['Rio de Janeiro', 5.0e6], rn: ['Natal', 0.56e6], rs: ['Porto Alegre', 1.08e6], ro: ['Porto Velho', 0.36e6], rr: ['Boa Vista', 0.27e6], sc: ['Florianópolis', 0.38e6], sp: ['São Paulo', 9.3e6], se: ['Aracaju', 0.45e6], to: ['Palmas', 0.22e6] };
const EXTERIOR = [['LISBOA', 9], ['MIAMI', 7], ['BOSTON', 7], ['NOVA YORK', 6], ['LONDRES', 6], ['TÓQUIO', 5], ['PORTO', 5], ['ORLANDO', 5], ['NAGOIA', 4], ['PARIS', 4], ['ATLANTA', 4], ['MADRI', 3], ['GENEBRA', 3], ['BUENOS AIRES', 3], ['TORONTO', 3], ['HAMAMATSU', 3], ['ROMA', 2]];
const CANDIDATOS = [
  { n: '13', nome: 'Lula', partido: 'PT', cor: '#2563eb', foto: '/data/fotos/13.jpeg' },
  { n: '22', nome: 'Flávio Bolsonaro', partido: 'PL', cor: '#d97706', foto: '/data/fotos/22.jpeg' },
];
const NOME = { '13': 'Lula', '22': 'Flávio Bolsonaro' };
const CURTO = { '13': 'Lula', '22': 'Flávio' };
const AVISO_IA = 'Projeção estatística independente. Resultado oficial: TSE.';
const AVISO = 'Projeção estatística independente. Não é resultado oficial. Resultado oficial: TSE.';
const ELEICAO = '6258';
const TITULO = '2º turno presidencial 2026';

// ---------------------------------------------------------------- municípios IBGE (cache)
async function carregarIBGE() {
  if (fs.existsSync(CACHE_SLIM)) return JSON.parse(fs.readFileSync(CACHE_SLIM, 'utf8'));
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const raw = path.join(CACHE_DIR, 'ibge-municipios.json');
  let data;
  if (fs.existsSync(raw)) data = JSON.parse(fs.readFileSync(raw, 'utf8'));
  else {
    console.error('baixando municípios do IBGE...');
    const r = await fetch(IBGE_URL);
    if (!r.ok) throw new Error(`IBGE HTTP ${r.status}`);
    data = await r.json();
  }
  const slim = data.map((m) => {
    const uf = m.microrregiao?.mesorregiao?.UF?.sigla ?? m['regiao-imediata']?.['regiao-intermediaria']?.UF?.sigla;
    if (!uf) throw new Error(`sem UF: ${m.id} ${m.nome}`);
    return [String(m.id), m.nome, uf.toLowerCase()];
  }).sort((a, b) => a[0].localeCompare(b[0]));
  fs.writeFileSync(CACHE_SLIM, JSON.stringify(slim));
  return slim;
}

// ---------------------------------------------------------------- tempo
const T0 = Date.UTC(2026, 9, 25, 20, 0, 0); // 17:00 -03:00
const pad = (n) => String(n).padStart(2, '0');
function iso(min, addSec = 0) {
  const t = new Date(T0 + min * 60000 + addSec * 1000 - 3 * 3600000);
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}T${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}:${pad(t.getUTCSeconds())}-03:00`;
}
function tse(min, addSec = 1) {
  const t = new Date(T0 + min * 60000 + addSec * 1000 - 3 * 3600000);
  return `${pad(t.getUTCDate())}/${pad(t.getUTCMonth() + 1)}/${t.getUTCFullYear()} ${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}:${pad(t.getUTCSeconds())}`;
}
function idMomento(min) {
  const t = new Date(T0 + min * 60000 - 3 * 3600000);
  return `${t.getUTCFullYear()}${pad(t.getUTCMonth() + 1)}${pad(t.getUTCDate())}T${pad(t.getUTCHours())}${pad(t.getUTCMinutes())}${pad(t.getUTCSeconds())}`;
}
const hhmm = (min) => iso(min).slice(11, 16).replace(':', 'h');
const GRADE = []; for (let m = 0; m <= 330; m += 5) GRADE.push(m);

// ---------------------------------------------------------------- formatação pt-BR
const fpct = (x, d = 1) => x.toFixed(d).replace('.', ',');
// fvv: número + "votos" com a concordância certa ("661 mil votos", "1,2 milhão de votos", "17,5 milhões de votos")
function fvv(v, adj = '') {
  const a = Math.abs(v); const sfx = adj ? ` ${adj}` : '';
  if (a >= 1e6) { const x = a / 1e6; return `${fpct(x, 1)} ${x < 2 ? 'milhão' : 'milhões'} de votos${sfx}`; }
  if (a >= 1e3) return `${Math.round(a / 1e3).toLocaleString('pt-BR')} mil votos${sfx}`;
  return `${Math.round(a)} votos${sfx}`;
}
function fvotos(v) {
  const a = Math.abs(v);
  if (a >= 1e6) return `${fpct(a / 1e6, 1)} milhões`;
  if (a >= 1e3) return `${Math.round(a / 1e3).toLocaleString('pt-BR')} mil`;
  return String(Math.round(a));
}

// ================================================================ simulação estática
function porte(e) { return e <= 10000 ? 'ate10k' : e <= 50000 ? '10a50k' : e <= 200000 ? '50a200k' : e <= 1e6 ? '200ka1m' : 'acima1m'; }

function construirMunicipios(ibge) {
  const norm = (s) => s.normalize('NFC').toLowerCase();
  const munis = [];
  for (const [id, nome, uf] of ibge) munis.push({ ibge: id, nomeIbge: nome, nome: nome.toUpperCase(), uf, reg: UF_REG[uf], capital: false });
  // capitais
  let ncap = 0;
  for (const m of munis) { const c = CAPITAIS[m.uf]; if (c && norm(c[0]) === norm(m.nomeIbge)) { m.capital = true; ncap++; } }
  if (ncap !== 27) throw new Error(`capitais encontradas: ${ncap}`);
  // exterior
  for (const [nome] of EXTERIOR) munis.push({ ibge: null, nome, uf: 'zz', reg: 'EXT', capital: false });
  // ordenar por UF (ordem de região) e nome, gerar cd sintético único de 5 dígitos
  munis.sort((a, b) => UF_ORDEM.indexOf(a.uf) - UF_ORDEM.indexOf(b.uf) || a.nome.localeCompare(b.nome, 'pt-BR'));
  munis.forEach((m, i) => { m.cd = String(10000 + i * 15 + Math.floor(rand() * 10)); });

  // eleitorado
  for (const uf of UF_ORDEM) {
    const ms = munis.filter((m) => m.uf === uf);
    if (uf === 'zz') {
      const tot = EXTERIOR.reduce((s, x) => s + x[1], 0);
      ms.forEach((m) => { const w = EXTERIOR.find((x) => x[0] === m.nome)[1]; m.eleitorado = Math.round(UF_ELEIT.zz * w / tot * (0.9 + 0.2 * rand())); });
      continue;
    }
    const cap = ms.find((m) => m.capital);
    cap.eleitorado = Math.round(CAPITAIS[uf][1] * (0.97 + 0.06 * rand()));
    const outros = ms.filter((m) => !m.capital);
    if (!outros.length) continue;
    const resto = Math.max(UF_ELEIT[uf] - cap.eleitorado, outros.length * 3000);
    const w = outros.map(() => Math.exp(1.35 * randn()));
    const sw = w.reduce((a, b) => a + b, 0);
    outros.forEach((m, i) => { m.eleitorado = Math.max(900 + Math.floor(rand() * 600), Math.round(resto * w[i] / sw)); });
    // evita cidade do interior maior que a capital
    for (const m of outros) if (m.eleitorado > cap.eleitorado * 0.8) m.eleitorado = Math.round(cap.eleitorado * (0.35 + 0.3 * rand()));
  }
  for (const m of munis) { m.porte = porte(m.eleitorado); m.secoes = Math.max(1, Math.round(m.eleitorado / 320)); }

  // 1º turno: share2 (13 / (13+22)) em logit
  const REG_S2 = { N: 0.47, NE: 0.685, CO: 0.39, SE: 0.465, S: 0.395, EXT: 0.46 };
  const UF_AJ = { sc: -0.25, pi: 0.25, ma: 0.15, rj: -0.12, am: 0.1, rr: -0.35, ac: -0.25, ro: -0.3, ce: 0.1, df: -0.05, mg: 0.06, ba: 0.12 };
  const ufNoise = {}; for (const u of UF_ORDEM) ufNoise[u] = randn() * 0.06 + (UF_AJ[u] ?? 0);
  for (const m of munis) {
    let L = logit(REG_S2[m.reg]) + ufNoise[m.uf] + randn() * (m.uf === 'zz' ? 0.35 : 0.33);
    if (m.capital) L += m.reg === 'NE' ? -0.35 : m.reg === 'N' ? -0.05 : 0.15;
    else if (m.reg === 'NE' && m.eleitorado < 20000) L += 0.12;
    m.L1 = L;
    m.outros = clamp(0.078 + randn() * 0.02, 0.03, 0.16);
    const base = { N: 0.765, NE: 0.79, CO: 0.79, SE: 0.795, S: 0.81, EXT: 0.40 }[m.reg];
    m.t1 = clamp(base + randn() * (m.reg === 'EXT' ? 0.05 : 0.03), 0.3, 0.92);
    m.b1 = clamp(0.017 + randn() * 0.004, 0.005, 0.04);
    m.n1 = clamp(0.032 + randn() * 0.007, 0.01, 0.07);
  }
  // calibra outros e share2 do 1º turno para 45,16 x 47,03
  const alvoOutros = 1 - (45.16 + 47.03) / 100;
  const alvoS2 = 45.16 / (45.16 + 47.03);
  const valid1 = (m) => m.eleitorado * m.t1 * (1 - m.b1 - m.n1);
  const wo = munis.reduce((s, m) => s + valid1(m) * m.outros, 0) / munis.reduce((s, m) => s + valid1(m), 0);
  munis.forEach((m) => { m.outros *= alvoOutros / wo; });
  const off1 = bisect((o) => wavg(munis, (m) => invlogit(m.L1 + o), (m) => valid1(m) * (1 - m.outros)) - alvoS2);
  for (const m of munis) {
    m.s2_1 = invlogit(m.L1 + off1);
    m.comp1 = Math.round(m.eleitorado * m.t1);
    m.valid1 = Math.round(m.comp1 * (1 - m.b1 - m.n1));
    m.v1 = { '13': Math.round(m.valid1 * (1 - m.outros) * m.s2_1) };
    m.v1['22'] = Math.round(m.valid1 * (1 - m.outros)) - m.v1['13'];
    m.s2_1 = m.v1['13'] / (m.v1['13'] + m.v1['22']); // usa a razão inteira (consistente)
  }

  // 2º turno (resultado verdadeiro): swing em logit por região + UF + município
  const REG_SW = { N: 0.06, NE: 0.03, CO: 0.04, SE: 0.12, S: -0.03, EXT: 0.05 };
  const UF_SW = { mg: 0.15, sc: -0.08 }; // MG fora do padrão (gera evento), SC abaixo da região
  const ufSw = {}; for (const u of UF_ORDEM) ufSw[u] = randn() * 0.03 + (UF_SW[u] ?? 0);
  // dois municípios médios fora do padrão
  const foraPadrao = new Set();
  for (const uf of ['pr', 'pe']) {
    const c = munis.filter((m) => m.uf === uf && !m.capital).sort((a, b) => b.eleitorado - a.eleitorado)[2];
    foraPadrao.add(c.cd);
  }
  for (const m of munis) {
    m.Lsw = REG_SW[m.reg] + ufSw[m.uf] + randn() * 0.07 + (foraPadrao.has(m.cd) ? (m.uf === 'pr' ? 0.55 : -0.5) : 0);
    m.t2 = clamp(m.t1 - 0.004 + randn() * 0.012 + (m.uf === 'rr' ? -0.065 : 0), 0.25, 0.93);
    m.b2 = clamp(m.b1 * 0.85 + randn() * 0.002, 0.004, 0.04);
    m.n2 = clamp(m.n1 * 1.05 + randn() * 0.004, 0.01, 0.07);
  }
  const valid2 = (m) => m.eleitorado * m.t2 * (1 - m.b2 - m.n2);
  const off2 = bisect((o) => wavg(munis, (m) => invlogit(logit(m.s2_1) + m.Lsw + o), valid2) - 0.5088);
  for (const m of munis) {
    m.p2 = invlogit(logit(m.s2_1) + m.Lsw + off2);
    m.F = {};
    m.F.comp = Math.round(m.eleitorado * m.t2);
    m.F.brancos = Math.round(m.F.comp * m.b2);
    m.F.nulos = Math.round(m.F.comp * m.n2);
    m.F.validos = m.F.comp - m.F.brancos - m.F.nulos;
    m.F.v13 = Math.round(m.F.validos * m.p2);
    m.F.v22 = m.F.validos - m.F.v13;
  }

  // chegada dos votos: curva logística por município (NE e grandes capitais mais tarde)
  const REG_MID = { S: 118, CO: 120, SE: 128, N: 132, NE: 133, EXT: 176 };
  const ufMid = {}; for (const u of UF_ORDEM) ufMid[u] = randn() * 7;
  for (const m of munis) {
    let mid = REG_MID[m.reg] + ufMid[m.uf] + randn() * 20;
    if (m.capital) mid += m.eleitorado > 1e6 ? 24 : 12;
    else if (m.eleitorado > 200000) mid += 12;
    else if (m.eleitorado < 10000) mid -= 10;
    let w = clamp(10 + 4 * Math.log10(m.eleitorado / 5000) + randn() * 2.5, 6, 30);
    const span = 3.5 * w;
    mid = clamp(mid, 4 + span, 322 - span);
    m.mid = mid; m.w = w;
    const lo = invlogit(-3.5), hi = invlogit(3.5);
    m.frac = (t) => clamp((invlogit((t - mid) / w) - lo) / (hi - lo), 0, 1);
  }
  return munis;
}
function wavg(arr, f, w) { let a = 0, b = 0; for (const x of arr) { const ww = w(x); a += f(x) * ww; b += ww; } return a / b; }
function bisect(f) { let lo = -3, hi = 3; for (let i = 0; i < 80; i++) { const mid = (lo + hi) / 2; if (f(mid) > 0) hi = mid; else lo = mid; } return (lo + hi) / 2; }

// ================================================================ um momento
const ZERO = () => ({ eleitorado: 0, el_ap: 0, secoes: 0, secoes_ap: 0, comp: 0, brancos: 0, nulos: 0, validos: 0, v13: 0, v22: 0,
  comp1: 0, el1: 0, valid1: 0, v1_13: 0, v1_22: 0, sw_s2w: 0, sw_w: 0, sw_c13: 0, sw_cv: 0,
  vr: 0, prest_vr: 0, proj13: 0, proj22: 0, nfit: 0, fit_c13: 0, fit_cv: 0, fit_s2: 0 });

function hwFormula(f) { return f >= 1 ? 0 : 0.2 + 3.3 * Math.pow(1 - f, 1.7); }

function simularMomento(munis, t) {
  // contagem por município
  for (const m of munis) {
    const cs = t >= 330 ? m.secoes : Math.floor(m.frac(t) * m.secoes + 1e-9);
    const f = cs / m.secoes;
    const c = m.C = { cs, f };
    c.el_ap = Math.round(m.eleitorado * f);
    c.comp = Math.round(m.F.comp * f);
    c.brancos = Math.round(m.F.brancos * f);
    c.nulos = Math.round(m.F.nulos * f);
    c.v13 = Math.round(m.F.v13 * f);
    c.v22 = Math.round(m.F.v22 * f);
    c.validos = c.v13 + c.v22;
    c.comp = c.validos + c.brancos + c.nulos;
  }
  // fator de comparecimento 2t/1t por nível (municípios com >= 20%)
  const fat = { uf: {}, reg: {}, br: [0, 0] };
  for (const m of munis) if (m.C.f >= 0.2) {
    for (const [k, key] of [['uf', m.uf], ['reg', m.reg]]) { fat[k][key] ??= [0, 0]; fat[k][key][0] += m.C.comp; fat[k][key][1] += m.t1 * m.C.el_ap; }
    fat.br[0] += m.C.comp; fat.br[1] += m.t1 * m.C.el_ap;
  }
  const ratio = (a) => (a && a[1] > 50000 ? a[0] / a[1] : null);
  const fatorUF = (m) => ratio(fat.uf[m.uf]) ?? ratio(fat.reg[m.reg]) ?? ratio(fat.br) ?? 1;
  // swing (logit) nos municípios com >= 50%
  const sw = { uf: {}, reg: {}, br: [0, 0] };
  let nfit = 0;
  for (const m of munis) if (m.C.f >= 0.5 && m.C.validos > 0) {
    const cur = clamp(m.C.v13 / m.C.validos, 0.001, 0.999);
    const d = logit(cur) - logit(m.s2_1);
    const n = m.C.validos;
    for (const [k, key] of [['uf', m.uf], ['reg', m.reg]]) { sw[k][key] ??= [0, 0]; sw[k][key][0] += d * n; sw[k][key][1] += n; }
    sw.br[0] += d * n; sw.br[1] += n; nfit++;
    m.C.d = d;
  }
  const swBr = sw.br[1] ? sw.br[0] / sw.br[1] : 0;
  const swReg = {}, swUf = {};
  for (const r of REG_ORDEM) { const a = sw.reg[r] ?? [0, 0]; const s = a[1] ? a[0] / a[1] : 0; swReg[r] = (a[1] * s + 1e6 * swBr) / (a[1] + 1e6); }
  for (const u of UF_ORDEM) { const a = sw.uf[u] ?? [0, 0]; const s = a[1] ? a[0] / a[1] : 0; swUf[u] = (a[1] * s + 2e5 * swReg[UF_REG[u]]) / (a[1] + 2e5); }
  // projeção por município
  for (const m of munis) {
    const c = m.C;
    const er = m.eleitorado - c.el_ap;
    const tm = c.f >= 0.2 && c.el_ap > 0 ? c.comp / c.el_ap : m.t1 * fatorUF(m);
    const vm = c.f >= 0.2 && c.comp > 0 ? c.validos / c.comp : (1 - m.b1 - m.n1);
    c.vr = c.cs >= m.secoes ? 0 : Math.round(er * tm * vm);
    const prior = invlogit(logit(m.s2_1) + swUf[m.uf]);
    const w = c.validos / (c.validos + 2000);
    const cur = c.validos > 0 ? c.v13 / c.validos : prior;
    c.prest = w * cur + (1 - w) * prior;
    c.proj13 = c.v13 + c.vr * c.prest;
    c.proj22 = c.v22 + c.vr * (1 - c.prest);
  }
  // agregação município -> UF -> região -> BR
  const ag = { br: ZERO(), reg: {}, uf: {} };
  for (const r of REG_ORDEM) ag.reg[r] = ZERO();
  for (const u of UF_ORDEM) ag.uf[u] = ZERO();
  for (const m of munis) {
    const c = m.C;
    for (const A of [ag.br, ag.reg[m.reg], ag.uf[m.uf]]) {
      A.eleitorado += m.eleitorado; A.el_ap += c.el_ap; A.secoes += m.secoes; A.secoes_ap += c.cs;
      A.comp += c.comp; A.brancos += c.brancos; A.nulos += c.nulos; A.validos += c.validos; A.v13 += c.v13; A.v22 += c.v22;
      A.comp1 += m.comp1; A.el1 += m.eleitorado; A.valid1 += m.valid1; A.v1_13 += m.v1['13']; A.v1_22 += m.v1['22'];
      if (c.validos > 0) { const w1 = (m.v1['13'] + m.v1['22']) * c.f; A.sw_s2w += m.s2_1 * w1; A.sw_w += w1; }
      A.vr += c.vr; A.prest_vr += c.prest * c.vr; A.proj13 += c.proj13; A.proj22 += c.proj22;
      if (c.d !== undefined) { A.nfit++; A.fit_c13 += c.v13; A.fit_cv += c.validos; A.fit_s2 += m.s2_1 * c.validos; }
    }
    delete c.d;
  }
  // P1 (por região; UF usa o próprio % atual)
  const p1Of = (A) => {
    const pctSec = A.secoes_ap / A.secoes;
    const s2 = A.v1_13 / (A.v1_13 + A.v1_22);
    const cur = pctSec >= 0.05 && A.validos > 0 ? A.v13 / A.validos : s2;
    return { p13: A.v13 + A.vr * cur, tot: A.validos + A.vr };
  };
  for (const A of [...Object.values(ag.reg), ...Object.values(ag.uf)]) { const p = p1Of(A); A.p1 = p.p13 / p.tot; }
  { let a = 0, b = 0; for (const r of REG_ORDEM) { const p = p1Of(ag.reg[r]); a += p.p13; b += p.tot; } ag.br.p1 = a / b; }
  const ufsComDados = UF_ORDEM.filter((u) => u !== 'zz' && ag.uf[u].secoes_ap > 0).length;
  const brF = ag.br.secoes_ap / ag.br.secoes;
  const disponivel = brF >= 0.05 && ufsComDados >= 15;
  return { t, ag, disponivel, ufsComDados, nfit, swBr, brF };
}

// ---------------------------------------------------------------- objetos do contrato
function par13(x13) { if (x13 === null || x13 === undefined || Number.isNaN(x13)) return { '13': null, '22': null }; const a = r2(x13); return { '13': a, '22': r2(100 - a) }; }
function projDe(A, VbrTot, isBr) {
  const tot = A.proj13 + A.proj22;
  const p13 = (A.proj13 / tot) * 100;
  const f = A.secoes_ap / A.secoes;
  let hw = A.vr <= 0 ? 0 : hwFormula(f) * (isBr ? 1 : Math.min(4, Math.pow(VbrTot / tot, 0.25)));
  const lo = r2(Math.max(0, p13 - hw)), hi = r2(Math.min(100, p13 + hw));
  const sigma = hw / 1.96;
  const prob13 = sigma > 0 ? Phi((p13 - 50) / sigma) : p13 > 50 ? 1 : p13 < 50 ? 0 : 0.5;
  return { p13, hw, pct: par13(p13), ic95: { '13': [lo, hi], '22': [r2(100 - hi), r2(100 - lo)] }, prob: { '13': r3(prob13), '22': r3(1 - r3(prob13)) } };
}
function statusDe(A) { return A.secoes_ap === 0 ? 'nao_iniciada' : A.secoes_ap >= A.secoes ? 'concluida' : 'parcial'; }

function regiaoUF(A, codigo, nome, regiao, S) {
  const disp = S.disponivel;
  const pr = disp ? projDe(A, S.ag.br.proj13 + S.ag.br.proj22, false) : null;
  const s2 = (A.v1_13 / (A.v1_13 + A.v1_22)) * 100;
  return {
    codigo, nome, regiao,
    pct_secoes: r2((A.secoes_ap / A.secoes) * 100), eleitorado: A.eleitorado, eleitorado_apurado: A.el_ap,
    votos: { '13': A.v13, '22': A.v22 },
    pct: A.validos > 0 ? par13((A.v13 / A.validos) * 100) : par13(null),
    pct_1t: { '13': r2((A.v1_13 / A.valid1) * 100), '22': r2((A.v1_22 / A.valid1) * 100) },
    share2_1t: par13(s2),
    swing_pp: A.validos > 0 && A.sw_w > 0 ? r2((A.v13 / A.validos) * 100 - (A.sw_s2w / A.sw_w) * 100) : null,
    pct_comparecimento: A.el_ap > 0 ? r2((A.comp / A.el_ap) * 100) : null,
    pct_comparecimento_1t: r2((A.comp1 / A.el1) * 100),
    validos_restantes: A.vr,
    saldo_esperado: Math.round(2 * A.prest_vr - A.vr),
    proj: pr ? { pct: pr.pct, ic95: pr.ic95, prob: pr.prob } : null,
    proj_p1: disp ? par13(A.p1 * 100) : null,
    status: statusDe(A),
  };
}

function lider(v13, v22) { return v13 + v22 === 0 || v13 === v22 ? null : v13 > v22 ? '13' : '22'; }

function municipioObj(m, disp) {
  const c = m.C;
  const lider1 = m.v1['13'] > m.v1['22'] ? '13' : '22';
  const lid = lider(c.v13, c.v22);
  return {
    cd: m.cd, ibge: m.ibge, nome: m.nome, uf: m.uf, capital: m.capital, porte: m.porte,
    eleitorado: m.eleitorado, pct_secoes: r2(c.f * 100),
    votos: { '13': c.v13, '22': c.v22 },
    pct: c.validos > 0 ? par13((c.v13 / c.validos) * 100) : par13(null),
    pct_1t: { '13': r2((m.v1['13'] / m.valid1) * 100), '22': r2((m.v1['22'] / m.valid1) * 100) },
    share2_1t: par13(m.s2_1 * 100),
    swing_pp: c.validos > 0 ? r2((c.v13 / c.validos - m.s2_1) * 100) : null,
    proj_pct: disp ? par13((c.proj13 / (c.proj13 + c.proj22)) * 100) : null,
    validos_restantes: c.vr,
    pct_comparecimento: c.el_ap > 0 ? r2((c.comp / c.el_ap) * 100) : null,
    pct_comparecimento_1t: r2(m.t1 * 100),
    status: c.cs === 0 ? 'nao_iniciada' : c.cs >= m.secoes ? 'concluida' : 'parcial',
    lider_1t: lider1, lider: lid, virou_vs_1t: lid !== null && lid !== lider1,
  };
}
const CAMPOS = ['cd', 'ibge', 'uf', 'nome', 'capital', 'porte', 'eleitorado', 'pct_secoes', 'pct_a', 'share2_1t_a', 'swing_pp', 'proj_a', 'validos_restantes', 'pct_comp', 'pct_comp_1t', 'status'];
function municipiosCompacto(munis, S, gerado) {
  return {
    gerado_em: gerado, campos: CAMPOS,
    dados: munis.map((m) => { const o = municipioObj(m, S.disponivel); return [o.cd, o.ibge, o.uf, o.nome, o.capital, o.porte, o.eleitorado, o.pct_secoes, o.pct['13'], o.share2_1t['13'], o.swing_pp, o.proj_pct ? o.proj_pct['13'] : null, o.validos_restantes, o.pct_comparecimento, o.pct_comparecimento_1t, o.status]; }),
  };
}

// ================================================================ main
const ibge = await carregarIBGE();
const munis = construirMunicipios(ibge);
const SIM = GRADE.map((t) => simularMomento(munis, t)); // estado agregado por momento (municípios: só o último)
const idxFinal = SIM.findIndex((S) => S.ag.br.secoes_ap >= S.ag.br.secoes);
if (idxFinal < 0) throw new Error('apuração não chega a 100% na grade');
const MOMS = SIM.slice(0, idxFinal + 1);

// resumo BR por momento (para eventos, IA, ponto de virada, timeline)
for (const S of MOMS) {
  const A = S.ag.br;
  S.pct = r2(S.brF * 100);
  S.off13 = A.validos > 0 ? (A.v13 / A.validos) * 100 : null;
  S.lider = lider(A.v13, A.v22);
  if (S.disponivel) {
    S.pr = projDe(A, A.proj13 + A.proj22, true);
    const largura = 2 * S.pr.hw;
    S.confianca = largura > 4 ? 'baixa' : largura >= 2 ? 'media' : 'alta';
    S.p2lider = S.pr.p13 > 50 ? '13' : S.pr.p13 < 50 ? '22' : null;
    S.p1lider = A.p1 > 0.5 ? '13' : A.p1 < 0.5 ? '22' : null;
  } else S.confianca = 'insuficiente';
}

function apuracaoBR(S, final) {
  const A = S.ag.br;
  return {
    pct_secoes: S.pct, secoes_tot: A.secoes_ap, secoes_total: A.secoes,
    eleitorado: A.eleitorado, eleitorado_apurado: A.el_ap,
    comparecimento: A.comp, abstencao: A.el_ap - A.comp,
    pct_comparecimento: A.el_ap > 0 ? r2((A.comp / A.el_ap) * 100) : null,
    pct_comparecimento_1t: r2((A.comp1 / A.el1) * 100),
    validos: A.validos, brancos: A.brancos, nulos: A.nulos,
    votos: { '13': A.v13, '22': A.v22 },
    pct: A.validos > 0 ? par13((A.v13 / A.validos) * 100) : par13(null),
    pct_1t: { '13': r2((A.v1_13 / A.valid1) * 100), '22': r2((A.v1_22 / A.valid1) * 100) },
    dif_votos: A.v13 - A.v22,
    dif_pp: A.validos > 0 ? r2(((A.v13 - A.v22) / A.validos) * 100) : 0,
    lider: S.lider,
    eleito: final ? (A.v13 > A.v22 ? '13' : '22') : null,
    definido_tse: !!final,
  };
}

function projecaoBR(S, i) {
  const A = S.ag.br;
  const er = A.eleitorado - A.el_ap;
  const base = {
    validos_restantes: A.vr, eleitores_restantes: er,
    saldo_esperado: Math.round(2 * A.prest_vr - A.vr),
    vantagem_supera_restantes: Math.abs(A.v13 - A.v22) > er,
  };
  if (!S.disponivel) {
    return { disponivel: false, motivo: S.brF < 0.05 ? 'Menos de 5% das seções apuradas' : 'Menos de 15 UFs com dados', confianca: 'insuficiente', tendencia_consolidada: false,
      p1: null, p2: null, ...base, virada: null, ponto_virada_pct_secoes: null, divergencia_p1_p2: false,
      modelo: { n_municipios_ajuste: S.nfit, swing_nacional_pp: null, versao: 'mock-1' } };
  }
  let virada = null;
  if (A.vr > 0 && S.lider) {
    const atras = S.lider === '13' ? '22' : '13';
    const dif = Math.abs(A.v13 - A.v22);
    const projAtras = atras === '13' ? A.proj13 - A.v13 : A.proj22 - A.v22;
    virada = { atras, pct_necessario: r2(((A.vr + dif) / (2 * A.vr)) * 100), pct_projetado: r2((projAtras / A.vr) * 100) };
  }
  let ponto = null;
  if (S.lider && S.p2lider && S.p2lider !== S.lider) {
    for (let j = i + 1; j < MOMS.length; j++) if (MOMS[j].lider === S.p2lider) { ponto = MOMS[j].pct; break; }
  }
  return {
    disponivel: true, motivo: null, confianca: S.confianca,
    tendencia_consolidada: Math.max(S.pr.prob['13'], S.pr.prob['22']) >= 0.99 && S.confianca === 'alta' && S.brF >= 0.7,
    p1: { pct: par13(A.p1 * 100) },
    p2: { pct: S.pr.pct, ic95: S.pr.ic95, prob: S.pr.prob, votos: { '13': Math.round(A.proj13), '22': Math.round(A.proj22) }, validos_total: Math.round(A.proj13) + Math.round(A.proj22) },
    ...base, virada, ponto_virada_pct_secoes: ponto,
    divergencia_p1_p2: !!(S.p1lider && S.p2lider && S.p1lider !== S.p2lider),
    modelo: { n_municipios_ajuste: S.nfit, swing_nacional_pp: A.fit_cv > 0 ? r2((A.fit_c13 / A.fit_cv - A.fit_s2 / A.fit_cv) * 100) : null, versao: 'mock-1' },
  };
}

// ---------------------------------------------------------------- eventos (derivados dos números)
const EVENTOS = []; // {i, momento, tipo, texto, abrangencia}
{
  const ev = (i, tipo, texto, abr) => EVENTOS.push({ i, momento: iso(MOMS[i].t, 3), tipo, texto, abrangencia: abr });
  const marcos = [10, 25, 50, 75, 90, 100];
  const feitos = new Set();
  const colegios = { sp: [50, 90], mg: [50, 90], ba: [50], rs: [50, 90] };
  const ufFora = new Set(), compAt = new Set(); let munFora = 0; let ultimaMudProb = -99; let confAlta = false;
  for (let i = 1; i < MOMS.length; i++) {
    const S = MOMS[i], P = MOMS[i - 1], A = S.ag.br;
    for (const mk of marcos) if (!feitos.has(mk) && S.pct >= mk) {
      feitos.add(mk);
      ev(i, 'marco_apuracao', mk === 100 ? `Apuração atinge 100% das seções. ${NOME['13']} tem ${fpct(S.off13, 2)}% e ${NOME['22']}, ${fpct(100 - S.off13, 2)}% dos votos válidos.`
        : `Apuração passa de ${mk}% das seções. Placar oficial: ${NOME['13']} ${fpct(S.off13, 2)}%, ${NOME['22']} ${fpct(100 - S.off13, 2)}%.`, 'br');
    }
    for (const [uf, ms] of Object.entries(colegios)) for (const mk of ms) {
      const k = `${uf}${mk}`; const U = S.ag.uf[uf]; const pu = (U.secoes_ap / U.secoes) * 100;
      if (!feitos.has(k) && pu >= mk) { feitos.add(k); const p = (U.v13 / U.validos) * 100; ev(i, 'marco_apuracao', `${UF_NOME[uf]} passa de ${mk}% das seções apuradas: ${CURTO['13']} ${fpct(p)}%, ${CURTO['22']} ${fpct(100 - p)}%.`, uf); }
    }
    if (P.lider && S.lider && P.lider !== S.lider && S.pct >= 1) ev(i, 'virada_oficial', `${NOME[S.lider]} passa à frente no placar oficial com ${fpct(S.pct)}% das seções apuradas. Diferença: ${fvv(A.v13 - A.v22)}.`, 'br');
    if (S.disponivel && P.disponivel && S.p2lider && P.p2lider && S.p2lider !== P.p2lider) ev(i, 'virada_projetada', `A projeção estatística passa a indicar ${NOME[S.p2lider]} à frente, com ${fpct(S.p2lider === '13' ? S.pr.p13 : 100 - S.pr.p13)}% dos votos válidos (faixa de ${fpct(S.p2lider === '13' ? S.pr.ic95['13'][0] : S.pr.ic95['22'][0])}% a ${fpct(S.p2lider === '13' ? S.pr.ic95['13'][1] : S.pr.ic95['22'][1])}%).`, 'br');
    if (S.disponivel && i >= 2 && MOMS[i - 2].disponivel && i - ultimaMudProb >= 6) {
      const dp = S.pr.prob['13'] - MOMS[i - 2].pr.prob['13'];
      if (Math.abs(dp) > 0.10) { ultimaMudProb = i; const c = dp > 0 ? '13' : '22'; ev(i, 'mudanca_probabilidade', `Probabilidade estimada de ${NOME[c]} terminar à frente sobe de ${Math.round(MOMS[i - 2].pr.prob[c] * 100)}% para ${Math.round(S.pr.prob[c] * 100)}% em 10 minutos.`, 'br'); }
    }
    if (S.disponivel && !confAlta && S.confianca === 'alta') { confAlta = true; ev(i, 'confianca_alta', `Confiança da projeção passa a alta: faixa de 95% com menos de 2 pontos de largura (${fpct(S.pr.ic95['13'][0], 2)}% a ${fpct(S.pr.ic95['13'][1], 2)}% para ${NOME['13']}).`, 'br'); }
    // UF fora do padrão: swing da UF (pp) longe do swing da região
    for (const u of UF_ORDEM) {
      const U = S.ag.uf[u], R = S.ag.reg[UF_REG[u]];
      if (u === 'zz' || ufFora.has(u) || U.fit_cv < 2e5 || R.fit_cv <= U.fit_cv) continue;
      const su = (U.fit_c13 - U.fit_s2) / U.fit_cv * 100, sr = (R.fit_c13 - R.fit_s2 - (U.fit_c13 - U.fit_s2)) / (R.fit_cv - U.fit_cv) * 100;
      if (Math.abs(su - sr) > 3) { ufFora.add(u); ev(i, 'uf_fora_padrao', `${UF_NOME[u]} mostra desvio em relação ao 1º turno de ${su > 0 ? '+' : ''}${fpct(su)} ponto(s) para ${NOME['13']}, contra ${sr > 0 ? '+' : ''}${fpct(sr)} no restante da região ${REG_NOME[UF_REG[u]]}.`, u); }
    }
    for (const u of UF_ORDEM) {
      const U = S.ag.uf[u]; if (compAt.has(u) || U.secoes_ap / U.secoes < 0.2) continue;
      const d = (U.comp / U.el_ap - U.comp1 / U.el1) * 100;
      if (Math.abs(d) > 5) { compAt.add(u); ev(i, 'comparecimento_atipico', `Comparecimento em ${UF_NOME[u]} está em ${fpct((U.comp / U.el_ap) * 100)}%, ${fpct(Math.abs(d))} pontos ${d < 0 ? 'abaixo' : 'acima'} do 1º turno nas seções apuradas.`, u); }
    }
    S.eventosMun = [];
  }
  // município fora do padrão: precisa do estado municipal de cada momento, recalculado só para os momentos necessários
  // (detectado no momento em que o município ultrapassa 50% das seções)
  for (let i = 1; i < MOMS.length && munFora < 3; i++) {
    simularMomento(munis, MOMS[i].t);
    const fit = munis.filter((m) => m.C.f >= 0.5 && m.C.validos > 10000);
    if (fit.length < 30) continue;
    const d = fit.map((m) => logit(clamp(m.C.v13 / m.C.validos, 0.001, 0.999)) - logit(m.s2_1));
    const ufm = {}; fit.forEach((m, k) => { (ufm[m.uf] ??= [0, 0]); ufm[m.uf][0] += d[k]; ufm[m.uf][1]++; });
    const res = fit.map((m, k) => d[k] - ufm[m.uf][0] / ufm[m.uf][1]);
    const sd = Math.sqrt(res.reduce((a, b) => a + b * b, 0) / res.length);
    const ordem = fit.map((m, k) => k).sort((a, b) => Math.abs(res[b]) - Math.abs(res[a]));
    ordem.forEach((k) => { const m = fit[k];
      if (munFora >= 3 || m._fora || Math.abs(res[k]) <= 3 * sd) return;
      m._fora = true; munFora++;
      const sp = (m.C.v13 / m.C.validos - m.s2_1) * 100;
      EVENTOS.push({ i, momento: iso(MOMS[i].t, 3), tipo: 'municipio_fora_padrao', texto: `${m.nome} (${m.uf.toUpperCase()}) foge do padrão: ${CURTO['13']} varia ${sp > 0 ? '+' : ''}${fpct(sp)} pontos em relação ao 1º turno, com ${fpct(m.C.f * 100, 0)}% das seções apuradas.`, abrangencia: m.cd });
    });
  }
  ev(idxFinal, 'definido_tse', `TSE indica ${NOME[apuracaoBR(MOMS[idxFinal], true).eleito]} como eleito, com ${fpct(MOMS[idxFinal].off13 > 50 ? MOMS[idxFinal].off13 : 100 - MOMS[idxFinal].off13, 2)}% dos votos válidos.`, 'br');
  EVENTOS.sort((a, b) => b.i - a.i || (b.tipo === 'definido_tse') - (a.tipo === 'definido_tse'));
}
const eventosAte = (i) => EVENTOS.filter((e) => e.i <= i).map(({ i: _i, ...e }) => e);

// ---------------------------------------------------------------- análises da IA (geradas a partir dos números)
const IA_MINUTOS = [60, 80, 95, 105, 115, 125, 135, 140, 155, 170, 190, 220];
const IA = [];
function regiaoMaisPendente(S) {
  return REG_ORDEM.map((r) => ({ r, vr: S.ag.reg[r].vr, saldo: 2 * S.ag.reg[r].prest_vr - S.ag.reg[r].vr })).sort((a, b) => b.vr - a.vr);
}
function gerarIA(i, origem) {
  const S = MOMS[i], A = S.ag.br, final = i === idxFinal;
  const pend = regiaoMaisPendente(S);
  const off = S.off13;
  const conf = S.disponivel ? S.confianca : 'baixa';
  const dest = []; let titulo, resumo, falta;
  const placar = off === null ? 'sem votos apurados' : `${NOME['13']} ${fpct(off, 2)}% e ${NOME['22']} ${fpct(100 - off, 2)}%`;
  if (final) {
    titulo = `Apuração concluída: ${NOME[S.lider]} termina com ${fpct(S.lider === '13' ? off : 100 - off, 2)}% dos válidos`;
    resumo = `Com 100% das seções apuradas, o placar do TSE registra ${placar} dos votos válidos. A diferença final é de ${fvv(A.v13 - A.v22)}. O comparecimento ficou em ${fpct((A.comp / A.el_ap) * 100)}%, ante ${fpct((A.comp1 / A.el1) * 100)}% no 1º turno. A projeção estatística acompanhou o resultado oficial ao longo da noite.`;
    falta = 'Não há mais seções a apurar. O resultado oficial é o divulgado pelo TSE.';
    dest.push(`Nordeste: ${CURTO['13']} com ${fpct(S.ag.reg.NE.v13 / S.ag.reg.NE.validos * 100)}% dos válidos`, `Sul: ${CURTO['22']} com ${fpct(S.ag.reg.S.v22 / S.ag.reg.S.validos * 100)}% dos válidos`, `Sudeste: ${CURTO['13']} ${fpct(S.ag.reg.SE.v13 / S.ag.reg.SE.validos * 100)}%, ${CURTO['22']} ${fpct(S.ag.reg.SE.v22 / S.ag.reg.SE.validos * 100)}%`);
  } else if (!S.disponivel) {
    titulo = 'Apuração começa; projeção ainda indisponível';
    resumo = `Com ${fpct(S.pct, 2)}% das seções apuradas, o placar parcial mostra ${placar}. Os primeiros votos vêm sobretudo do Sul e do Centro-Oeste, que costumam ser apurados mais cedo. A projeção estatística só é exibida a partir de 5% das seções e de dados em ao menos 15 UFs.`;
    falta = `Faltam cerca de ${fvv(A.vr, 'válidos')}, com maior volume no ${REG_NOME[pend[0].r]} e no ${REG_NOME[pend[1].r]}.`;
    dest.push(`${S.ufsComDados} UFs já enviaram resultados`, `Sul com ${fpct(S.ag.reg.S.secoes_ap / S.ag.reg.S.secoes * 100)}% das seções apuradas`, `Nordeste com ${fpct(S.ag.reg.NE.secoes_ap / S.ag.reg.NE.secoes * 100)}% das seções apuradas`);
  } else {
    const p2l = S.p2lider, ofl = S.lider;
    const pp = (c) => fpct(c === '13' ? S.pr.p13 : 100 - S.pr.p13);
    const faixa = (c) => `${fpct(S.pr.ic95[c][0])}% a ${fpct(S.pr.ic95[c][1])}%`;
    if (ofl && p2l && ofl !== p2l) {
      titulo = [`${NOME[ofl]} lidera o placar; projeção indica ${NOME[p2l]} à frente`,
        `Ordem de chegada dos votos separa placar parcial e projeção`,
        `Placar mostra ${NOME[ofl]} à frente; votos que faltam pesam para ${NOME[p2l]}`][i % 3];
      resumo = `Com ${fpct(S.pct)}% das seções apuradas, o placar oficial mostra ${placar}. A projeção estatística indica que ${NOME[p2l]} tende a terminar com ${pp(p2l)}% dos votos válidos (faixa de ${faixa(p2l)}). A diferença entre placar e projeção se explica pela ordem de chegada dos votos: o ${REG_NOME[pend[0].r]} ainda tem ${fvv(pend[0].vr, 'válidos')} a apurar. Nas seções já apuradas, o desvio em relação ao 1º turno é de ${fpct(Math.abs(projecaoBR(S, i).modelo.swing_nacional_pp ?? 0))} ponto(s) ${((projecaoBR(S, i).modelo.swing_nacional_pp ?? 0) >= 0) ? `a favor de ${NOME['13']}` : `a favor de ${NOME['22']}`}.`;
    } else {
      const l = p2l ?? ofl;
      titulo = `${NOME[l]} à frente no placar e na projeção estatística`;
      resumo = `Com ${fpct(S.pct)}% das seções apuradas, o placar oficial mostra ${placar}. A projeção estatística indica ${NOME[l]} com ${pp(l)}% dos votos válidos (faixa de ${faixa(l)}). A margem de incerteza diminui à medida que mais regiões completam a apuração. O ${REG_NOME[pend[0].r]} concentra a maior parte dos votos que faltam.`;
    }
    falta = A.vr > 0 ? `Faltam cerca de ${fvv(A.vr, 'válidos')}, principalmente no ${REG_NOME[pend[0].r]} (${fvotos(pend[0].vr)}) e no ${REG_NOME[pend[1].r]} (${fvotos(pend[1].vr)}).` : 'Não há votos a apurar.';
    for (const x of pend.slice(0, 2)) if (x.vr > 0) dest.push(`${REG_NOME[x.r]}: saldo esperado de ${fvv(x.saldo)} para ${NOME[x.saldo >= 0 ? '13' : '22']} no que falta`);
    { const q = Math.round(S.pr.prob['13'] * 100); dest.push(`Probabilidade estimada: ${CURTO['13']} ${q}%, ${CURTO['22']} ${100 - q}%`); }
    dest.push(`Comparecimento de ${fpct((A.comp / A.el_ap) * 100)}% nas seções apuradas (1º turno: ${fpct((A.comp1 / A.el1) * 100)}%)`);
  }
  return { titulo, resumo, destaques: dest.slice(0, 4), o_que_falta: falta, confianca: conf, aviso: AVISO_IA, momento: iso(S.t), origem };
}
for (const m of IA_MINUTOS) { const i = MOMS.findIndex((S) => S.t === m); if (i > 0) IA.push({ i, obj: gerarIA(i, m === 60 || m === 115 ? 'template' : 'ia') }); }
IA.push({ i: idxFinal, obj: gerarIA(idxFinal, 'ia') });
const iaAte = (i) => IA.filter((x) => x.i <= i).sort((a, b) => b.i - a.i).map((x) => x.obj);

// ---------------------------------------------------------------- montagem dos arquivos
function brJson(i, statusOverride, extraEventos = [], geradoSeg = 5) {
  const S = simularMomento(munis, MOMS[i].t); // recalcula estado municipal do momento
  Object.assign(S, MOMS[i]);
  const final = i === idxFinal;
  const status = final ? 'final' : (statusOverride ?? (S.ag.br.secoes_ap === 0 ? 'aguardando' : 'ao_vivo'));
  const ia = iaAte(i)[0] ?? null;
  const evs = [...extraEventos, ...eventosAte(i)];
  return {
    S,
    br: {
      gerado_em: iso(S.t, geradoSeg), eleicao: ELEICAO, titulo: TITULO, status, atualizado_tse: tse(S.t),
      candidatos: CANDIDATOS,
      apuracao: apuracaoBR(S, final),
      projecao: projecaoBR(S, i),
      regioes: REG_ORDEM.map((r) => regiaoUF(S.ag.reg[r], r, REG_NOME[r], r, S)),
      ufs: UF_ORDEM.map((u) => regiaoUF(S.ag.uf[u], u, UF_NOME[u], UF_REG[u], S)),
      ia, eventos_recentes: evs.slice(0, 5), aviso: AVISO,
    },
  };
}
function timelinePonto(S, A) {
  const disp = S.disponivel;
  const pr = disp ? projDe(A, S.ag.br.proj13 + S.ag.br.proj22, A === S.ag.br) : null;
  return {
    momento: iso(S.t), pct_secoes: r2((A.secoes_ap / A.secoes) * 100),
    pct: A.validos > 0 ? par13((A.v13 / A.validos) * 100) : par13(null),
    p1: disp ? { '13': r2(A.p1 * 100) } : null,
    p2: disp ? { '13': pr.pct['13'] } : null,
    ic95: disp ? { '13': pr.ic95['13'] } : null,
    prob: disp ? { '13': pr.prob['13'] } : null,
    confianca: S.confianca,
  };
}
const write = (rel, obj, pretty = false) => { const f = path.join(OUT, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, pretty ? JSON.stringify(obj, null, 2) + '\n' : JSON.stringify(obj)); };

// diagnóstico
if (DIAG) {
  console.error('hora   pct   placar13  p1_13  p2_13  prob13 conf  NE%   S%   vr');
  for (const S of MOMS) console.error(`${hhmm(S.t)} ${String(S.pct).padStart(6)} ${S.off13 === null ? '   -  ' : S.off13.toFixed(2).padStart(6)}  ${S.disponivel ? (S.ag.br.p1 * 100).toFixed(2) : '  -  '}  ${S.pr ? S.pr.p13.toFixed(2) : '  -  '}  ${S.pr ? S.pr.prob['13'].toFixed(3) : '  -  '} ${S.confianca.slice(0, 4)} ${(S.ag.reg.NE.secoes_ap / S.ag.reg.NE.secoes * 100).toFixed(0).padStart(4)} ${(S.ag.reg.S.secoes_ap / S.ag.reg.S.secoes * 100).toFixed(0).padStart(4)} ${(S.ag.br.vr / 1e6).toFixed(1)}`);
}

// escolha do momento "latest"
let iLatest;
if (ARG_FINAL) iLatest = idxFinal;
else if (ARG_PCT !== null) { iLatest = 1; let best = Infinity; MOMS.forEach((S, i) => { if (i > 0 && Math.abs(S.pct - ARG_PCT) < best) { best = Math.abs(S.pct - ARG_PCT); iLatest = i; } }); }
else iLatest = MOMS.findIndex((S) => S.t === 140); // 19:20

// latest/*
{
  const extra = [];
  if (ARG_PARADO && iLatest !== idxFinal) extra.push({ momento: iso(MOMS[iLatest].t, 300), tipo: 'fonte_parada', texto: 'TSE sem atualização há mais de 5 minutos durante a apuração. Os números exibidos são os da última divulgação.', abrangencia: 'br' });
  const { S, br } = brJson(iLatest, ARG_PARADO ? 'parado' : null, extra, ARG_PARADO ? 418 : 5);
  const t = MOMS[iLatest].t;
  write('latest/br.json', br);
  for (const u of UF_ORDEM) {
    write(`latest/uf/${u}.json`, { gerado_em: br.gerado_em, uf: u, nome: UF_NOME[u], regiao: UF_REG[u], resumo: br.ufs.find((x) => x.codigo === u), municipios: munis.filter((m) => m.uf === u).map((m) => municipioObj(m, S.disponivel)) });
  }
  write('latest/municipios.json', municipiosCompacto(munis, S, br.gerado_em));
  // timelines até o momento latest
  const tl = { br: [], uf: {}, reg: {} };
  for (let i = 0; i <= iLatest; i++) {
    const M = MOMS[i];
    tl.br.push(timelinePonto(M, M.ag.br));
    for (const u of UF_ORDEM) (tl.uf[u] ??= []).push(timelinePonto(M, M.ag.uf[u]));
    for (const r of REG_ORDEM) (tl.reg[r] ??= []).push(timelinePonto(M, M.ag.reg[r]));
  }
  write('timeline/br.json', { pontos: tl.br });
  for (const u of UF_ORDEM) write(`timeline/uf/${u}.json`, { pontos: tl.uf[u] });
  for (const r of REG_ORDEM) write(`timeline/regiao/${r}.json`, { pontos: tl.reg[r] });
  write('ia/historico.json', { analises: iaAte(iLatest) }, true);
  write('eventos.json', { eventos: [...extra, ...eventosAte(iLatest)] }, true);
  const seg = ARG_PARADO ? 420 : 20;
  write('status.json', {
    gerado_em: iso(t, seg), status: br.status, atualizado_tse: br.atualizado_tse, segundos_desde_tse: seg,
    coletor: { ultimo_ciclo: iso(t, seg - 6), requisicoes: 1800 + iLatest * 37, erros: ARG_PARADO ? 14 : 0, urls_bloqueadas: 0, ultimo_idg: String(3943000 + iLatest * 11) },
    motor: { ultimo_calculo: br.gerado_em, duracao_s: 3.2 },
    alertas: ARG_PARADO ? [{ tipo: 'fonte_parada', texto: 'TSE sem atualização há 7 minutos.', momento: iso(t, seg) }] : [],
  }, true);
  console.log(`latest: ${br.gerado_em} pct_secoes=${br.apuracao.pct_secoes} status=${br.status} placar13=${br.apuracao.pct['13']} p1=${br.projecao.p1?.pct['13'] ?? null} p2=${br.projecao.p2?.pct['13'] ?? null} prob13=${br.projecao.p2?.prob['13'] ?? null} conf=${br.projecao.confianca}`);
}

// replay (sempre a noite inteira)
{
  const alvo = [65, 85, 105, 120, 130, 140, 150, 160, 170, 180, 195, 210, 240];
  const idxs = [...new Set([...alvo.map((m) => MOMS.findIndex((S) => S.t === m)).filter((i) => i > 0 && i < idxFinal && MOMS[i].pct < 100), idxFinal])].sort((a, b) => a - b);
  const momentos = [];
  for (const i of idxs) {
    const { S, br } = brJson(i, null);
    const id = idMomento(MOMS[i].t);
    write(`replay/6258/${id}.json`, { br, municipios: municipiosCompacto(munis, S, br.gerado_em) });
    momentos.push({ id, momento: iso(MOMS[i].t), pct_secoes: br.apuracao.pct_secoes });
  }
  write('replay/index.json', { eleicoes: [{ id: '6258', titulo: '2º turno 2026 (simulação)' }] }, true);
  write('replay/6258/index.json', { eleicao: '6258', titulo: '2º turno 2026 (simulação)', momentos }, true);
  console.log(`replay: ${momentos.length} momentos (${momentos[0].pct_secoes}% .. ${momentos.at(-1).pct_secoes}%)`);
}
