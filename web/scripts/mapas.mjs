#!/usr/bin/env node
// Baixa as malhas do IBGE e gera TopoJSON em data/public/geo/.
//   cd web && node scripts/mapas.mjs   (ou: npm run mapas)
// Saídas (contrato em docs/contrato-json.md, seção "/data/geo/*"):
//   br-uf.json      objeto `uf`  { sigla: "sp", codarea: "35" }       (dissolvido da malha municipal)
//   br-mun.json     objeto `mun` { codarea: "3550308", uf: "sp" }     (simplificado, < 3 MB)
//   mun/{uf}.json   objeto `mun` { codarea: "3550308", uf: "sp" }
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mapshaper from 'mapshaper';
import { feature } from 'topojson-client';
import { geoArea } from 'd3-geo';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.join(ROOT, 'data', 'public', 'geo');
const TMP = path.join(os.tmpdir(), 'apuracao-mapas');

const IBGE = 'https://servicodados.ibge.gov.br/api';
const URL_ESTADOS = `${IBGE}/v1/localidades/estados`;
const URL_BR_MUN = `${IBGE}/v3/malhas/paises/BR?formato=application/json&intrarregiao=municipio&qualidade=minima`;
const urlUfMun = (sigla) =>
  `${IBGE}/v3/malhas/estados/${sigla.toUpperCase()}?formato=application/json&intrarregiao=municipio&qualidade=minima`;

// Simplificação (fração de vértices mantidos, Visvalingam ponderado do mapshaper).
const SIMPLIFY_BR_MUN = process.env.SIMPLIFY_BR_MUN || '35%';
const SIMPLIFY_UF_MUN = process.env.SIMPLIFY_UF_MUN || '100%';
const SIMPLIFY_BR_UF = process.env.SIMPLIFY_BR_UF || SIMPLIFY_BR_MUN;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function baixar(url, nomeCache, { tentativas = 4 } = {}) {
  const destino = path.join(TMP, nomeCache);
  let ultimoErro;
  for (let i = 1; i <= tentativas; i++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'apuracao-eleicao-2026/1.0 (mapas.mjs)', Accept: 'application/json' },
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const texto = await res.text();
      const json = JSON.parse(texto);
      await fs.writeFile(destino, texto);
      console.log(`  ok  ${url} (${kb(texto.length)})`);
      return json;
    } catch (e) {
      ultimoErro = e;
      console.warn(`  falha ${i}/${tentativas} ${url}: ${e.message}`);
      if (i < tentativas) await sleep(1000 * 2 ** (i - 1));
    }
  }
  throw new Error(`não foi possível baixar ${url}: ${ultimoErro?.message}`);
}

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;

// Normaliza a resposta do IBGE (TopoJSON ou GeoJSON) para uma lista de features GeoJSON
// ou um TopoJSON com um único objeto; devolve { nome, conteudo } para o mapshaper.
function anotarTopo(topo, ufPorCod) {
  for (const obj of Object.values(topo.objects)) {
    for (const g of obj.geometries) {
      const cod = String(g.properties?.codarea ?? '');
      const ufcod = cod.slice(0, 2);
      g.properties = { codarea: cod, uf: ufPorCod.get(ufcod), ufcod };
    }
  }
  return topo;
}

function anotarGeo(geo, ufPorCod) {
  for (const f of geo.features) {
    const cod = String(f.properties?.codarea ?? '');
    const ufcod = cod.slice(0, 2);
    f.properties = { codarea: cod, uf: ufPorCod.get(ufcod), ufcod };
  }
  return geo;
}

function anotar(json, ufPorCod) {
  if (json.type === 'Topology') return anotarTopo(json, ufPorCod);
  if (json.type === 'FeatureCollection') return anotarGeo(json, ufPorCod);
  throw new Error(`formato inesperado: ${json.type}`);
}

