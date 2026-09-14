"""Convierte los logos (JPG con fondo) en PNG transparentes y recortes para la web.
Uso: python tools/procesar_logos.py "logo-monte-olimpo.jpeg" "logo-santa-clara.jpeg"
Cuando lleguen los vectores (SVG/AI) conviene reemplazar estos archivos."""
import sys
import numpy as np
from PIL import Image

OUT = "assets/img/"


def trim(img, pad=8):
    a = np.array(img)[:, :, 3]
    ys, xs = np.nonzero(a > 10)
    return img.crop((max(0, xs.min() - pad), max(0, ys.min() - pad), xs.max() + pad, ys.max() + pad))


def on_black(path):
    rgb = np.asarray(Image.open(path).convert("RGB")).astype(np.float32)
    rgb[rgb < 14] = 0  # ruido JPG del fondo negro
    a = rgb.max(axis=2) / 255.0
    a = np.clip((a - 0.04) / 0.96, 0, 1)
    col = np.where(a[..., None] > 0, np.clip(rgb / np.maximum(rgb.max(axis=2, keepdims=True), 1) * 255, 0, 255), 0)
    return Image.fromarray(np.dstack([col, a * 255]).astype(np.uint8), "RGBA")


def on_light(path, bg=(247, 247, 247)):
    rgb = np.asarray(Image.open(path).convert("RGB")).astype(np.float32)
    bg = np.array(bg, np.float32)
    a = np.clip((np.abs(rgb - bg).max(axis=2) - 6) / 120.0, 0, 1)
    col = np.clip((rgb - (1 - a[..., None]) * bg) / np.maximum(a[..., None], 1e-3), 0, 255)
    return Image.fromarray(np.dstack([col, a * 255]).astype(np.uint8), "RGBA")


def mono(img, color):
    a = np.array(img)[:, :, 3]
    c = np.zeros((*a.shape, 3), np.uint8); c[:] = color
    return Image.fromarray(np.dstack([c, a]), "RGBA")


def save(img, name, width=None):
    if width and img.width > width:
        img = img.resize((width, round(img.height * width / img.width)), Image.LANCZOS)
    img.save(OUT + name, optimize=True)
    print(name, img.size)


mo = on_black(sys.argv[1])  # 1402x1122
save(trim(mo), "monte-olimpo-logo.png", 900)
iso = trim(mo.crop((400, 140, 1000, 690)))
save(iso, "monte-olimpo-isotipo.png", 360)
save(trim(mo.crop((200, 700, 1200, 810))), "monte-olimpo-nombre.png", 900)
save(trim(mo.crop((200, 700, 1200, 940))), "monte-olimpo-nombre-completo.png", 900)
save(mono(trim(mo.crop((400, 140, 1000, 690))), (201, 160, 82)), "monte-olimpo-isotipo-oro.png", 360)
fav = iso.copy(); fav.thumbnail((180, 180), Image.LANCZOS)
canvas = Image.new("RGBA", (192, 192), (12, 11, 9, 255)); canvas.alpha_composite(fav, ((192 - fav.width) // 2, (192 - fav.height) // 2))
canvas.save(OUT + "favicon.png")

sc = on_light(sys.argv[2])  # 1600x1295
save(trim(sc), "santa-clara-logo.png", 900)
save(trim(sc.crop((380, 300, 1260, 760))), "santa-clara-simbolo.png", 420)
save(trim(sc.crop((280, 790, 1380, 1000))), "santa-clara-nombre.png", 900)
save(mono(trim(sc), (255, 255, 255)), "santa-clara-logo-blanco.png", 900)
