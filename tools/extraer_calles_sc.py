"""
Agrega al plano web de Santa Clara (data/santa-clara.js):
  - calles:  el nombre de cada calle con su posición y ángulo (del DWG del arquitecto)
  - zonas:   la forma REAL de las zonas comunes (área común, ecoparque, contemplación, picnic),
             sacada del plano PDF, para que el verde no se salga sobre calles ni lotes
  - garita:  la ubicación exacta de la garita (el rótulo del plano PDF)

    python tools/extraer_calles_sc.py "ruta/SANTA CLARA ... .dwg" "ruta/PLANO SANTA CLARA ... .pdf"

En el PDF los nombres de las calles están dibujados como figuras (no se pueden leer), por eso
salen del DWG: el DWG se alinea con el PDF usando los números de lote que tienen los dos
(ajuste por mínimos cuadrados) y así cada nombre cae en su calle.
"""
import json
import math
import os
import re
import subprocess
import sys
import tempfile
import warnings

import ezdxf
import numpy as np
import pymupdf
from shapely.geometry import LineString, Point
from shapely.ops import polygonize, unary_union

warnings.filterwarnings("ignore")
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATOS = os.path.join(RAIZ, "data", "santa-clara.js")
ACAD = r"C:\Program Files\Autodesk\AutoCAD 2027\accoreconsole.exe"
VB = (380, 60)
CLIP = pymupdf.Rect(120, 60, 2420, 1990)
ZONAS = {"COMÚN": "ÁREA COMÚN", "ECOPARQUE": "ECOPARQUE", "CONTEMPLACIÓN": "ZONA CONTEMPLACIÓN", "PICNIC": "ZONA PICNIC"}


def a_dxf(ruta):
    if ruta.lower().endswith(".dxf"):
        return ruta
    tmp = tempfile.mkdtemp()
    dwg, dxf, scr = (os.path.join(tmp, n) for n in ("plano.dwg", "plano.dxf", "exportar.scr"))
    with open(ruta, "rb") as a, open(dwg, "wb") as b:
        b.write(a.read())  # se trabaja sobre una copia
    with open(scr, "w") as f:
        f.write('FILEDIA 0\nCMDDIA 0\n_.DXFOUT\n"%s"\n_V\n_2018\n16\n' % dxf)
    try:
        subprocess.run([ACAD, "/i", dwg, "/s", scr], capture_output=True, timeout=300)
    except subprocess.TimeoutExpired:
        pass  # la consola a veces se queda esperando al final aunque ya escribió el DXF
    if not os.path.exists(dxf):
        sys.exit("No se pudo convertir el DWG a DXF con AutoCAD.")
    return dxf


def textos(ents, prof=0):
    for e in ents:
        t = e.dxftype()
        if t in ("TEXT", "MTEXT"):
            s = (e.dxf.text if t == "TEXT" else e.plain_text()).strip().replace("\n", " ")
            yield s, e.dxf.insert.x, e.dxf.insert.y, e.dxf.get("rotation", 0)
        elif t == "INSERT" and prof < 2:
            try:
                yield from textos(e.virtual_entities(), prof + 1)
            except Exception:
                pass


