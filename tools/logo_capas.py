"""Separa el logo de Santa Clara en capas para animarlo (sol, gaviota, 3 olas, letras y subtítulo).
Todas las capas comparten el mismo lienzo, así que al superponerlas forman el logo exacto.
Versión para fondo oscuro: el azul marino pasa a blanco y los azules se aclaran.
Uso: python tools/logo_capas.py "logo-santa-clara.jpeg"
Salida: assets/img/logo-sc/*.png y assets/img/logo-sc/capas.json
"""
import sys, json, os
import numpy as np
from PIL import Image

SRC = sys.argv[1]
OUT = "assets/img/logo-sc/"
os.makedirs(OUT, exist_ok=True)

rgb = np.asarray(Image.open(SRC).convert("RGB")).astype(np.float32)
bg = np.array([247, 247, 247], np.float32)
alpha = np.clip((np.abs(rgb - bg).max(axis=2) - 6) / 120.0, 0, 1)
col = np.clip((rgb - (1 - alpha[..., None]) * bg) / np.maximum(alpha[..., None], 1e-3), 0, 255)
H, W = alpha.shape

# paleta del logo (medida sobre la imagen original); cada pixel va al color más cercano
PAL = [(30, 48, 71), (48, 49, 133), (24, 115, 182)]
visible = alpha > 0.02
r, g, b = col[..., 0], col[..., 1], col[..., 2]
sun = visible & (r > 150) & (r > b + 60)
d = np.stack([np.abs(col - np.array(v, np.float32)).sum(axis=2) for v in PAL])
idx = d.argmin(axis=0)
navy = visible & ~sun & (idx == 0)
indigo = visible & ~sun & (idx == 1)
blue = visible & ~sun & (idx == 2)

yy, xx = np.mgrid[0:H, 0:W]
bird = navy & (yy < 450) & (xx > 820)
wave1 = navy & (yy >= 450) & (yy < 780)
name = navy & (yy >= 780) & (yy < 930)
sub = navy & (yy >= 930)

capas = {
    "sol": (sun, None),
    "gaviota": (bird, (255, 255, 255)),
    "ola1": (wave1, (255, 255, 255)),
    "ola2": (indigo, (156, 151, 240)),
    "ola3": (blue, (77, 179, 245)),
    "sub": (sub, (230, 236, 245)),
}

# recorte común
ys, xs = np.nonzero(visible)
pad = 6
x0, y0, x1, y1 = max(0, xs.min() - pad), max(0, ys.min() - pad), min(W, xs.max() + pad), min(H, ys.max() + pad)
cw, ch = x1 - x0, y1 - y0
SCALE = 900 / cw

def guardar(nombre, mask, color):
    a = (alpha * mask)[y0:y1, x0:x1]
    c = col[y0:y1, x0:x1].copy()
    if color is not None:
        c[:] = color
    img = Image.fromarray(np.dstack([c, a * 255]).astype(np.uint8), "RGBA")
    img = img.resize((round(cw * SCALE), round(ch * SCALE)), Image.LANCZOS)
    img.save(OUT + nombre + ".png", optimize=True)

for k, (m, c) in capas.items():
    guardar(k, m, c)

# letras de SANTA CLARA: componentes conectados agrupados cuando se solapan en columna
import cv2
fila = name[y0:y1, x0:x1].astype(np.uint8)
n, lab, st, _ = cv2.connectedComponentsWithStats(fila, connectivity=8)
comps = sorted([(st[i, 0], st[i, 0] + st[i, 2], i) for i in range(1, n) if st[i, 4] > 30])
letras = []
for a, b2, i in comps:
    if letras and a < letras[-1][1] - 2:
        letras[-1][1] = max(letras[-1][1], b2); letras[-1][2].append(i)
    else:
        letras.append([a, b2, [i]])
info = []
for k, (a, b2, ids) in enumerate(letras):
    mask = np.zeros_like(name)
    mask[y0:y1, x0:x1] = np.isin(lab, ids) & name[y0:y1, x0:x1]
    guardar(f"letra{k}", mask, (255, 255, 255))
    info.append({"i": k, "centro": round(((a + b2) / 2) / cw, 4)})

json.dump({"ancho": round(cw * SCALE), "alto": round(ch * SCALE), "letras": info}, open(OUT + "capas.json", "w"))
print("letras", len(letras), "lienzo", round(cw * SCALE), round(ch * SCALE))
# control
prev = Image.new("RGBA", (round(cw * SCALE), round(ch * SCALE)), (16, 24, 40, 255))
for f in ["sol", "ola1", "ola2", "ola3", "gaviota", "sub"] + [f"letra{i}" for i in range(len(letras))]:
    prev.alpha_composite(Image.open(OUT + f + ".png"))
prev.save("tools/logo_capas_control.png")
