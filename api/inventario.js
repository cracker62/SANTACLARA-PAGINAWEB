/* GET /api/inventario → script que reemplaza window.SANTA_CLARA con el inventario en vivo de la hoja de la empresa.
   Las páginas lo cargan justo después de data/santa-clara.js: si esta ruta falla, queda el inventario del archivo.
   GET /api/inventario?formato=json → solo los estados y precios, para que una página abierta se actualice sola. */
import { inventarioVivo } from "./_lib/inventario.js";

export default async function handler(req, res) {
  const { datos, fuente } = await inventarioVivo();
  // Sin "stale-while-revalidate": nunca se entrega una copia vieja de la hoja; como máximo tiene 20 s.
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=20");
  if ((req.query && req.query.formato) === "json") {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    return res.status(200).send(JSON.stringify({
      fuente: datos.fuente || { tipo: fuente },
      lotes: datos.lots.map((l) => [l.id, l.estado, l.precio, l.vm2, l.ubic, l.mat, l.etapa])
    }));
  }
  res.setHeader("Content-Type", "application/javascript; charset=utf-8");
  res.status(200).send(fuente === "hoja" ? "window.SANTA_CLARA=" + JSON.stringify(datos) + ";" : "/* inventario del archivo */");
}
