"""
Extrae los lotes del plano PDF de Santa Clara y genera polígonos para el plano interactivo.

Uso:  python tools/extraer_plano.py "RUTA/PLANO.pdf"
Salida: tools/plano-raw.json (polígonos + manzana + número + área del plano) y tools/debug_overlay.png

Método:
  1. Se redibujan solo los linderos (sin cotas, textos ni puntos de vendido) y se detectan las áreas cerradas.
  2. Dentro de cada área se ubica el número del lote y su área "A=xxx m2".
  3. La manzana se reconoce por la firma del trazo (color + grosor) que usa cada manzana en el plano.
  4. Se validan duplicados y se reintenta con otra configuración de líneas los lotes que no cerraron.
"""
import sys, json, math, re, collections, gc
import numpy as np, cv2, pymupdf
from shapely.geometry import Polygon, LineString
from shapely.strtree import STRtree

PLANO = sys.argv[1]
OUT = sys.argv[2] if len(sys.argv) > 2 else "tools/plano-raw.json"
K = 2  # pixeles por unidad PDF
ORANGE = (0.95, 0.4, 0.13)
WATER = (0.15, 0.46, 0.73)
PLAN_CLIP = pymupdf.Rect(120, 60, 2420, 1990)
LOT_MIN, LOT_MAX = 1100, 27000  # en pixeles (K=2)

page = pymupdf.open(PLANO)[0]
W, H = page.rect.width, page.rect.height
drawings = page.get_drawings()
key = lambda c: tuple(round(x, 2) for x in c) if c else None

# ---------------- textos ----------------
num_tokens, area_spans, mz_labels, pois = [], [], {}, []
for b in page.get_text("rawdict")["blocks"]:
    for l in b.get("lines", []):
        for s in l["spans"]:
            chars = s["chars"]
            text = "".join(c["c"] for c in chars).strip()
            size = round(s["size"], 1)
            x0, y0, x1, y1 = s["bbox"]
            cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
            if text.startswith("Mz-"):
                mz_labels[text[3:]] = (cx, cy)
            elif size in (17.9, 14.3) and s["color"] == 0:
                cur = []
                for c in chars + [{"c": " ", "bbox": (0, 0, 0, 0)}]:
                    if c["c"].strip():
                        cur.append(c); continue
                    t = "".join(ch["c"] for ch in cur)
                    if re.fullmatch(r"\d+(-\d)?", t):
                        xs = [(ch["bbox"][0] + ch["bbox"][2]) / 2 for ch in cur]
                        ys = [(ch["bbox"][1] + ch["bbox"][3]) / 2 for ch in cur]
                        num_tokens.append(dict(t=t, cx=sum(xs) / len(xs), cy=sum(ys) / len(ys)))
                    cur = []
            else:
                for m in re.finditer(r"A=\s*([\d.,]+)\s*m2", text):
                    area_spans.append(dict(area=float(m.group(1).replace(",", ".")), cx=cx, cy=cy))
                if text in ("LAGO 1", "LAGO 2", "ECOPARQUE", "ZONA CONTEMPLACIÓN", "ZONA PICNIC", "GARITA", "ÁREA COMÚN"):
                    pois.append(dict(t=text, cx=round(cx, 1), cy=round(cy, 1)))
mz_labels["E"] = mz_labels.pop("E1")


