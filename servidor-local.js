/*
 * Servidor local para probar el sitio completo, incluido Olimpo con IA.
 *   1) npm install
 *   2) crea un archivo .env con ANTHROPIC_API_KEY=... (ver .env.example)
 *   3) npm start  →  http://localhost:3000
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { manejar, ErrorOlimpo } from "./api/_lib/olimpo.js";
import { inventarioVivo } from "./api/_lib/inventario.js";

if (fs.existsSync(".env")) {
  for (const linea of fs.readFileSync(".env", "utf8").split(/\r?\n/)) {
    const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const PUERTO = +process.env.PORT || 3000;
const RAIZ = process.cwd();
const TIPOS = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".mp4": "video/mp4", ".svg": "image/svg+xml" };
const PRIVADO = /^\/(api|tools|node_modules|\.env|servidor-local\.js|package)/;

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/api/inventario") {
    const { datos, fuente } = await inventarioVivo();
    if (url.searchParams.get("formato") === "json") {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      return res.end(JSON.stringify({
        fuente: datos.fuente || { tipo: fuente },
        lotes: datos.lots.map((l) => [l.id, l.estado, l.precio, l.vm2, l.ubic, l.mat, l.etapa])
      }));
    }
    res.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8" });
    return res.end(fuente === "hoja" ? "window.SANTA_CLARA=" + JSON.stringify(datos) + ";" : "/* inventario del archivo */");
  }
  if (url.pathname === "/api/olimpo") {
    if (req.method !== "POST") { res.writeHead(405); return res.end(); }
    let cuerpo = "";
    for await (const trozo of req) { cuerpo += trozo; if (cuerpo.length > 60000) break; }
    try {
      const datos = await manejar(JSON.parse(cuerpo || "{}"), req.socket.remoteAddress);
      res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify(datos));
    } catch (e) {
      const status = e instanceof ErrorOlimpo ? e.status : 500;
      if (status === 500) console.error("[olimpo]", e);
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: e instanceof ErrorOlimpo ? e.message : "Error interno" }));
    }
    return;
  }
  let ruta = decodeURIComponent(url.pathname);
  if (PRIVADO.test(ruta)) { res.writeHead(404); return res.end(); }
  if (ruta.endsWith("/")) ruta += "index.html";
  const archivo = path.join(RAIZ, path.normalize(ruta));
  if (!archivo.startsWith(RAIZ) || !fs.existsSync(archivo) || fs.statSync(archivo).isDirectory()) { res.writeHead(404); return res.end("No encontrado"); }
  res.writeHead(200, { "Content-Type": TIPOS[path.extname(archivo)] || "application/octet-stream" });
  fs.createReadStream(archivo).pipe(res);
}).listen(PUERTO, () => console.log(`Monte Olimpo en http://localhost:${PUERTO}  ·  Olimpo IA: ${process.env.ANTHROPIC_API_KEY ? "activo" : "sin clave (usa el motor local)"}`));
