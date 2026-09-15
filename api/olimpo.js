/* Función serverless (Vercel): POST /api/olimpo  { messages: [{ role, content }] } → { respuesta } */
import { manejar, ErrorOlimpo } from "./_lib/olimpo.js";

export default async function handler(req, res) {
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ error: "Método no permitido" }); }
  const origen = process.env.OLIMPO_ORIGEN;
  if (origen && req.headers.origin && req.headers.origin !== origen) return res.status(403).json({ error: "Origen no permitido" });
  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket?.remoteAddress;
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body;
    res.status(200).json(await manejar(body, ip));
  } catch (e) {
    const status = e instanceof ErrorOlimpo ? e.status : 500;
    if (status === 500) console.error("[olimpo]", e);
    res.status(status).json({ error: e instanceof ErrorOlimpo ? e.message : "Error interno" });
  }
}
