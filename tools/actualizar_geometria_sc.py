"""
Corrige la FORMA de los lotes de Santa Clara y les agrega FRENTE y FONDO, leyendo el plano en PDF
como vector (líneas exactas del arquitecto), sin tocar precios, estados ni matrículas.

    python tools/actualizar_geometria_sc.py "ruta/PLANO SANTA CLARA 24 SEPTIEMBRE 2026 Vendidos.pdf"

Por qué: la versión anterior del plano web se sacó "pintando" el PDF como imagen; donde una cota
naranja cruzaba un lote (ej. F1-14) el lote quedaba partido o corto. Aquí solo se usan los
linderos de cada manzana (trazo de color, grueso) y las cotas se leen aparte como medidas.

Cómo:
  1. Linderos = trazos de 0,7 a 3 pt (o de pelo, del color de la manzana) que no son el naranja de las
     cotas. Las esquinas abiertas se cierran de varias maneras (tal cual, alargando 1 a 8 unidades,
     o prolongando hasta la línea más cercana) y cada manera da formas candidatas.
  2. Cada número grande del plano se empata con el lote de la web que tiene ese número en ese sitio
     (así conserva su manzana, precio y estado), y el lote toma la forma candidata cuya área coincide
     con su área oficial (±8 %). Si ninguna coincide, se deja la forma anterior y va al reporte.
  3. Escala: se calcula con los rótulos "A=xxx m2" (mediana), y con ella se miden los lados.
     Frente = lado corto y fondo = lado largo del rectángulo que mejor encierra el lote; si el plano
     trae una cota que coincide (±0,6 m) se usa la cota. Los lotes irregulares guardan todos sus lados.
Al final escribe data/santa-clara.js y tools/reporte-geometria.md, y una imagen de control.
"""
import json
import math
import os
import re
import statistics
import sys
import warnings

import pymupdf
from shapely.geometry import LineString, Point, Polygon
from shapely.ops import polygonize, unary_union

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from extraer_monte_olimpo import alargar, extender  # mismas herramientas de cierre de líneas

warnings.filterwarnings("ignore")
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATOS = os.path.join(RAIZ, "data", "santa-clara.js")
REPORTE = os.path.join(RAIZ, "tools", "reporte-geometria.md")
CLIP = pymupdf.Rect(120, 60, 2420, 1990)
VB = (380, 60)                      # el plano web = coordenadas del PDF menos este corrimiento
NARANJA = (0.95, 0.4, 0.13)          # cotas y ejes
NO_LINDERO = {NARANJA, (0.87, 0.43, 0.0)}   # cotas, ejes y rellenos que no son linderos
GROSOR_MIN = 0.7                     # algunas manzanas (E1, K, L…) dividen sus lotes con trazo fino
TOLERANCIA = 0.08                    # la forma elegida debe dar el área oficial del lote (±8 %)
# Revisados a ojo sobre el plano: la forma automática no sirve y se deja la anterior
MANTENER = {"F1-11": "la forma automática incluye un pedazo de la calle Camilo Fayad"}


def leer_datos():
    t = open(DATOS, encoding="utf-8").read()
    i, j = t.index("{"), t.rstrip().rindex(";")
    return t[:i], json.loads(t[i:j]), t[j:]


def pts_de(texto):
    return [tuple(map(float, p.split(","))) for p in texto.split()]


