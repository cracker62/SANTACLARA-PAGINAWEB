"""
Extrae el plano de lotes de Monte Olimpo del DWG del topógrafo y genera data/monte-olimpo.js,
con el mismo formato de lotes que usa Santa Clara (id, mz, n, area, cx, cy, pts).

    python tools/extraer_monte_olimpo.py "ruta/ACAD-ACAD-LA LOMA DE LAS MERCEDES-Model-Model.dwg"

(El archivo se llama "La Loma de las Mercedes", pero es Monte Olimpo: manzanas A a la I, las
mismas del Excel de cartera, y queda junto a Monte Olimpo en el mapa.)

Cómo funciona:
  1. Si recibe un .dwg, lo pasa a .dxf con la consola de AutoCAD (accoreconsole) en una carpeta temporal.
  2. El diseño de lotes está dentro del bloque "fgh", ya ubicado sobre el levantamiento topográfico.
     Se toman sus líneas (capas "0" y "0-JARDI", donde están las manzanas del norte) y se arman las áreas cerradas.
  3. Cada área con un número de lote adentro es un lote; su área oficial es el rótulo "A=xxx m2".
  4. Los lotes que se tocan forman una manzana, y la manzana es el rótulo "Mz-X" que queda dentro de ella.
Al final imprime un reporte: lotes por manzana y diferencias entre el área dibujada y el rótulo.
"""
import json
import os
import re
import subprocess
import sys
import tempfile
import warnings

import ezdxf
from shapely.geometry import LineString, Point, Polygon
from shapely.ops import polygonize, unary_union

warnings.filterwarnings("ignore")
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SALIDA = os.path.join(RAIZ, "data", "monte-olimpo.js")
ACAD = r"C:\Program Files\Autodesk\AutoCAD 2027\accoreconsole.exe"
K = 2.0        # unidades del plano web por metro (Santa Clara usa ~1.9)
MARGEN = 30    # metros alrededor del lindero
EXTENDER = 16   # metros máximos que se prolonga una línea suelta hasta tocar otra


def a_dxf(ruta):
    if ruta.lower().endswith(".dxf"):
        return ruta
    tmp = tempfile.mkdtemp()
    dwg = os.path.join(tmp, "plano.dwg")
    dxf = os.path.join(tmp, "plano.dxf")
    with open(ruta, "rb") as a, open(dwg, "wb") as b:
        b.write(a.read())  # se trabaja sobre una copia: el original no se toca
    scr = os.path.join(tmp, "exportar.scr")
    with open(scr, "w") as f:
        f.write('FILEDIA 0\nCMDDIA 0\n_.DXFOUT\n"%s"\n_V\n_2018\n16\n' % dxf)
    subprocess.run([ACAD, "/i", dwg, "/s", scr], capture_output=True, timeout=300)
    if not os.path.exists(dxf):
        sys.exit("No se pudo convertir el DWG a DXF con AutoCAD.")
    return dxf


def alargar(linea, d):
    """Alarga una línea d metros por cada punta, sin cambiar su dirección."""
    c = list(linea.coords)
    if len(c) < 2:
        return linea
    def punta(a, b):
        dx, dy = a[0] - b[0], a[1] - b[1]
        n = (dx * dx + dy * dy) ** 0.5 or 1
        return (a[0] + dx / n * d, a[1] + dy / n * d)
    return LineString([punta(c[0], c[1])] + c[1:-1] + [punta(c[-1], c[-2])])


def extender(lineas, maximo=EXTENDER):
    """Como el comando EXTENDER de AutoCAD: cada punta suelta de una línea se prolonga en su misma
    dirección hasta tocar la línea más cercana (máximo `maximo` metros). Así cierran las divisiones
    internas que en el plano quedaron cortas antes del parque central de cada manzana."""
    from shapely.strtree import STRtree
    arbol = STRtree(lineas)
    salida = []
    for i, l in enumerate(lineas):
        c = list(l.coords)
        if len(c) < 2:
            salida.append(l)
            continue
        for extremo, vecino in ((0, 1), (-1, -2)):
            a, b = c[extremo], c[vecino]
            punta = Point(a)
            otros = [lineas[j] for j in arbol.query(punta.buffer(0.05)) if j != i]
            if any(o.distance(punta) < 0.05 for o in otros):
                continue  # ya toca otra línea
            dx, dy = a[0] - b[0], a[1] - b[1]
            n = (dx * dx + dy * dy) ** 0.5
            if not n:
                continue
            rayo = LineString([a, (a[0] + dx / n * maximo, a[1] + dy / n * maximo)])
            mejor = None
            for j in arbol.query(rayo):
                if j == i:
                    continue
                cruce = rayo.intersection(lineas[j])
                for q in getattr(cruce, "geoms", [cruce]):
                    if q.is_empty:
                        continue
                    if q.geom_type == "LineString":  # línea en la misma dirección: se une con su punta más cercana
                        q = min((Point(k) for k in q.coords), key=punta.distance)
                    elif q.geom_type != "Point":
                        continue
                    d = punta.distance(q)
                    if d > 0.01 and (mejor is None or d < mejor[0]):
                        mejor = (d, (q.x, q.y))
            if mejor:
                c[extremo] = mejor[1]
        salida.append(LineString(c))
    return salida