# ---------------- render ----------------
def near_mz_circle(d):
    r = d["rect"]
    cx, cy = (r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2
    # rayado del círculo "Mz-X" (trazos de grosor 0). El borde del círculo se conserva porque comparte
    # segmentos con los linderos; el hueco resultante se cubre en la web con la insignia de la manzana.
    return (d.get("width") or 0) == 0 and any(math.hypot(cx - x, cy - y) < 30 for x, y in mz_labels.values())


def is_guide_line(d):
    # línea negra fina que atraviesa en diagonal las manzanas O y F1
    if key(d.get("color")) != (0.0, 0.0, 0.0) or abs((d.get("width") or 0) - 0.72) > 0.01:
        return False
    return any(it[0] == "l" and math.dist(it[1], it[2]) > 100 and min(it[1].x, it[2].x) > 1000
               and min(it[1].y, it[2].y) > 860 for it in d["items"])


def render(items_fn, width, fill=False):
    out = pymupdf.open()
    pg = out.new_page(width=W, height=H)
    sh = pg.new_shape()
    for d in drawings:
        items = items_fn(d)
        if not items:
            continue
        for it in items:
            if it[0] == "l":
                sh.draw_line(it[1], it[2])
            elif it[0] == "c":
                sh.draw_bezier(it[1], it[2], it[3], it[4])
            elif it[0] == "re":
                sh.draw_rect(it[1])
            elif it[0] == "qu":
                sh.draw_quad(it[1])
        if fill:
            sh.finish(color=None, fill=(0, 0, 0), closePath=True)
    if not fill:
        sh.finish(color=(0, 0, 0), width=width)
    sh.commit()
    pix = pg.get_pixmap(matrix=pymupdf.Matrix(K, K), alpha=False)
    return np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, 3)[:, :, 0].copy()


def lot_items_factory(keep_guides):
    def fn(d):
        c = key(d.get("color"))
        if c is None or not PLAN_CLIP.contains(d["rect"]) or (d.get("width") or 0) >= 5:
            return []
        if c == ORANGE:
            if abs((d.get("width") or 0) - 0.72) > 0.01:
                return []
            return [it for it in d["items"] if it[0] == "l" and math.dist(it[1], it[2]) > 12]
        if near_mz_circle(d) or (not keep_guides and is_guide_line(d)):
            return []
        return d["items"]
    return fn


def segment(keep_guides):
    gray = render(lot_items_factory(keep_guides), 0.7)
    wall = cv2.dilate((gray < 200).astype(np.uint8), np.ones((3, 3), np.uint8))
    n, labels, stats, _ = cv2.connectedComponentsWithStats((1 - wall).astype(np.uint8), connectivity=4)
    return gray, labels, stats


# ---------------- firma de trazo por manzana ----------------
SIGNATURES = {
    "A1": ((1.0, 0.0, 0.0), 2.04), "B": ((1.0, 0.8, 0.4), 2.04), "C": ((0.0, 1.0, 1.0), 2.04),
    "D": ((0.5, 0.5, 0.5), 2.04), "E": ((1.0, 0.0, 1.0), 1.08), "F1": ((0.15, 0.46, 0.73), 1.08),
    "I": ((0.15, 0.46, 0.73), 1.08), "G": ((0.07, 0.61, 0.28), 1.44), "H": ((0.6, 0.61, 0.22), 1.44),
    "J": ((0.8, 0.41, 0.16), 1.08), "K": ((0.97, 0.84, 0.19), 0.84), "L": ((0.58, 0.15, 0.56), 1.08),
    "M": ((0.0, 1.0, 1.0), 1.08), "N": ((0.93, 0.12, 0.14), 1.08), "O": ((0.0, 1.0, 0.0), 1.08),
    "P": ((0.0, 0.0, 0.0), 1.08), "R": ((0.6, 0.61, 0.22), 1.08),
}
sig_segments = collections.defaultdict(list)
for d in drawings:
    sig = (key(d.get("color")), round(d.get("width") or 0, 2))
    if sig[0] is None:
        continue
    for it in d["items"]:
        if it[0] == "l" and math.dist(it[1], it[2]) > 3:
            sig_segments[sig].append(LineString([(it[1].x, it[1].y), (it[2].x, it[2].y)]))
sig_trees = {s: (STRtree(v), v) for s, v in sig_segments.items()}


def manzana_scores(poly_pts, tx, ty):
    ring = Polygon(poly_pts).exterior.buffer(3)
    scores = collections.Counter()
    for sig in set(SIGNATURES.values()):
        if sig not in sig_trees:
            continue
        tree, segs = sig_trees[sig]
        length = sum(segs[i].intersection(ring).length for i in tree.query(ring))
        same = [m for m, s in SIGNATURES.items() if s == sig]
        owner = min(same, key=lambda m: math.hypot(mz_labels[m][0] - tx, mz_labels[m][1] - ty))
        scores[owner] = length
    return scores


