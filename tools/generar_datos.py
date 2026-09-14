"""
Une el plano (geometría + áreas) con el listado de precios (valor m², ubicación, matrícula, estado)
y genera data/santa-clara.js para el sitio web.

Uso:  python tools/generar_datos.py "RUTA/LISTADO.pdf"
Requiere haber corrido antes tools/extraer_plano.py (tools/plano-raw.json).

Reglas acordadas con Monte Olimpo:
  - El ÁREA sale del plano. El precio = área del plano × valor m² del listado.
  - Precio m², ubicación, matrícula y estado salen del listado.
  - "DESC. APLICADO" se publica como ubicación "Medio" (sin la palabra descuento).
  - Matrícula "Proximamente" se publica como "En trámite".
  - "SISTEMA AGUA" es zona técnica: no se vende.
  - Lotes del plano que no están en el listado se muestran como "Próximamente" (no seleccionables).
"""
import sys, json, re, collections
import pypdf

LISTADO = sys.argv[1]
raw = json.load(open("tools/plano-raw.json", encoding="utf-8"))

rows = {}
for page in pypdf.PdfReader(LISTADO).pages:
    for line in (page.extract_text() or "").splitlines():
        m = re.match(r"^(\d) (\S+) (\S+) (\d+) \$([\d.]+) \$([\d.]+) (.+?) (\S+) (DISPONIBLE|VENDIDO|SISTEMA AGUA)$", line.strip())
        if m:
            et, mz, lote, area, vm2, valor, ubic, mat, estado = m.groups()
            rows[(mz, lote)] = dict(etapa=int(et), mz=mz, lote=lote, area=int(area), vm2=int(vm2.replace(".", "")),
                                    valor=int(valor.replace(".", "")), ubic=ubic, mat=mat, estado=estado)


def listado_for(mz, num):
    """Busca el lote del plano en el listado, tolerando A/A1, E/E1 y sublotes (O 1-1 → O 1)."""
    alias = {"A1": ["A1", "A"], "E": ["E1", "E"], "F1": ["F1", "F"]}.get(mz, [mz])
    for a in alias:
        if (a, num) in rows:
            return rows[(a, num)], False
    if "-" in num:
        parent = num.split("-")[0]
        for a in alias:
            if (a, parent) in rows and not any((a, num) == k for k in rows):
                return rows[(a, parent)], True
    return None, False


# Escala del dibujo: pixeles por m², calibrada con los lotes donde plano y listado coinciden
ratios = []
for l in raw["lots"]:
    s, sub = listado_for(l["mz"], l["num"])
    if s and not sub and l["area_plano"] and abs(l["area_plano"] - s["area"]) < 1:
        ratios.append(l["px_area"] / s["area"])