def texto(e):
    return (e.dxf.text if e.dxftype() == "TEXT" else e.plain_text()).strip().replace("\n", " ")


def main(ruta):
    doc = ezdxf.readfile(a_dxf(ruta))
    msp = doc.modelspace()
    diseno = [i for i in msp.query("INSERT") if i.dxf.name == "fgh"]
    if not diseno:
        sys.exit("No encontré el bloque del diseño de lotes (fgh).")
    ents = list(diseno[0].virtual_entities())

    lineas, textos = [], []
    for e in ents:
        t, capa = e.dxftype(), e.dxf.layer
        if t in ("TEXT", "MTEXT"):
            textos.append((capa, texto(e), Point(e.dxf.insert.x, e.dxf.insert.y)))
            continue
        if capa not in ("0", "0-JARDI"):
            continue
        if t == "LINE":
            lineas.append(LineString([(e.dxf.start.x, e.dxf.start.y), (e.dxf.end.x, e.dxf.end.y)]))
        elif t == "LWPOLYLINE":
            p = [(x, y) for x, y in e.get_points("xy")]
            if e.closed:
                p.append(p[0])
            if len(p) > 1:
                lineas.append(LineString(p))
        elif t == "ARC":
            p = [(v.x, v.y) for v in e.flattening(0.2)]
            if len(p) > 1:
                lineas.append(LineString(p))

    numeros = [(t, p) for c, t, p in textos if re.fullmatch(r"\d{1,2}", t) and c == "texto"]
    rotulos = [(int(re.match(r"A\s*=\s*([\d.,]+)", t).group(1).replace(".", "").replace(",", "")), p)
               for c, t, p in textos if re.match(r"A\s*=\s*\d", t)]
    manzanas = [(t.split("-")[1].strip(), p) for c, t, p in textos if re.match(r"Mz-[A-Z]$", t)]
    calles = [(t, p) for c, t, p in textos if t.upper().startswith("CALLE")]

    # Algunas divisiones internas quedan cortas antes del parque central. Primero se cierran las
    # esquinas casi abiertas (1,2 m) de dos formas; los que aún no cierran se prolongan hasta 16 m.
    lotes = []
    # (la última pasada se repite: así una división puede llegar hasta otra que ya se prolongó)
    pasadas = [[alargar(l, 1.2) for l in lineas], extender(lineas, 1.2), extender(lineas, EXTENDER),
               extender(extender(lineas, EXTENDER), EXTENDER)]
    for red in pasadas:
        for a in polygonize(unary_union(red)):
            if not 150 < a.area < 8000:
                continue
            dentro = [(t, p) for t, p in numeros if a.contains(p)]
            if len(dentro) != 1:
                continue
            if any(l["punto"].equals(dentro[0][1]) or l["poly"].intersection(a).area > 0.05 * a.area for l in lotes):
                continue
            r = [v for v, p in rotulos if a.contains(p)]
            lotes.append({"n": dentro[0][0], "punto": dentro[0][1], "poly": a, "rotulo": r[0] if len(r) == 1 else None})

    # Último recurso: un área que quedó con 2 a 4 lotes adentro se corta con sus divisiones internas,
    # estiradas de lado a lado (así se cierran los lotes alrededor de un parque que no está dibujado).
    for red in pasadas[1:]:
        for a in polygonize(unary_union(red)):
            dentro = [(t, p) for t, p in numeros if a.contains(p) and not any(l["punto"].equals(p) for l in lotes)]
            if not 2 <= len(dentro) <= 4 or a.area > 4000:
                continue
            cortes = []
            for l in lineas:
                if not a.buffer(-0.3).intersects(l):
                    continue
                c = list(l.coords)
                (ax_, ay_), (bx_, by_) = c[0], c[-1]
                dx, dy = bx_ - ax_, by_ - ay_
                n = (dx * dx + dy * dy) ** 0.5
                if n < 1:
                    continue
                larga = LineString([(ax_ - dx / n * 300, ay_ - dy / n * 300), (bx_ + dx / n * 300, by_ + dy / n * 300)])
                cortes.append(larga.intersection(a))
            for pieza in polygonize(unary_union([a.exterior] + cortes)):
                if not a.buffer(0.1).contains(pieza) or pieza.area < 150:
                    continue
                uno = [(t, p) for t, p in dentro if pieza.contains(p)]
                if len(uno) == 1 and not any(l["poly"].intersection(pieza).area > 0.05 * pieza.area for l in lotes):
                    r = [v for v, p in rotulos if pieza.contains(p)]
                    lotes.append({"n": uno[0][0], "punto": uno[0][1], "poly": pieza, "rotulo": r[0] if len(r) == 1 else None})

    # Y si un lote quedó pegado a un vecino que ya se encontró, es lo que sobra al quitarle ese vecino
    for t, p in numeros:
        if any(l["punto"].equals(p) for l in lotes):
            continue
        for red in pasadas:
            hecho = False
            for a in polygonize(unary_union(red)):
                if not a.contains(p) or a.area > 4000:
                    continue
                resto = a.difference(unary_union([l["poly"] for l in lotes if l["poly"].intersects(a)]).buffer(0.05))
                for pieza in getattr(resto, "geoms", [resto]):
                    if pieza.contains(p) and 150 < pieza.area < 2000:
                        r = [v for v, q in rotulos if pieza.contains(q)]
                        lotes.append({"n": t, "punto": p, "poly": pieza, "rotulo": r[0] if len(r) == 1 else None})
                        hecho = True
            if hecho:
                break

    # Manzanas: los lotes que se tocan forman un grupo; el rótulo Mz-X que cae dentro del grupo lo nombra.
    # Si un grupo no tiene rótulo adentro, va a la manzana más cercana donde no se repitan sus números.
    grupos = unary_union([l["poly"].buffer(0.6) for l in lotes])
    grupos = list(grupos.geoms) if hasattr(grupos, "geoms") else [grupos]
    miembros = [[l for l in lotes if g.contains(l["poly"].representative_point())] for g in grupos]
    sin_rotulo = []
    for g, ls in zip(grupos, miembros):
        mz = [m for m, p in manzanas if g.convex_hull.contains(p)]
        if mz:
            for l in ls:
                l["mz"] = mz[0]
        else:
            sin_rotulo.append((g, ls))
    for g, ls in sin_rotulo:
        for m, p in sorted(manzanas, key=lambda m: g.centroid.distance(m[1])):
            usados = {l["n"] for l in lotes if l.get("mz") == m}
            if not usados & {l["n"] for l in ls}:
                for l in ls:
                    l["mz"] = m
                break

    # Lindero del proyecto (del levantamiento) para dibujar el contorno
    lindero = msp.query("LWPOLYLINE[layer=='C-TINN-BNDY']")
    borde = Polygon(list(lindero[0].get_points("xy"))) if lindero else unary_union([l["poly"] for l in lotes]).convex_hull
    x0, y0, x1, y1 = borde.bounds
    x0 -= MARGEN; y0 -= MARGEN; x1 += MARGEN; y1 += MARGEN
    tr = lambda x, y: (round((x - x0) * K, 1), round((y1 - y) * K, 1))
    pts = lambda poly: " ".join("%s,%s" % tr(x, y) for x, y in list(poly.exterior.coords)[:-1])

    salida, avisos, vistos = [], [], {}
    for l in sorted(lotes, key=lambda l: (l.get("mz", "?"), int(l["n"]))):
        mz = l.get("mz", "?")
        lid = mz + "-" + l["n"]
        if lid in vistos:
            avisos.append("lote repetido " + lid)
            continue
        vistos[lid] = 1
        dib = round(l["poly"].area)
        if l["rotulo"] and abs(dib - l["rotulo"]) / l["rotulo"] > 0.05:
            avisos.append("%s: dibujado %s m² y el rótulo dice %s m²" % (lid, dib, l["rotulo"]))
        c = l["poly"].representative_point()
        cx, cy = tr(c.x, c.y)
        salida.append({"id": lid, "mz": mz, "n": l["n"], "area": l["rotulo"] or dib, "area_dibujada": dib,
                       "cx": cx, "cy": cy, "pts": pts(l["poly"])})

    mzs = []
    for m, p in manzanas:
        x, y = tr(p.x, p.y)
        mzs.append({"mz": m, "x": x, "y": y})
    datos = {
        "fuente": {"archivo": os.path.basename(ruta), "nota": "Plano del topógrafo; áreas según los rótulos del diseño."},
        "viewBox": [0, 0, round((x1 - x0) * K), round((y1 - y0) * K)],
        "site": [pts(borde)],
        "manzanas": mzs,
        "calles": [{"t": t.title(), "x": tr(p.x, p.y)[0], "y": tr(p.x, p.y)[1]} for t, p in calles],
        "lots": salida,
    }
    with open(SALIDA, "w", encoding="utf-8") as f:
        f.write("/* Plano de lotes de Monte Olimpo · generado por tools/extraer_monte_olimpo.py desde el DWG del topógrafo */\n")
        f.write("window.MONTE_OLIMPO = " + json.dumps(datos, ensure_ascii=False, separators=(",", ":")) + ";\n")

    por_mz = {}
    for l in salida:
        por_mz.setdefault(l["mz"], []).append(int(l["n"]))
    print(f"{len(salida)} lotes guardados en data/monte-olimpo.js (de {len(numeros)} números en el plano)")
    for m in sorted(por_mz):
        print(f"  Mz {m}: {len(por_mz[m])} lotes → {sorted(por_mz[m])}")
    faltan = [t for t, p in numeros if not any(l["poly"].contains(p) for l in lotes)]
    if faltan:
        print("Números sin área cerrada:", faltan)
    for a in avisos:
        print("  ⚠", a)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    main(sys.argv[1])