def build_lot(mask, x0, y0, tok):
    cnts, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    c = cv2.approxPolyDP(max(cnts, key=cv2.contourArea), 1.4, True)
    pts = [[round((float(p[0][0]) + x0) / K, 1), round((float(p[0][1]) + y0) / K, 1)] for p in c]
    areas = []
    for a in area_spans:
        ax, ay = int(a["cx"] * K) - x0, int(a["cy"] * K) - y0
        if 0 <= ay < mask.shape[0] and 0 <= ax < mask.shape[1] and mask[max(0, ay - 4):ay + 4, max(0, ax - 4):ax + 4].any():
            areas.append(a["area"])
    M = cv2.moments(mask)
    scores = manzana_scores(pts, tok["cx"], tok["cy"])
    return dict(num=tok["t"], scores=scores, area_plano=areas[0] if len(set(areas)) == 1 else None,
                areas_found=areas, px_area=int(mask.sum()), tx=tok["cx"], ty=tok["cy"],
                cx=round((M["m10"] / M["m00"] + x0) / K, 1), cy=round((M["m01"] / M["m00"] + y0) / K, 1), pts=pts)


def extract(labels, stats, tokens, problems):
    def comp_at(x, y, r=10):
        X, Y = int(x * K), int(y * K)
        ok = lambda v: v and LOT_MIN < stats[v, cv2.CC_STAT_AREA] < LOT_MAX
        if ok(labels[Y, X]):
            return labels[Y, X]
        win = labels[max(0, Y - r):Y + r, max(0, X - r):X + r]
        vals = collections.Counter(v for v in win.ravel().tolist() if ok(v))
        return vals.most_common(1)[0][0] if vals else 0

    seen, missing = collections.defaultdict(list), []
    for tok in tokens:
        lab = comp_at(tok["cx"], tok["cy"])
        (seen[lab].append(tok) if lab else missing.append(tok))
    out = []
    for lab, toks in seen.items():
        x0, y0, w, h = (int(v) for v in stats[lab, :4])
        mask = (labels[y0:y0 + h, x0:x0 + w] == lab).astype(np.uint8)
        toks = list({(t["t"], round(t["cx"]), round(t["cy"])): t for t in toks}.values())
        if len(toks) == 2:
            a, b = toks
            ys, xs = np.nonzero(mask)
            X, Y = (xs + x0) / K, (ys + y0) / K
            side = (X - (a["cx"] + b["cx"]) / 2) * (b["cx"] - a["cx"]) + (Y - (a["cy"] + b["cy"]) / 2) * (b["cy"] - a["cy"])
            for tok, sel in ((a, side < 0), (b, side >= 0)):
                m = np.zeros_like(mask); m[ys[sel], xs[sel]] = 1
                out.append(build_lot(m, x0, y0, tok))
            problems.append(("área dividida entre dos números", [t["t"] for t in toks]))
        else:
            if len(toks) > 2:
                problems.append(("varios números en un área", [t["t"] for t in toks]))
            out.append(build_lot(mask, x0, y0, toks[0]))
    return out, missing


problems = []
gray, labels, stats = segment(keep_guides=False)
lots, missing = extract(labels, stats, num_tokens, problems)
del labels; gc.collect()
if missing:
    _, labels2, stats2 = segment(keep_guides=True)
    extra, still = extract(labels2, stats2, missing, problems)
    lots += extra
    for t in still:
        problems.append(("sin área cerrada", t["t"], round(t["cx"]), round(t["cy"])))
    del labels2; gc.collect()

# ---------------- asignar manzana y resolver duplicados ----------------
for l in lots:
    l["mz"] = l["scores"].most_common(1)[0][0]
for _ in range(3):
    groups = collections.defaultdict(list)
    for l in lots:
        groups[(l["mz"], l["num"])].append(l)
    changed = False
    for (mz, num), ls in groups.items():
        if len(ls) < 2:
            continue
        # conserva el que está más cerca del círculo de su manzana; el otro pasa a su 2ª opción libre
        ls.sort(key=lambda l: math.hypot(mz_labels[mz][0] - l["tx"], mz_labels[mz][1] - l["ty"]))
        for l in ls[1:]:
            taken = {(x["mz"], x["num"]) for x in lots if x is not l}
            for cand, _ in l["scores"].most_common():
                if cand != mz and (cand, num) not in taken:
                    problems.append(("duplicado reasignado", f"{mz}-{num} → {cand}-{num}"))
                    l["mz"] = cand; changed = True
                    break
    if not changed:
        break

