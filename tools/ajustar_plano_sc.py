"""
Ajustes finos del plano web de Santa Clara (data/santa-clara.js), a partir del plano PDF:
  - Picnic, Contemplación y Ecoparque: en el centro de su rótulo del plano (no al lado).
  - Garita: en la primera esquina del lote 6 de la Mz A1, en la entrada del proyecto.
  - Nombres de calle: paralelos a la calle (el ángulo se toma del borde de los lotes).
  - Lagos: el ícono en el centro del agua.
  - frente_lago: lotes que dan al agua (lagos o ciénaga; incluye la Mz L).

    python tools/ajustar_plano_sc.py "ruta/PLANO SANTA CLARA ... .pdf"
"""
import json
import math
import os
import sys

import pymupdf
from shapely.geometry import LineString, Point, Polygon

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATOS = os.path.join(RAIZ, "data", "santa-clara.js")
VB = (380, 60)
ROTULOS = {"PICNIC": "ZONA PICNIC", "CONTEMPLACI": "ZONA CONTEMPLACIÓN", "ECOPARQUE": "ECOPARQUE"}


def poly(txt):
    return Polygon([tuple(map(float, p.split(","))) for p in txt.split()]).buffer(0)


def main(pdf):
    t = open(DATOS, encoding="utf-8").read()
    i, j = t.index("{"), t.rstrip().rindex(";")
    d = json.loads(t[i:j])
    lotes = {l["id"]: poly(l["pts"]) for l in d["lots"]}
    agua = [poly(w) for w in d["water"]]

    # zonas: centro de su rótulo en el plano
    for w in pymupdf.open(pdf)[0].get_text("words"):
        for k, nombre in ROTULOS.items():
            if w[4].upper().startswith(k):
                x, y = (w[0] + w[2]) / 2 - VB[0], (w[1] + w[3]) / 2 - VB[1]
                for p in d["pois"]:
                    if p["t"] == nombre:
                        p["x"], p["y"] = round(x, 1), round(y, 1)

    # garita: esquina del lote A1-6 más cercana a la entrada (al rótulo GARITA)
    if "A1-6" in lotes and d.get("garita"):
        g = Point(d["garita"]["x"], d["garita"]["y"])
        esquina = min(lotes["A1-6"].exterior.coords, key=lambda c: g.distance(Point(c)))
        d["garita"] = {"x": round(esquina[0], 1), "y": round(esquina[1], 1)}

    # calles: dirección del borde de lote más largo y cercano; centro entre las dos filas de lotes
    bordes = []
    for p in lotes.values():
        c = list(p.exterior.coords)
        bordes += [LineString(c[k:k + 2]) for k in range(len(c) - 1) if LineString(c[k:k + 2]).length > 18]
    todos = [p for p in lotes.values()]
    for c in d.get("calles", []):
        P = Point(c["x"], c["y"])
        cerca = sorted(bordes, key=lambda b: b.distance(P))[:6]
        b = max(cerca[:3], key=lambda b: b.length)
        (x1, y1), (x2, y2) = b.coords
        ang = math.degrees(math.atan2(y2 - y1, x2 - x1))
        ang = (ang + 90) % 180 - 90            # legible, nunca de cabeza
        # solo se endereza el ángulo (paralelo al borde de los lotes); la posición del DWG ya está sobre la calle
        dif = abs((ang - c["a"] + 90) % 180 - 90)
        if dif < 25:
            c["a"] = round(ang, 1)

    # lagos: el ícono va en el centro del agua (así no se monta sobre picnic ni contemplación)
    for p in d["pois"]:
        if p["t"].startswith("LAGO"):
            q = Point(p["x"], p["y"])
            lago = min(agua, key=lambda w: w.distance(q))
            c = lago.representative_point() if not lago.centroid.within(lago) else lago.centroid
            p["x"], p["y"] = round(c.x, 1), round(c.y, 1)

    # lotes frente al agua (lagos y ciénaga)
    n = 0
    for l in d["lots"]:
        l.pop("frente_lago", None)
        if any(lotes[l["id"]].distance(w) < 14 for w in agua):
            l["frente_lago"] = True
            n += 1

    with open(DATOS, "w", encoding="utf-8") as f:
        f.write(t[:i] + json.dumps(d, ensure_ascii=False, separators=(",", ":")) + t[j:])
    print("zonas y garita ubicadas ·", len(d.get("calles", [])), "calles alineadas ·", n, "lotes frente al agua")
    print("  Mz L frente al agua:", sorted(l["id"] for l in d["lots"] if l.get("frente_lago") and l["mz"] == "L"))


if __name__ == "__main__":
    main(sys.argv[1])
