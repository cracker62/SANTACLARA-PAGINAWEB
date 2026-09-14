/* Terreno realista compartido: pasto, cultivos, doble calzada y árboles alrededor del predio de Santa Clara.
   Lo usan el explorador de lotes (Santa Clara) y la escena de lotes de la página principal. */
(function () {
  /* ---------- geometría y terreno ---------- */
  var T = { x: -700, y: -600, w: 3440, h: 3130 };          // área pintada alrededor del predio (unidades del plano)
  var VIA = [[1594, 1889], [2017, 1638]];                  // borde de la vía Sabanalarga – Palmar de Varela (del plano)
  function parsePts(s) { return s.split(" ").map(function (p) { var c = p.split(","); return [+c[0], +c[1]]; }); }
  function inPoly(x, y, poly) {
    var inside = false;
    for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      var xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  function inAny(x, y, polys) { for (var i = 0; i < polys.length; i++) if (inPoly(x, y, polys[i])) return true; return false; }
  function distEdge(x, y, polys) {
    var best = 1e9;
    polys.forEach(function (poly) {
      for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        var ax = poly[j][0], ay = poly[j][1], bx = poly[i][0], by = poly[i][1];
        var dx = bx - ax, dy = by - ay, t = ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1);
        t = Math.max(0, Math.min(1, t));
        var d = Math.hypot(x - (ax + t * dx), y - (ay + t * dy));
        if (d < best) best = d;
      }
    });
    return best;
  }
  function blob(cx, cy, r, seed) {
    var n = 10, d = "";
    for (var i = 0; i <= n; i++) {
      var a = i / n * Math.PI * 2, k = r * (0.78 + 0.28 * Math.sin(i * 1.7 + seed) * Math.cos(i * .9 + seed * .3));
      var x = cx + Math.cos(a) * k, y = cy + Math.sin(a) * k * .8;
      d += (i ? " L" : "M") + x.toFixed(1) + " " + y.toFixed(1);
    }
    return d + "Z";
  }
  function pintarTerreno(site, water, done) {
    var K = Math.min(0.62, 2200 / T.w), c = document.createElement("canvas");
    c.width = Math.round(T.w * K); c.height = Math.round(T.h * K);
    var g = c.getContext("2d"), seed = 3;
    var rnd = function () { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    var X = function (x) { return (x - T.x) * K; }, Y = function (y) { return (y - T.y) * K; };
    // pasto base
    g.fillStyle = "#93B36B"; g.fillRect(0, 0, c.width, c.height);
    // parcelas de cultivo y potreros con tonos distintos
    for (var i = 0; i < 38; i++) {
      var px = rnd() * c.width, py = rnd() * c.height, pw = 120 + rnd() * 260, ph = 90 + rnd() * 200;
      g.save(); g.translate(px, py); g.rotate(-0.52 + (rnd() - .5) * .3);
      g.fillStyle = ["#A3BF77", "#8AAA62", "#B3C487", "#9DB26E", "#C2BC8A"][Math.floor(rnd() * 5)];
      g.globalAlpha = .55; g.fillRect(-pw / 2, -ph / 2, pw, ph);
      g.restore();
    }
    g.globalAlpha = 1;
    // textura fina
    for (i = 0; i < 26000; i++) {
      g.fillStyle = rnd() > .5 ? "rgba(60,90,35,.10)" : "rgba(210,225,160,.10)";
      g.fillRect(rnd() * c.width, rnd() * c.height, 1 + rnd() * 2.2, 1 + rnd() * 2.2);
    }
    // vía asfaltada
    var vx = VIA[1][0] - VIA[0][0], vy = VIA[1][1] - VIA[0][1], vl = Math.hypot(vx, vy); vx /= vl; vy /= vl;
    // doble calzada: dos carriles separados por un separador verde, hacia afuera del predio
    var nx = -vy, ny = vx;
    var tramo = function (off) { return [[VIA[0][0] - vx * 2600 + nx * off, VIA[0][1] - vy * 2600 + ny * off], [VIA[1][0] + vx * 2600 + nx * off, VIA[1][1] + vy * 2600 + ny * off]]; };
    var ox = nx * 34, oy = ny * 34;
    g.lineCap = "butt";
    var t0 = tramo(34); g.strokeStyle = "#D8CFB8"; g.lineWidth = 60 * K; line(g, t0[0], t0[1], X, Y);          // bermas
    [20, 48].forEach(function (off) {
      var tr = tramo(off);
      g.strokeStyle = "#55595C"; g.lineWidth = 22 * K; line(g, tr[0], tr[1], X, Y);                           // calzada
      var e1 = tramo(off - 10), e2 = tramo(off + 10);
      g.strokeStyle = "rgba(255,255,255,.75)"; g.lineWidth = 1 * K; line(g, e1[0], e1[1], X, Y); line(g, e2[0], e2[1], X, Y);
      g.setLineDash([14 * K, 12 * K]); g.strokeStyle = "#F4F1E4"; g.lineWidth = 1.4 * K; line(g, tr[0], tr[1], X, Y); g.setLineDash([]);
    });
    var sep = tramo(34); g.strokeStyle = "#7FA658"; g.lineWidth = 6 * K; line(g, sep[0], sep[1], X, Y);     // separador
    // árboles: más densos en el borde del predio, dispersos lejos
    var step = 30, pts = [];
    for (var yy = T.y; yy < T.y + T.h; yy += step) {
      for (var xx = T.x; xx < T.x + T.w; xx += step) {
        var x = xx + (rnd() - .5) * step * 1.4, y = yy + (rnd() - .5) * step * 1.4;
        if (inAny(x, y, site) || inAny(x, y, water)) continue;
        var dVia = Math.abs((x - VIA[0][0] - ox) * -vy + (y - VIA[0][1] - oy) * vx);
        if (dVia < 50) continue;
        var d = distEdge(x, y, site);
        var r = 5 + rnd() * 10;
        if (d < r + 6) continue;
        var p = d < 160 ? .55 : d < 420 ? .26 : .1;
        // manchas de bosque
        if (Math.sin(x * .004) * Math.cos(y * .005) > .45) p += .35;
        if (rnd() < p) pts.push([x, y, r]);
      }
    }
    pts.sort(function (a, b) { return a[1] - b[1]; });
    pts.forEach(function (t) {
      var x = X(t[0]), y = Y(t[1]), r = t[2] * K * 1.6;
      g.fillStyle = "rgba(30,45,20,.28)"; g.beginPath(); g.ellipse(x + r * .45, y + r * .5, r, r * .8, 0, 0, 6.283); g.fill();
      var grad = g.createRadialGradient(x - r * .35, y - r * .4, r * .1, x, y, r);
      var tone = rnd();
      grad.addColorStop(0, tone > .5 ? "#8DB257" : "#7BA34A");
      grad.addColorStop(.6, tone > .5 ? "#557F34" : "#4A7430");
      grad.addColorStop(1, "#2F5220");
      g.fillStyle = grad; g.beginPath();
      for (var k = 0; k < 7; k++) {
        var ang = k / 7 * 6.283, rr = r * (.82 + rnd() * .22);
        g.lineTo(x + Math.cos(ang) * rr, y + Math.sin(ang) * rr);
      }
      g.closePath(); g.fill();
    });
    if (c.toBlob) c.toBlob(function (b) { done(URL.createObjectURL(b)); }, "image/jpeg", .86);
    else done(c.toDataURL("image/jpeg", .86));
  }
  function line(g, a, b, X, Y) { g.beginPath(); g.moveTo(X(a[0]), Y(a[1])); g.lineTo(X(b[0]), Y(b[1])); g.stroke(); }

  window.MOTerreno = { T: T, VIA: VIA, parsePts: parsePts, inPoly: inPoly, inAny: inAny, distEdge: distEdge, blob: blob, pintar: pintarTerreno };
})();