# ---------------- agua y huella ----------------
# el agua está como imagen en el PDF: se detecta por color en el render completo
full = page.get_pixmap(matrix=pymupdf.Matrix(K, K), alpha=False, clip=page.rect)
rgb = np.frombuffer(full.samples, dtype=np.uint8).reshape(full.height, full.width, 3).astype(np.int16)
wbin = (np.abs(rgb - np.array([78, 138, 196])).sum(axis=2) < 70).astype(np.uint8)
clip = np.zeros_like(wbin); clip[int(PLAN_CLIP.y0 * K):int(PLAN_CLIP.y1 * K), int(PLAN_CLIP.x0 * K):int(PLAN_CLIP.x1 * K)] = 1
wbin = cv2.morphologyEx(wbin * clip, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
del rgb, full; gc.collect()

# puntos rojos de "vendido" del plano (trazos gruesos rojos)
sold_dots = []
for d in drawings:
    if key(d.get("color")) == (0.9, 0.11, 0.11) and (d.get("width") or 0) > 5:
        r = d["rect"]; sold_dots.append(((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2))
for l in lots:
    poly = Polygon(l["pts"])
    l["vendido_plano"] = any(poly.buffer(1.5).contains(__import__("shapely").geometry.Point(x, y)) for x, y in sold_dots)
cnts, _ = cv2.findContours(wbin, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
water = [[[round(float(p[0][0]) / K, 1), round(float(p[0][1]) / K, 1)] for p in cv2.approxPolyDP(c, 1.5, True)]
         for c in cnts if cv2.contourArea(c) > 400]

wall = cv2.dilate((gray < 200).astype(np.uint8), np.ones((3, 3), np.uint8))
n, lab_all, st_all, _ = cv2.connectedComponentsWithStats((1 - wall).astype(np.uint8), connectivity=4)
big = [i for i in range(1, n) if st_all[i, cv2.CC_STAT_AREA] > 1_300_000]
site = np.isin(lab_all, big, invert=True).astype(np.uint8)
del lab_all; gc.collect()
site = cv2.morphologyEx(site, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
cnts, _ = cv2.findContours(site, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
site_polys = [[[round(float(p[0][0]) / K, 1), round(float(p[0][1]) / K, 1)] for p in cv2.approxPolyDP(c, 2, True)]
              for c in cnts if cv2.contourArea(c) > 90000]

for l in lots:
    l["scores"] = {k: round(v) for k, v in l["scores"].most_common(3)}
json.dump(dict(width=W, height=H, lots=lots, water=water, site=site_polys, pois=pois, mz_labels=mz_labels,
               problems=problems), open(OUT, "w", encoding="utf-8"), ensure_ascii=False)
print("lotes", len(lots), "| por manzana", dict(sorted(collections.Counter(l["mz"] for l in lots).items())))
print("huella", len(site_polys), "agua", len(water), "sin área del plano:", [f'{l["mz"]}-{l["num"]}' for l in lots if l["area_plano"] is None])
for p in problems:
    print("  !", p)

dbg = cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)
rng = np.random.default_rng(7)
for poly in water:
    cv2.fillPoly(dbg, [(np.array(poly) * K).astype(np.int32)], (200, 150, 60))
for l in lots:
    cv2.fillPoly(dbg, [(np.array(l["pts"]) * K).astype(np.int32)], tuple(int(v) for v in rng.integers(90, 235, 3)))
for l in lots:
    cv2.putText(dbg, f'{l["mz"]}{l["num"]}', (int(l["cx"] * K) - 18, int(l["cy"] * K) + 4),
                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 0), 1)
cv2.imwrite("tools/debug_overlay.png", dbg[int(60 * K):int(1990 * K), int(380 * K):int(2420 * K)])