// Roda mapshaper em memória e devolve o TopoJSON resultante com o objeto renomeado.
async function ms(entrada, comandos, nomeObjeto) {
  const cmd = `-i entrada.json ${comandos} -o saida.json format=topojson quantization=100000 precision=0.000001`;
  const out = await mapshaper.applyCommands(cmd, { 'entrada.json': JSON.stringify(entrada) });
  const chaves = Object.keys(out);
  if (chaves.length !== 1) throw new Error(`mapshaper gerou ${chaves.length} arquivos: ${chaves}`);
  const topo = JSON.parse(out[chaves[0]]);
  const objs = Object.values(topo.objects);
  if (objs.length !== 1) throw new Error(`esperado 1 objeto, veio ${objs.length}`);
  topo.objects = { [nomeObjeto]: objs[0] };
  return topo;
}

// Junta TopoJSONs/GeoJSONs por UF numa única FeatureCollection (fallback).
function juntarPorUf(lista) {
  const features = [];
  for (const json of lista) {
    if (json.type === 'Topology') {
      for (const obj of Object.values(json.objects)) {
        const fc = feature(json, obj);
        features.push(...(fc.features ?? [fc]));
      }
    } else features.push(...json.features);
  }
  return { type: 'FeatureCollection', features };
}

async function gravar(rel, topo) {
  const destino = path.join(OUT, rel);
  await fs.mkdir(path.dirname(destino), { recursive: true });
  const texto = JSON.stringify(topo);
  await fs.writeFile(destino, texto);
  return { rel, bytes: Buffer.byteLength(texto), topo };
}

// Verificações: contagem, propriedades e orientação dos anéis (geoArea pequena).
function checar(res, nomeObj, { esperado, props } = {}) {
  const obj = res.topo.objects[nomeObj];
  if (!obj) throw new Error(`${res.rel}: objeto '${nomeObj}' ausente`);
  const fc = feature(res.topo, obj);
  const n = fc.features.length;
  if (esperado != null && n !== esperado) throw new Error(`${res.rel}: ${n} features, esperado ${esperado}`);
  let invertidos = 0;
  for (const f of fc.features) {
    for (const p of props ?? []) if (!f.properties?.[p]) throw new Error(`${res.rel}: feature sem '${p}'`);
    if (!f.geometry) throw new Error(`${res.rel}: feature ${f.properties?.codarea} sem geometria`);
    if (geoArea(f) > 2 * Math.PI) invertidos++;
  }
  if (invertidos) throw new Error(`${res.rel}: ${invertidos} features com anéis invertidos (geoArea ~4π)`);
  return { n, fc };
}

