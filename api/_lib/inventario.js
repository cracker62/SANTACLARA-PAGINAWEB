/*
 * Inventario en vivo de Santa Clara.
 * Toma la geometría del plano (data/santa-clara.js) y le aplica lo que diga la hoja de Google de la empresa:
 * estado, valor por m², ubicación, matrícula y etapa. Mismas reglas que tools/generar_datos.py:
 *   - el área sale del plano (ya corregida); precio = área × valor m² de la hoja
 *   - DISPONIBLE / VENDIDO / RESERVADO / SISTEMA AGUA; fila sin estado o sin fila = próximamente
 *   - "DESC. APLICADO" se publica como "Medio"; matrícula "Proximamente" como "En trámite"
 * Si la hoja no responde, se usa el inventario del archivo tal cual.
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const HOJA_CSV = (id, gid) => `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`;
const ESTADOS = { DISPONIBLE: "disponible", VENDIDO: "vendido", RESERVADO: "reservado", "SISTEMA AGUA": "tecnico" };
const ALIAS = { A1: ["A1", "A"], E: ["E1", "E"], F1: ["F1", "F"] };

function cargar(archivo) {
  const ctx = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(process.cwd(), archivo), "utf8"), ctx, { filename: archivo });
  return ctx.window;
}

/* CSV simple con comillas */
function parseCSV(txt) {
  const filas = []; let fila = [], campo = "", comillas = false;
  for (let i = 0; i < txt.length; i++) {
    const c = txt[i];
    if (comillas) {
      if (c === '"' && txt[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') comillas = false;
      else campo += c;
    } else if (c === '"') comillas = true;
    else if (c === ",") { fila.push(campo); campo = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && txt[i + 1] === "\n") i++;
      fila.push(campo); filas.push(fila); fila = []; campo = "";
    } else campo += c;
  }
  if (campo || fila.length) { fila.push(campo); filas.push(fila); }
  return filas;
}

const numero = (s) => +String(s || "").replace(/[^\d]/g, "") || 0;
const titulo = (s) => s.toLowerCase().replace(/(^|\s)\S/g, (m) => m.toUpperCase());

export function aplicarHoja(sc, csv) {
  const filas = parseCSV(csv);
  const ini = filas.findIndex((f) => (f[0] || "").trim().toUpperCase() === "ETAPA");
  if (ini < 0) throw new Error("La hoja no tiene la fila de encabezados ETAPA/MZ/LOTE");
  const col = {}; filas[ini].forEach((h, i) => { col[h.trim().toUpperCase()] = i; });
  const hoja = new Map();
  for (const f of filas.slice(ini + 1)) {
    const mz = (f[col.MZ] || "").trim().toUpperCase(), lote = (f[col.LOTE] || "").trim();
    if (mz && lote) hoja.set(mz + "|" + lote, f);
  }
  if (hoja.size < 50) throw new Error("La hoja trae muy pocos lotes (" + hoja.size + ")");

  const lots = sc.lots.map((l) => {
    let f = null;
    for (const a of ALIAS[l.mz] || [l.mz]) { f = hoja.get(a + "|" + l.n); if (f) break; }
    const n = { ...l };
    if (!f) { if (n.estado !== "vendido") n.estado = "proximamente"; return n; }
    const estadoHoja = (f[col.ESTADO] || "").trim().toUpperCase();
    n.estado = ESTADOS[estadoHoja] || "proximamente";
    const vm2 = numero(f[col["V. M2"]]);
    if (vm2 && n.area) { n.vm2 = vm2; n.precio = Math.round(n.area * vm2); }
    const et = numero(f[col.ETAPA]); if (et) n.etapa = et;
    const ubic = (f[col.UBICACION] || "").trim();
    if (ubic) n.ubic = ubic.toUpperCase() === "DESC. APLICADO" ? "Medio" : titulo(ubic);
    const mat = (f[col.MATRICULA] || "").trim();
    if (mat) n.mat = /^proxim/i.test(mat) ? "En trámite" : mat;
    return n;
  });
  return { ...sc, lots };
}

let cache = { t: 0, datos: null, fuente: "archivo" };

/* Devuelve { datos, fuente }; guarda en memoria 20 s para no consultar la hoja en cada visita */
export async function inventarioVivo() {
  if (cache.datos && Date.now() - cache.t < 20000) return cache;
  const w = cargar("data/config.js");
  const base = cargar("data/santa-clara.js").SANTA_CLARA;
  const cfg = w.MO_CONFIG.inventario_vivo;
  if (!cfg || !cfg.hoja_id) return (cache = { t: Date.now(), datos: base, fuente: "archivo" });
  try {
    const ctrl = new AbortController(); const limite = setTimeout(() => ctrl.abort(), 4000);
    const r = await fetch(HOJA_CSV(cfg.hoja_id, cfg.gid), { signal: ctrl.signal, redirect: "follow" });
    clearTimeout(limite);
    if (!r.ok) throw new Error("hoja " + r.status);
    const datos = aplicarHoja(base, await r.text());
    datos.fuente = { tipo: "hoja", actualizado: new Date().toISOString() };
    cache = { t: Date.now(), datos, fuente: "hoja" };
  } catch (e) {
    console.error("[inventario] uso el archivo:", e.message);
    cache = { t: Date.now() - 10000, datos: cache.datos || base, fuente: cache.datos ? cache.fuente : "archivo" };
  }
  return cache;
}
