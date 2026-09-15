/* GET /api/inventario → script que reemplaza window.SANTA_CLARA con el inventario en vivo de la hoja de la empresa.
   Las páginas lo cargan justo después de data/santa-clara.js: si esta ruta falla, queda el inventario del archivo. */
import { inventarioVivo } from "./_lib/inventario.js";

export default async function handler(req, res) {
  const { datos, fuente } = await inventarioVivo();
  res.setHeader("Content-Type", "application/javascript; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=60, stale-while-revalidate=300");
  res.status(200).send(fuente === "hoja" ? "window.SANTA_CLARA=" + JSON.stringify(datos) + ";" : "/* inventario del archivo */");
}