def main(pdf):
    pagina = pymupdf.open(pdf)[0]
    lineas, circulos = [], []
    for d in pagina.get_drawings():
        w, c = d.get("width") or 0, d.get("color")
        color = tuple(round(x, 2) for x in c) if c else None
        # E1 y A1 dividen sus lotes con línea "de pelo" (grosor 0) del color de la manzana
        pelo = w == 0 and not d.get("fill") and color not in NO_LINDERO | {(0.0, 0.0, 0.0), (0.0, 1.0, 0.0)}
        if not c or not (GROSOR_MIN <= w <= 3 or pelo) or not CLIP.contains(d["rect"]) or color in NO_LINDERO:
            continue
        r = d["rect"]
        if len(d["items"]) >= 4 and all(it[0] == "c" for it in d["items"]) and 15 < r.width < 60 and abs(r.width - r.height) < 6:
            circulos.append(Point((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2).buffer(r.width / 2 + 1))
            continue  # círculo completo del rótulo "Mz-X": tapa la esquina de un lote, no es lindero
        for it in d["items"]:
            if it[0] == "l":
                lineas.append(LineString([(it[1].x, it[1].y), (it[2].x, it[2].y)]))
            elif it[0] == "c":
                lineas.append(LineString([(q.x, q.y) for q in it[1:5]]))
            elif it[0] == "re":
                r = it[1]
                lineas.append(LineString([(r.x0, r.y0), (r.x1, r.y0), (r.x1, r.y1), (r.x0, r.y1), (r.x0, r.y0)]))
            elif it[0] == "qu":  # E1 dibuja cada lote como un cuadrilátero
                q = it[1]
                lineas.append(LineString([(q.ul.x, q.ul.y), (q.ur.x, q.ur.y), (q.lr.x, q.lr.y), (q.ll.x, q.ll.y), (q.ul.x, q.ul.y)]))
    # y el rayado de adentro de esos círculos tampoco es lindero
    lineas = [l for l in lineas if l.length > 0.5 and not any(c.contains(l) for c in circulos)]

    # Se lee palabra por palabra: en algunas filas los números vienen juntos ("13 14 15") en un solo texto
    numeros, rotulos, cotas = [], [], []
    for x0, y0, x1, y1, t, *_ in pagina.get_text("words"):
        pt, alto = Point((x0 + x1) / 2, (y0 + y1) / 2), y1 - y0
        if alto >= 12 and re.fullmatch(r"\d{1,2}(-\d)?", t):
            numeros.append((t, pt))
        m = re.match(r"A?=\s*([\d.,]+)", t)
        if m and alto < 8:
            try:
                rotulos.append((float(m.group(1).rstrip(".,").replace(",", ".")), pt))
            except ValueError:
                pass
        if alto < 8 and re.fullmatch(r"\d{1,3}([.,]\d{1,2})?", t):
            cotas.append((float(t.replace(",", ".")), pt))

    # El plano trae algunos números escritos dos veces en el mismo sitio: se deja uno
    unicos = {}
    for t, p in numeros:
        unicos.setdefault((t, round(p.x / 3), round(p.y / 3)), (t, p))
    numeros = list(unicos.values())

    # ---- formas candidatas: se cierran las líneas de varias maneras ----
    # (prolongar hasta 35 unidades cruza el hueco que deja el círculo de rótulo sobre la esquina de los lotes)
    cruzadas = extender(lineas, 35)
    redes = [lineas] + [[alargar(l, d) for l in lineas] for d in (1, 2, 3, 5, 8)] + [extender(lineas, 12), cruzadas, extender(cruzadas, 35)]
    candidatas = []   # (polígono, número, punto del número)
    for red in redes:
        for a in polygonize(unary_union(red)):
            if not 100 < a.area < 25000:
                continue
            dentro = [(t, p) for t, p in numeros if a.contains(p)]
            if len(dentro) == 1:
                candidatas.append((a, dentro[0][0], dentro[0][1]))

    # Áreas que quedaron con 2 a 4 lotes adentro (alrededor de un círculo de rótulo): se cortan con
    # sus propias divisiones internas, estiradas de lado a lado, y cada pedazo con un número es candidato
    vistos = set()
    for red in redes[:2]:
        for a in polygonize(unary_union(red)):
            dentro = [(t, p) for t, p in numeros if a.contains(p)]
            clave = round(a.area)
            if not 2 <= len(dentro) <= 4 or a.area > 14000 or clave in vistos:
                continue
            vistos.add(clave)
            cortes = []
            for l in lineas:
                if not a.buffer(-0.5).intersects(l):
                    continue
                (ax_, ay_), (bx_, by_) = l.coords[0], l.coords[-1]
                dx, dy = bx_ - ax_, by_ - ay_
                n = (dx * dx + dy * dy) ** 0.5
                if n < 1:
                    continue
                larga = LineString([(ax_ - dx / n * 300, ay_ - dy / n * 300), (bx_ + dx / n * 300, by_ + dy / n * 300)])
                cortes.append(larga.intersection(a))
            for pieza in polygonize(unary_union([a.exterior] + cortes)):
                if not a.buffer(0.1).contains(pieza) or pieza.area < 100:
                    continue
                uno = [(t, p) for t, p in dentro if pieza.contains(p)]
                if len(uno) == 1:
                    candidatas.append((pieza, uno[0][0], uno[0][1]))

    # ---- escala (unidades del PDF por metro), con los rótulos A=xxx m2 ----
    razones = []
    for a, t, p in candidatas:
        r = [v for v, q in rotulos if a.contains(q)]
        if len(r) == 1:
            razones.append(a.area / r[0])
    escala = math.sqrt(statistics.median(razones))

    # ---- cada lote de la web toma la forma candidata cuya área coincide con la oficial ----
    cabeza, datos, cola = leer_datos()
    web = datos["lots"]
    usados, reporte, cambios = set(), [], []
    etiquetas = {}
    for t, p in numeros:  # el número del plano que corresponde a cada lote de la web
        cand = [w for w in web if w["n"] == t]
        if not cand:
            reporte.append(f"Número {t} del plano sin lote en la web")
            continue
        w = min(cand, key=lambda w: Point(w["cx"] + VB[0], w["cy"] + VB[1]).distance(p))
        if Point(w["cx"] + VB[0], w["cy"] + VB[1]).distance(p) < 40 and w["id"] not in etiquetas:
            etiquetas[w["id"]] = p
    for w in web:
        if w["id"] in MANTENER:
            reporte.append(f"{w['id']}: se deja la forma anterior ({MANTENER[w['id']]})")
            continue
        p = etiquetas.get(w["id"])
        if p is None:
            reporte.append(f"{w['id']}: no encontré su número en el plano cerca de donde está en la web")
            continue
        opciones = [a for a, t, q in candidatas if q.equals(p)]
        if not opciones:
            vecinos = [t for t, q in numeros if q.distance(p) < 60 and not q.equals(p)]
            reporte.append(f"{w['id']}: su número no queda solo en ninguna área cerrada (números cerca: {', '.join(vecinos)})")
            continue
        # se prefiere la forma con el área oficial y sin "picos" (los lotes reales son figuras convexas)
        def puntaje(a):
            return abs(a.area / escala ** 2 - w["area"]) / w["area"] + (1 - a.area / a.convex_hull.area)
        mejor = min(opciones, key=puntaje)
        err = abs(mejor.area / escala ** 2 - w["area"]) / w["area"]
        if 1 - mejor.area / mejor.convex_hull.area > 0.12:
            reporte.append(f"{w['id']}: la única forma con su área tiene picos (no es un lote limpio); se deja la anterior")
            continue
        if err > TOLERANCIA:
            reporte.append(f"{w['id']}: en el plano ninguna forma da sus {w['area']:g} m² (la más cercana ≈{mejor.area / escala ** 2:.0f} m²); se deja la forma anterior")
            continue
        poly = mejor.simplify(0.15)
        antes = Polygon([(x + VB[0], y + VB[1]) for x, y in pts_de(w["pts"])]).buffer(0)
        dif = antes.symmetric_difference(poly).area / poly.area
        antes_bien = abs(antes.area / escala ** 2 - w["area"]) / w["area"] <= TOLERANCIA
        if dif > 0.45 and antes_bien:
            # la forma anterior ya tenía el área correcta y la nueva es muy distinta: no se arriesga
            reporte.append(f"{w['id']}: la forma nueva cambia mucho ({dif * 100:.0f} %) y la anterior ya cuadraba; se deja la anterior")
            continue
        usados.add(w["id"])
        # medidas en metros
        rect = poly.minimum_rotated_rectangle
        rc = list(rect.exterior.coords)
        a_, b_ = LineString(rc[0:2]).length / escala, LineString(rc[1:3]).length / escala
        cercanas = [v for v, q in cotas if poly.buffer(6).contains(q)]
        def ajustar(m):
            c = min(cercanas, key=lambda v: abs(v - m)) if cercanas else None
            return round(c, 2) if c is not None and abs(c - m) <= 0.6 else round(m, 1)
        irregular = poly.area / rect.area < 0.93
        lados = []
        coords = list(poly.exterior.coords)
        for i in range(len(coords) - 1):
            m = LineString(coords[i:i + 2]).length / escala
            if m >= 2:
                lados.append(ajustar(m))
        w["pts"] = " ".join(f"{round(x - VB[0], 1)},{round(y - VB[1], 1)}" for x, y in list(poly.exterior.coords)[:-1])
        c = poly.centroid if poly.centroid.within(poly) else poly.representative_point()
        w["cx"], w["cy"] = round(c.x - VB[0], 1), round(c.y - VB[1], 1)
        w["frente"], w["fondo"] = ajustar(min(a_, b_)), ajustar(max(a_, b_))
        if irregular:
            w["lados"] = lados
        else:
            w.pop("lados", None)
        if dif > 0.2:
            cambios.append(f"{w['id']}: forma corregida (cambió {dif * 100:.0f} %)")

    # Lotes que conservan su forma anterior: si esa forma da su área, se miden igual
    for w in web:
        if w["id"] in usados:
            continue
        poly = Polygon([(x + VB[0], y + VB[1]) for x, y in pts_de(w["pts"])]).buffer(0)
        w.pop("frente", None); w.pop("fondo", None); w.pop("lados", None)
        if abs(poly.area / escala ** 2 - w["area"]) / w["area"] > TOLERANCIA:
            continue
        rc = list(poly.minimum_rotated_rectangle.exterior.coords)
        a_, b_ = LineString(rc[0:2]).length / escala, LineString(rc[1:3]).length / escala
        cercanas = [v for v, q in cotas if poly.buffer(6).contains(q)]
        def ajustar(m):
            c = min(cercanas, key=lambda v: abs(v - m)) if cercanas else None
            return round(c, 2) if c is not None and abs(c - m) <= 0.6 else round(m, 1)
        w["frente"], w["fondo"] = ajustar(min(a_, b_)), ajustar(max(a_, b_))

    faltan = [w["id"] for w in web if w["id"] not in usados]
    with open(DATOS, "w", encoding="utf-8") as f:
        f.write(cabeza + json.dumps(datos, ensure_ascii=False, separators=(",", ":")) + cola)

    with open(REPORTE, "w", encoding="utf-8") as f:
        f.write(f"# Geometría de Santa Clara desde {os.path.basename(pdf)}\n\n")
        f.write(f"Escala: {escala:.3f} unidades por metro · lotes actualizados: {len(usados)} de {len(web)}\n\n")
        f.write("## Lotes con la forma corregida\n\n" + "\n".join("- " + c for c in cambios) + "\n\n")
        f.write("## Para revisar\n\n" + "\n".join("- " + r for r in reporte) + "\n\n")
        f.write("## Lotes de la web que no se encontraron en el plano (quedan como estaban)\n\n" + "\n".join("- " + x for x in faltan) + "\n")
    print(f"Escala {escala:.3f} u/m · actualizados {len(usados)} de {len(web)} · formas corregidas {len(cambios)} · sin encontrar {len(faltan)}")
    print("Reporte en tools/reporte-geometria.md")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    main(sys.argv[1])