def main(dwg, pdf):
    # ---- DWG: la copia más completa del dibujo es la de la derecha (tiene garita y todas las calles)
    T = list(textos(ezdxf.readfile(a_dxf(dwg)).modelspace()))
    xs = sorted(t[1] for t in T if re.fullmatch(r"\d{1,2}(-\d)?", t[0]))
    corte = (xs[0] + xs[-1]) / 2
    T = [t for t in T if t[1] > corte] if sum(1 for x in xs if x > corte) >= len(xs) / 2 else [t for t in T if t[1] <= corte]

    pagina = pymupdf.open(pdf)[0]
    palabras = pagina.get_text("words")
    pn = [(w[4], (w[0] + w[2]) / 2, (w[1] + w[3]) / 2) for w in palabras if w[3] - w[1] >= 12 and re.fullmatch(r"\d{1,2}(-\d)?", w[4])]

    # ---- alinear DWG → PDF: primero con la escala del plano y la garita, luego mínimos cuadrados
    gar_dwg = next((t for t in T if t[0].upper() == "GARITA"), None)
    gar_pdf = next((w for w in palabras if w[4].upper() == "GARITA"), None)
    a = 2.05
    X0, Y0 = gar_dwg[1], gar_dwg[2]
    x0, y0 = gar_pdf[0], gar_pdf[3]
    pares = []
    for s, X, Y, r in T:
        if not re.fullmatch(r"\d{1,2}(-\d)?", s):
            continue
        x, y = x0 + a * (X - X0), y0 - a * (Y - Y0)
        c = [(math.hypot(px - x, py - y), px, py) for t, px, py in pn if t == s]
        if c and min(c)[0] < 25:
            pares.append((X, Y, min(c)[1], min(c)[2]))
    A, B = [], []
    for X, Y, px, py in pares:
        A += [[X, Y, 1, 0, 0, 0], [0, 0, 0, X, Y, 1]]
        B += [px, py]
    m = np.linalg.lstsq(np.array(A), np.array(B), rcond=None)[0]
    err = np.hypot(*(np.array(A) @ m - np.array(B)).reshape(-1, 2).T)
    aplica = lambda X, Y: (m[0] * X + m[1] * Y + m[2], m[3] * X + m[4] * Y + m[5])
    giro = math.degrees(math.atan2(m[3], m[0]))  # giro del DWG respecto al PDF (≈0)

    # ---- calles
    calles, vistas = [], set()
    for s, X, Y, r in T:
        if not s.upper().startswith("CALLE"):
            continue
        x, y = aplica(X, Y)
        clave = (s.upper(), round(x / 20), round(y / 20))
        if clave in vistas:
            continue
        vistas.add(clave)
        ang = -(r + giro)            # en pantalla la y crece hacia abajo
        ang = (ang + 180) % 360 - 180
        if ang > 90 or ang < -90:    # que nunca quede de cabeza
            ang = ang + 180 if ang < -90 else ang - 180
            ancla = "end"
        else:
            ancla = "start"
        nombre = s.title().replace(" De La ", " de la ").replace(" De ", " de ")
        for sin, con in (("German", "Germán"), ("Melon", "Melón")):
            nombre = nombre.replace(sin, con)
        calles.append({"t": nombre, "x": round(x - VB[0], 1), "y": round(y - VB[1], 1), "a": round(ang, 1), "ancla": ancla})

    # ---- zonas comunes: el área cerrada del plano que contiene su rótulo (sin números de lote)
    lineas = []
    for d in pagina.get_drawings():
        w, c = d.get("width") or 0, d.get("color")
        if not c or not 0.7 <= w <= 3 or not CLIP.contains(d["rect"]):
            continue
        for it in d["items"]:
            if it[0] == "l":
                lineas.append(LineString([(it[1].x, it[1].y), (it[2].x, it[2].y)]))
            elif it[0] == "c":
                lineas.append(LineString([(q.x, q.y) for q in it[1:5]]))
            elif it[0] == "qu":
                q = it[1]
                lineas.append(LineString([(q.ul.x, q.ul.y), (q.ur.x, q.ur.y), (q.lr.x, q.lr.y), (q.ll.x, q.ll.y), (q.ul.x, q.ul.y)]))
    # como con los lotes, las esquinas casi abiertas se cierran alargando un poco las líneas
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from extraer_monte_olimpo import alargar
    areas = []
    for d in (0, 2, 4, 7):
        areas += list(polygonize(unary_union([alargar(l, d) for l in lineas] if d else lineas)))
    zonas = []
    for w in palabras:
        clave = next((k for k in ZONAS if w[4].upper().startswith(k)), None)
        if not clave:
            continue
        pt = Point((w[0] + w[2]) / 2, (w[1] + w[3]) / 2)
        dentro = [a for a in areas if a.contains(pt) and 500 < a.area < 60000 and not any(a.contains(Point(x, y)) for t, x, y in pn)]
        if not dentro:
            continue
        z = min(dentro, key=lambda a: a.area).simplify(0.4)
        if any(Point(z.representative_point()).distance(Point(*map(float, zz["pts"].split()[0].split(",")))) < 1 for zz in zonas):
            continue
        zonas.append({"t": ZONAS[clave], "pts": " ".join(f"{round(x - VB[0], 1)},{round(y - VB[1], 1)}" for x, y in list(z.exterior.coords)[:-1])})

    garita = {"x": round((gar_pdf[0] + gar_pdf[2]) / 2 - VB[0], 1), "y": round((gar_pdf[1] + gar_pdf[3]) / 2 - VB[1], 1)}

    t = open(DATOS, encoding="utf-8").read()
    i, j = t.index("{"), t.rstrip().rindex(";")
    datos = json.loads(t[i:j])
    datos["calles"], datos["zonas"], datos["garita"] = calles, zonas, garita
    with open(DATOS, "w", encoding="utf-8") as f:
        f.write(t[:i] + json.dumps(datos, ensure_ascii=False, separators=(",", ":")) + t[j:])
    print(f"DWG alineado con {len(pares)} números de lote (error medio {err.mean() / 2.05:.1f} m)")
    print(f"{len(calles)} nombres de calle · {len(zonas)} zonas comunes · garita en {garita}")
    for c in calles:
        print("  ", c["t"])
    for z in zonas:
        print("   zona:", z["t"])


if __name__ == "__main__":
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