async function main() {
  await fs.mkdir(TMP, { recursive: true });
  await fs.mkdir(path.join(OUT, 'mun'), { recursive: true });
  console.log(`Downloads em ${TMP}`);

  const estados = await baixar(URL_ESTADOS, 'estados.json');
  const ufPorCod = new Map(estados.map((e) => [String(e.id), e.sigla.toLowerCase()]));
  if (ufPorCod.size !== 27) throw new Error(`esperadas 27 UFs, vieram ${ufPorCod.size}`);

  let brMun;
  try {
    brMun = await baixar(URL_BR_MUN, 'br-mun.json');
  } catch (e) {
    console.warn(`Malha nacional falhou (${e.message}); baixando por UF...`);
    const partes = [];
    for (const sigla of [...ufPorCod.values()].sort()) {
      partes.push(await baixar(urlUfMun(sigla), `mun-${sigla}.json`));
      await sleep(300);
    }
    brMun = juntarPorUf(partes);
  }
  brMun = anotar(brMun, ufPorCod);

  const resultados = [];

  // br-mun.json — país inteiro, simplificado.
  console.log('Gerando br-mun.json...');
  const topoBrMun = await ms(
    brMun,
    `-simplify ${SIMPLIFY_BR_MUN} keep-shapes -filter-fields codarea,uf`,
    'mun',
  );
  const rBrMun = await gravar('br-mun.json', topoBrMun);
  resultados.push({ ...rBrMun, ...checar(rBrMun, 'mun', { esperado: 5570, props: ['codarea', 'uf'] }) });
  if (rBrMun.bytes >= 3 * 1024 * 1024) throw new Error(`br-mun.json tem ${kb(rBrMun.bytes)} (>= 3 MB)`);

  // br-uf.json — dissolve dos municípios (já simplificados como no br-mun) por UF, para as
  // fronteiras coincidirem com as municipais. Simplificar DEPOIS do dissolve descartava
  // ilhas pequenas (ex.: Fernando de Noronha) mesmo com keep-shapes.
  console.log('Gerando br-uf.json...');
  const topoBrUf = await ms(
    brMun,
    `-simplify ${SIMPLIFY_BR_UF} keep-shapes -dissolve ufcod copy-fields=uf -rename-fields sigla=uf,codarea=ufcod -filter-fields sigla,codarea`,
    'uf',
  );
  const rBrUf = await gravar('br-uf.json', topoBrUf);
  const cBrUf = checar(rBrUf, 'uf', { esperado: 27, props: ['sigla', 'codarea'] });
  const siglas = cBrUf.fc.features.map((f) => f.properties.sigla).sort();
  const esperadas = [...ufPorCod.values()].sort();
  if (siglas.join() !== esperadas.join()) throw new Error(`siglas em br-uf.json divergentes: ${siglas}`);
  for (const f of cBrUf.fc.features)
    if (ufPorCod.get(f.properties.codarea) !== f.properties.sigla)
      throw new Error(`br-uf.json: codarea ${f.properties.codarea} != sigla ${f.properties.sigla}`);
  resultados.push({ ...rBrUf, ...cBrUf });

  // mun/{uf}.json — um arquivo por UF.
  console.log('Gerando mun/{uf}.json...');
  let soma = 0;
  for (const [ufcod, sigla] of [...ufPorCod].sort((a, b) => a[1].localeCompare(b[1]))) {
    const topo = await ms(
      brMun,
      `-filter "ufcod === '${ufcod}'" -simplify ${SIMPLIFY_UF_MUN} keep-shapes -filter-fields codarea,uf`,
      'mun',
    );
    const r = await gravar(`mun/${sigla}.json`, topo);
    const c = checar(r, 'mun', { props: ['codarea', 'uf'] });
    for (const f of c.fc.features)
      if (f.properties.uf !== sigla || !/^\d{7}$/.test(f.properties.codarea))
        throw new Error(`${r.rel}: propriedade inválida ${JSON.stringify(f.properties)}`);
    soma += c.n;
    resultados.push({ ...r, ...c });
  }
  if (soma !== 5570) throw new Error(`soma dos municípios por UF = ${soma}, esperado 5570`);

  // Spot-checks.
  const porRel = Object.fromEntries(resultados.map((r) => [r.rel, r]));
  const contagem = { 'mun/sp.json': 645, 'mun/mg.json': 853 };
  for (const [rel, n] of Object.entries(contagem))
    if (porRel[rel].n !== n) throw new Error(`${rel}: ${porRel[rel].n} municípios, esperado ${n}`);
  if (!porRel['mun/sp.json'].fc.features.some((f) => f.properties.codarea === '3550308'))
    throw new Error('mun/sp.json sem São Paulo (3550308)');

  console.log('\nArquivo'.padEnd(22) + 'Tamanho'.padStart(12) + 'Features'.padStart(10));
  for (const r of resultados)
    console.log(r.rel.padEnd(21) + kb(r.bytes).padStart(12) + String(r.n).padStart(10));
  console.log(`\nOK: ${resultados.length} arquivos em ${OUT} (soma municípios por UF = ${soma}).`);
}

main().catch((e) => {
  console.error(`ERRO: ${e.stack || e.message}`);
  process.exit(1);
});