PX_PER_M2 = sorted(ratios)[len(ratios) // 2]
# Lotes cuyo dibujo queda recortado por el círculo "Mz" del plano: no se pueden medir, se usa el listado.
MEDICION_NO_CONFIABLE = {"L-11", "L-12"}


def area_final(l, src):
    """Área del plano. Si el rótulo del plano y el listado difieren más de 5 %, se mide el lote dibujado
    y se usa el valor que coincide con el dibujo (corrige rótulos copiados por error)."""
    plano = l["area_plano"]
    if src and f'{l["mz"]}-{l["num"]}' in MEDICION_NO_CONFIABLE:
        return src["area"], None
    if not src or abs(plano - src["area"]) / src["area"] <= 0.05:
        return plano, None
    medida = l["px_area"] / PX_PER_M2
    elegido = plano if abs(medida - plano) <= abs(medida - src["area"]) else src["area"]
    return elegido, round(medida)


VB = dict(x=380, y=60, w=2040, h=1930)
r1 = lambda v: round(v * 2) / 2
report = collections.defaultdict(list)
lots, used = [], set()
for l in sorted(raw["lots"], key=lambda l: (l["mz"], [int(x) for x in l["num"].split("-")])):
    src, is_sub = listado_for(l["mz"], l["num"])
    area, medida = area_final(l, None if is_sub else src)
    item = dict(id=f'{l["mz"]}-{l["num"]}', mz=l["mz"], n=l["num"], area=area,
                cx=r1(l["cx"] - VB["x"]), cy=r1(l["cy"] - VB["y"]),
                pts=" ".join(f"{r1(x - VB['x'])},{r1(y - VB['y'])}" for x, y in l["pts"]))
    if not src:
        if l.get("vendido_plano"):
            item.update(estado="vendido")
            report["No está en el listado; el plano lo marca vendido"].append(item["id"])
        else:
            item.update(estado="proximamente")
            report["En el plano pero no en el listado (Próximamente)"].append(item["id"])
    else:
        used.add((src["mz"], src["lote"]))
        item["mz"] = src["mz"]
        item["id"] = f'{src["mz"]}-{l["num"]}'
        estado = {"DISPONIBLE": "disponible", "VENDIDO": "vendido", "SISTEMA AGUA": "tecnico"}[src["estado"]]
        precio = round(area * src["vm2"])
        item.update(etapa=src["etapa"], vm2=src["vm2"], precio=precio,
                    ubic="Medio" if src["ubic"] == "DESC. APLICADO" else src["ubic"].title().replace("A1", "A1").replace("A2", "A2"),
                    mat="En trámite" if src["mat"].lower().startswith("proxim") else src["mat"], estado=estado)
        if is_sub:
            report["Sublote del plano que en el listado es un solo lote (precio = área × valor m² del lote madre)"].append(
                f'{item["id"]}: {area} m² del lote {src["mz"]}-{src["lote"]} ({src["area"]} m²)')
        elif medida is not None:
            report["Rótulo del plano distinto al listado: se midió el lote dibujado"].append(
                f'{item["id"]}: rótulo plano {l["area_plano"]:g} m² · listado {src["area"]} m² · medido ≈{medida} m² → se usa {area:g} m² (${precio:,.0f})'.replace(",", "."))
        elif abs(area - src["area"]) >= 1:
            report["Área distinta (menor al 5 %): se usa la del plano"].append(
                f'{item["id"]}: plano {area:g} m² vs listado {src["area"]} m² → ${precio:,.0f} (listado ${src["valor"]:,.0f})'.replace(",", "."))
        if l.get("vendido_plano") and estado == "disponible":
            report["Punto rojo de vendido en el plano, pero DISPONIBLE en el listado"].append(item["id"])
        if not l.get("vendido_plano") and estado == "vendido":
            report["VENDIDO en el listado, sin punto rojo en el plano"].append(item["id"])
    lots.append(item)

for k, r in rows.items():
    if k not in used:
        report["En el listado pero no encontrado en el plano"].append(f"{k[0]}-{k[1]}")

big_water = sorted(raw["water"], key=len, reverse=True)
water = []
for w in raw["water"]:
    xs = [p[0] for p in w]; ys = [p[1] for p in w]
    if (max(xs) - min(xs)) * (max(ys) - min(ys)) > 3000:
        water.append(" ".join(f"{r1(x - VB['x'])},{r1(y - VB['y'])}" for x, y in w))
site = [" ".join(f"{r1(x - VB['x'])},{r1(y - VB['y'])}" for x, y in s) for s in raw["site"]]
pois = [dict(t=p["t"], x=r1(p["cx"] - VB["x"]), y=r1(p["cy"] - VB["y"])) for p in raw["pois"]]
mz_names = {"E": "E1"}
manzanas = [dict(mz=mz_names.get(k, k), x=r1(v[0] - VB["x"]), y=r1(v[1] - VB["y"])) for k, v in raw["mz_labels"].items()]

data = dict(fuente=dict(plano="PLANO SANTA CLARA 01 SEPTIEMBRE 2026", listado="LISTADO DE PRECIOS 01-09-2026"),
            viewBox=[0, 0, VB["w"], VB["h"]], site=site, water=water, pois=pois, manzanas=manzanas, lots=lots)
with open("data/santa-clara.js", "w", encoding="utf-8") as f:
    f.write("/* Generado por tools/generar_datos.py. No editar a mano: actualiza el plano/listado y vuelve a correr. */\n")
    f.write("window.SANTA_CLARA = ")
    json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    f.write(";\n")

c = collections.Counter(l["estado"] for l in lots)
with open("tools/reporte-datos.md", "w", encoding="utf-8") as f:
    f.write(f"# Reporte de cruce plano vs listado\n\nLotes: {len(lots)} · {dict(c)}\n\n")
    for k, v in report.items():
        f.write(f"## {k} ({len(v)})\n\n" + "\n".join(f"- {x}" for x in v) + "\n\n")
print("lotes", len(lots), dict(c))
for k, v in report.items():
    print(f"{k}: {len(v)}")
    for x in v[:40]:
        print("   ", x)
