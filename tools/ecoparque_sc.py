"""
Calle Germán Pineda y Ecoparque de Santa Clara (data/santa-clara.js), desde el plano PDF.

    python tools/ecoparque_sc.py "ruta/PLANO SANTA CLARA ... .pdf"

En el plano, una línea negra separa el Ecoparque (entre el Lago 1 y esa línea) de la
Calle Germán Pineda (entre esa línea y los lotes de las manzanas D y C). Esa calle no quedaba
dentro del predio pintado, por eso se veía como pasto. Aquí:
  - la calle se agrega al predio (se pinta como las demás vías),
  - el Ecoparque queda como zona común con su forma real (ahí van los quioscos).
"""
import json
import os
import sys

import pymupdf
from shapely.geometry import LineString, Point, Polygon
from shapely.ops import polygonize, unary_union

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATOS = os.path.join(RAIZ, "data", "santa-clara.js")
VB = (380, 60)
ANCHO_CALLE = 26          # unidades del PDF; lo que se monta sobre los lotes se recorta
REFERENCIA_ECO = Point(1388, 1307)   # un punto dentro del Ecoparque, junto al rótulo


def poly(txt, dx=0, dy=0):
    return Polygon([(float(a) + dx, float(b) + dy) for a, b in (p.split(",") for p in txt.split())]).buffer(0)


def a_web(g):
    return " ".join(f"{round(x - VB[0], 1)},{round(y - VB[1], 1)}" for x, y in list(g.exterior.coords)[:-1])


def main(pdf):
    pg = pymupdf.open(pdf)[0]
    # la línea negra del borde oeste de la calle (la más larga que baja junto a las manzanas D y C)
    negras = []
    for d in pg.get_drawings():
        c = d.get("color")
        if c and tuple(round(x, 2) for x in c) == (0.0, 0.0, 0.0) and pymupdf.Rect(1360, 1230, 1440, 1630).intersects(d["rect"]):
            for it in d["items"]:
                if it[0] == "l":
                    negras.append(LineString([(it[1].x, it[1].y), (it[2].x, it[2].y)]))
    # la línea viene en varios tramos: se unen todos sus puntos, de norte a sur
    puntos = sorted({(round(x, 1), round(y, 1)) for l in negras if l.bounds[0] > 1370 and l.bounds[2] < 1430 for x, y in l.coords},
                    key=lambda q: q[1])
    borde = LineString(puntos)

    t = open(DATOS, encoding="utf-8").read()
    i, j = t.index("{"), t.rstrip().rindex(";")
    d = json.loads(t[i:j])
    lotes = unary_union([poly(l["pts"], *VB) for l in d["lots"]])
    agua = unary_union([poly(w, *VB) for w in d["water"]])

    # calle: franja al este de la línea negra, sin montarse sobre los lotes
    lados = [borde.buffer(ANCHO_CALLE, single_sided=True), borde.buffer(-ANCHO_CALLE, single_sided=True)]
    franja = max(lados, key=lambda f: f.intersection(lotes.buffer(4)).area)   # el lado que toca los lotes
    calle = franja.difference(lotes).buffer(0.6).buffer(-0.6)
    # se conservan todos los tramos (junto a la manzana D y junto a las C y B)
    calle = unary_union([g for g in getattr(calle, "geoms", [calle]) if g.area > 150]).simplify(0.4)

    # ecoparque: entre la orilla este del Lago 1 y la línea negra. El área se arma con los bordes
    # del plano (línea norte, línea negra y línea sur) y se le quita el agua; queda la franja del Ecoparque
    marco = Polygon([(1347, 1174), (1420, 1232), (1423, 1241), (1404, 1365), (1386, 1357), (1266, 1315)])
    resto = marco.difference(agua.buffer(2)).difference(lotes)
    piezas = [g for g in getattr(resto, "geoms", [resto]) if g.area > 300]
    eco = max(piezas, key=lambda g: g.centroid.x).simplify(0.4) if piezas else None

    # guardar: la calle entra al predio; el ecoparque, a las zonas comunes
    d["vias"] = [a_web(g) for g in getattr(calle, "geoms", [calle])]   # la web las pinta como el resto del predio
    d["zonas"] = [z for z in d.get("zonas", []) if z["t"] != "ECOPARQUE"]
    if eco is not None:
        d["zonas"].append({"t": "ECOPARQUE", "pts": a_web(eco)})
        c = eco.representative_point()
        for p in d["pois"]:
            if p["t"] == "ECOPARQUE":
                p["x"], p["y"] = round(c.x - VB[0], 1), round(c.y - VB[1], 1)
    with open(DATOS, "w", encoding="utf-8") as f:
        f.write(t[:i] + json.dumps(d, ensure_ascii=False, separators=(",", ":")) + t[j:])
    print("Calle Germán Pineda:", round(calle.area / 2.049 ** 2), "m² ·",
          "Ecoparque:", round(eco.area / 2.049 ** 2) if eco is not None else "no encontrado", "m²")


if __name__ == "__main__":
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    main(sys.argv[1])
