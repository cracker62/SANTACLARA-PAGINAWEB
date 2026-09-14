/*
 * Animaciones guiadas por el scroll (Monte Olimpo y Santa Clara)
 *  [data-words]      palabras que se iluminan una a una mientras bajas; las <em> brillan en dorado
 *  [data-converge]   letras separadas que se juntan hasta formar la palabra
 *  [data-contar]      números que cuentan hasta su valor al aparecer  (data-contar="225" data-prefix="$" data-suffix=" M")
 *  .reveal           bloques que suben suavemente al entrar en pantalla
 *  [data-lotes-vivos] escena fija: el plano real de Santa Clara con números de lotes que se encienden
 * Respeta "reducir movimiento": en ese caso todo se muestra terminado.
 */
(function () {
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var nf = new Intl.NumberFormat("es-CO");
  var scrubbers = [];

  /* progreso 0→1 de un elemento dentro de la ventana */
  function progreso(el, inicio, fin) {
    var r = el.getBoundingClientRect(), vh = window.innerHeight;
    var a = vh * inicio, b = vh * fin; // top del elemento pasa de a → b
    return Math.max(0, Math.min(1, (a - r.top) / (a - b + r.height * .35)));
  }

  /* ---------- palabras ---------- */
  function partirPalabras(el) {
    var n = 0;
    (function walk(node, key) {
      Array.prototype.slice.call(node.childNodes).forEach(function (ch) {
        if (ch.nodeType === 3) {
          var frag = document.createDocumentFragment();
          ch.textContent.split(/(\s+)/).forEach(function (part) {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
            var s = document.createElement("span");
            s.className = "w" + (key ? " w--key" : ""); s.textContent = part; s.dataset.i = n++;
            frag.appendChild(s);
          });
          node.replaceChild(frag, ch);
        } else if (ch.nodeType === 1) walk(ch, key || ch.tagName === "EM" || ch.hasAttribute("data-key"));
      });
    })(el, false);
    return $$(".w", el);
  }
  function initPalabras() {
    $$("[data-words]").forEach(function (el) {
      var words = partirPalabras(el);
      el.classList.add("words");
      if (reduce) { words.forEach(function (w) { w.classList.add("on"); }); return; }
      scrubbers.push(function () {
        var p = progreso(el, .88, .38), lit = Math.round(p * words.length);
        for (var i = 0; i < words.length; i++) words[i].classList.toggle("on", i < lit);
      });
    });
  }

  /* ---------- letras que convergen ---------- */
  function initConverge() {
    $$("[data-converge]").forEach(function (el) {
      var txt = el.textContent; el.textContent = ""; el.setAttribute("aria-label", txt);
      var letters = txt.split("").map(function (c, i) {
        var s = document.createElement("span");
        s.className = "cv"; s.setAttribute("aria-hidden", "true"); s.textContent = c === " " ? " " : c;
        el.appendChild(s); return s;
      });
      var mid = (letters.length - 1) / 2;
      if (reduce) return;
      scrubbers.push(function () {
        var p = progreso(el, .95, .45), e = 1 - Math.pow(1 - p, 3), spread = (1 - e);
        letters.forEach(function (s, i) {
          var d = (i - mid);
          s.style.transform = "translate3d(" + (d * spread * 0.9) + "em," + (Math.sin(i * 1.7) * spread * .6) + "em,0)";
          s.style.opacity = (.15 + .85 * e).toFixed(3);
          s.style.filter = spread > .02 ? "blur(" + (spread * 6).toFixed(1) + "px)" : "none";
        });
      });
    });
  }

  /* ---------- contadores ---------- */
  function initContadores() {
    var els = $$("[data-contar]");
    function pintar(el, v) {
      var dec = +(el.dataset.dec || 0);
      el.textContent = (el.dataset.prefix || "") + (dec ? v.toFixed(dec).replace(".", ",") : nf.format(Math.round(v))) + (el.dataset.suffix || "");
    }
    els.forEach(function (el) { if (!reduce) pintar(el, 0); else pintar(el, +el.dataset.contar); });
    if (reduce || !("IntersectionObserver" in window)) { els.forEach(function (el) { pintar(el, +el.dataset.contar); }); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        io.unobserve(en.target);
        var el = en.target, to = +el.dataset.contar, t0 = performance.now(), dur = 1400;
        (function tick(now) {
          var k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 4);
          pintar(el, to * e); if (k < 1) requestAnimationFrame(tick);
        })(t0);
      });
    }, { threshold: .6 });
    els.forEach(function (el) { io.observe(el); });
  }
  // permite cambiar el valor después (datos que llegan del inventario)
  window.MOAnim = { contar: function (el, valor) { el.dataset.contar = valor; if (reduce) el.textContent = (el.dataset.prefix || "") + nf.format(valor) + (el.dataset.suffix || ""); } };

  /* ---------- aparición ---------- */
  function initReveal() {
    var els = $$(".reveal");
    if (reduce || !("IntersectionObserver" in window)) return;
    els.forEach(function (el) { el.classList.add("is-pending"); });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.remove("is-pending"); io.unobserve(en.target); } });
    }, { threshold: .15, rootMargin: "0px 0px -8% 0px" });
    els.forEach(function (el) { io.observe(el); });
  }

  /* ---------- escena: Santa Clara en el futuro ----------
     Al bajar: se arma el logo, se construyen las casas lote por lote desde la entrada, se pavimentan las vías,
     cae la noche y se encienden las ventanas y los números de los lotes. Usa el mismo terreno realista del explorador. */
  function initLotesVivos() {
    var scene = document.querySelector("[data-lotes-vivos]"), SC = window.SANTA_CLARA, TR = window.MOTerreno;
    if (!scene || !SC || !TR) return;
    var NS = "http://www.w3.org/2000/svg";
    var base = scene.querySelector(".lv-base"), luces = scene.querySelector(".lv-luces"), noche = scene.querySelector(".lv__night");
    var mk = function (tag, attrs, parent) { var e = document.createElementNS(NS, tag); for (var k in attrs) e.setAttribute(k, attrs[k]); parent.appendChild(e); return e; };
    var clamp = function (v) { return Math.max(0, Math.min(1, v)); };
    var ease = function (v) { return 1 - Math.pow(1 - clamp(v), 3); };

    // encuadre: el predio a la derecha en computador y al centro en celular
    var xs = [], ys = [];
    SC.site.forEach(function (s) { s.split(" ").forEach(function (p) { var c = p.split(","); xs.push(+c[0]); ys.push(+c[1]); }); });
    var bx = Math.min.apply(null, xs), by = Math.min.apply(null, ys), bw = Math.max.apply(null, xs) - bx, bh = Math.max.apply(null, ys) - by;
    function encuadrar() {
      var vw = scene.clientWidth || innerWidth, vh = innerHeight, movil = vw < 860;
      var usoW = movil ? .96 : .56, usoH = movil ? .5 : .86, centroX = movil ? .5 : .68, centroY = movil ? .54 : .54;
      var escala = Math.max(bw / (vw * usoW), bh / (vh * usoH));
      var W = vw * escala, H = vh * escala;
      var vb = [bx + bw / 2 - W * centroX, by + bh / 2 - H * centroY, W, H].map(function (n) { return n.toFixed(1); }).join(" ");
      base.setAttribute("viewBox", vb); luces.setAttribute("viewBox", vb);
    }
    encuadrar(); window.addEventListener("resize", encuadrar);

    // capa base: terreno, vías, agua, zonas verdes, lotes y casas
    var sitePolys = SC.site.map(TR.parsePts), waterPolys = SC.water.map(TR.parsePts);
    mk("rect", { x: TR.T.x - 6000, y: TR.T.y - 6000, width: TR.T.w + 12000, height: TR.T.h + 12000, fill: "#8BAB63" }, base); // pasto más allá del terreno pintado
    var img = mk("image", { x: TR.T.x, y: TR.T.y, width: TR.T.w, height: TR.T.h, preserveAspectRatio: "none" }, base);
    TR.pintar(sitePolys, waterPolys, function (url) { img.setAttribute("href", url); });
    var defs = mk("defs", {}, base);
    var agua = mk("linearGradient", { id: "lv-agua", x1: 0, y1: 0, x2: 1, y2: 1 }, defs);
    mk("stop", { offset: 0, "stop-color": "#5FA8C9" }, agua); mk("stop", { offset: 1, "stop-color": "#1E5F86" }, agua);
    var gVias = mk("g", { class: "lv-vias" }, base);
    SC.site.forEach(function (pts) { mk("polygon", { points: pts, class: "lv-site" }, gVias); });
    var gVerde = mk("g", { class: "lv-verde" }, base);
    ["ECOPARQUE", "ZONA CONTEMPLACIÓN", "ZONA PICNIC", "ÁREA COMÚN", "LAGO 1", "LAGO 2"].forEach(function (n) {
      SC.pois.filter(function (p) { return p.t === n; }).forEach(function (p) { mk("path", { d: TR.blob(p.x, p.y, 64, n.length), class: "lv-green" }, gVerde); });
    });
    SC.water.forEach(function (pts) { mk("polygon", { points: pts, class: "lv-water" }, base); });
    var gLots = mk("g", {}, base), gCasas = mk("g", {}, base);
    // tapa los círculos "Mz" que el plano original deja como huecos entre lotes
    var huecos = (SC.manzanas || []).map(function (m) { return mk("circle", { cx: m.x, cy: m.y, r: 17, class: "lv-lot" }, base); });

    // capa de luces (encima de la noche): ventanas y números que brillan
    // el brillo se hace con degradados radiales (sin filtros de desenfoque, que son muy costosos al hacer scroll)
    var ldefs = mk("defs", {}, luces);
    var rg = mk("radialGradient", { id: "lv-halo" }, ldefs);
    mk("stop", { offset: 0, "stop-color": "#FFD27A", "stop-opacity": .9 }, rg);
    mk("stop", { offset: .35, "stop-color": "#FFB347", "stop-opacity": .45 }, rg);
    mk("stop", { offset: 1, "stop-color": "#FFB347", "stop-opacity": 0 }, rg);
    var gHalo = mk("g", {}, luces), gVent = mk("g", {}, luces), gNums = mk("g", {}, luces);

    var seed = 17, rnd = function () { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    var techos = [["#B8603E", "#9A4B2E"], ["#C9774F", "#A95E3A"], ["#6E7278", "#575B61"], ["#4B4F55", "#3A3D42"], ["#E2DACB", "#C7BEAE"], ["#8E5B3E", "#724630"]];
    var gar = SC.pois.filter(function (p) { return p.t === "GARITA"; })[0] || { x: bx + bw, y: by + bh };
    var lots = SC.lots.filter(function (l) { return l.estado !== "tecnico"; }).map(function (l) {
      var pts = TR.parsePts(l.pts), area = 0, largo = 0, ang = 0;
      for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        area += (pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1]) / 2;
        var dx = pts[i][0] - pts[j][0], dy = pts[i][1] - pts[j][1], d = Math.hypot(dx, dy);
        if (d > largo) { largo = d; ang = Math.atan2(dy, dx) * 180 / Math.PI; }
      }
      return { l: l, lado: Math.sqrt(Math.abs(area)), ang: ang, d: Math.hypot(l.cx - gar.x, l.cy - gar.y) };
    }).sort(function (a, b) { return a.d - b.d; });

    lots.forEach(function (o, k) {
      var l = o.l, s = o.lado, w = s * .56, h = s * .38, t = techos[Math.floor(rnd() * techos.length)];
      o.poly = mk("polygon", { points: l.pts, class: "lv-lot" }, gLots);
      var g = mk("g", { class: "lv-casa", transform: "translate(" + l.cx + " " + l.cy + ") rotate(" + o.ang.toFixed(1) + ")" }, gCasas);
      var inner = mk("g", { class: "lv-casa__in" }, g);
      mk("rect", { x: -w / 2 + 3, y: -h / 2 + 4, width: w, height: h, fill: "rgba(20,30,15,.35)" }, inner);          // sombra
      mk("rect", { x: -w / 2, y: -h / 2, width: w, height: h / 2, fill: t[0] }, inner);                              // agua 1 del techo
      mk("rect", { x: -w / 2, y: 0, width: w, height: h / 2, fill: t[1] }, inner);                                   // agua 2
      mk("line", { x1: -w / 2, y1: 0, x2: w / 2, y2: 0, stroke: "rgba(255,255,255,.25)", "stroke-width": 1 }, inner); // cumbrera
      mk("circle", { cx: w / 2 + s * .12, cy: h / 2 + s * .06, r: s * .11, class: "lv-arbol" }, inner);              // árbol del patio
      // luces de la casa
      o.halo = mk("circle", { cx: l.cx, cy: l.cy, r: s * .7, class: "lv-halo", fill: "url(#lv-halo)" }, gHalo);
      o.vent = mk("circle", { cx: l.cx, cy: l.cy, r: 2.6, class: "lv-vent" }, gVent);
      o.num = mk("text", { x: l.cx, y: l.cy - s * .34, class: "lv-n" + (l.estado === "disponible" ? " lv-n--d" : "") }, gNums);
      o.num.textContent = l.n;
      o.casa = g;
    });

    // logo que se arma
    var logo = scene.querySelector("[data-lv-logo]");
    var piezas = logo ? {
      sol: logo.querySelector(".lg--sol"), gav: logo.querySelector(".lg--gaviota"), o1: logo.querySelector(".lg--ola1"),
      o2: logo.querySelector(".lg--ola2"), o3: logo.querySelector(".lg--ola3"), sub: logo.querySelector(".lg--sub"),
      letras: Array.prototype.slice.call(logo.querySelectorAll(".lg--letra"))
    } : null;
    function armarLogo(k) {
      if (!piezas) return;
      var set = function (el, tx, ty, op, extra) { if (el) { el.style.transform = "translate3d(" + tx + "%," + ty + "%,0)" + (extra || ""); el.style.opacity = op; } };
      var e1 = ease(k / .45), e2 = ease((k - .1) / .45), e3 = ease((k - .2) / .45), e4 = ease((k - .3) / .45), e5 = ease((k - .45) / .45), e6 = ease((k - .6) / .4);
      set(piezas.sol, 0, (1 - e1) * 38, e1, " scale(" + (.7 + .3 * e1) + ")");
      set(piezas.o1, -(1 - e2) * 55, 0, e2); set(piezas.o2, (1 - e3) * 55, 0, e3); set(piezas.o3, -(1 - e4) * 55, 0, e4);
      set(piezas.gav, (1 - e5) * 40, -(1 - e5) * 30, e5, " rotate(" + (-(1 - e5) * 25) + "deg)");
      var n = piezas.letras.length, mid = (n - 1) / 2;
      piezas.letras.forEach(function (el, i) {
        var e = ease((k - .35 - i * .03) / .45);
        el.style.transform = "translate3d(" + ((i - mid) * (1 - e) * 14) + "%," + ((1 - e) * 18) + "%,0)";
        el.style.opacity = e; el.style.filter = e < .98 ? "blur(" + ((1 - e) * 8).toFixed(1) + "px)" : "none";
      });
      set(piezas.sub, 0, (1 - e6) * 12, e6);
    }

    var steps = $$("[data-lv-step]", scene), total = lots.length, lastBuilt = -1, lastLit = -1, lastStep = -1, pavimento = null;
    var track = scene.querySelector(".lv__track") || scene;
    function draw(p) {
      armarLogo(clamp(p / .2));
      var built = Math.round(clamp((p - .14) / .56) * total);
      var night = clamp((p - .48) / .3), lit = Math.round(clamp((p - .55) / .35) * total);
      if (built !== lastBuilt) {
        for (var i = 0; i < total; i++) { var on = i < built; lots[i].casa.classList.toggle("on", on); lots[i].poly.classList.toggle("on", on); }
        lastBuilt = built;
      }
      if (lit !== lastLit) {
        for (var j = 0; j < total; j++) { var enc = j < lit; lots[j].halo.classList.toggle("on", enc); lots[j].vent.classList.toggle("on", enc); lots[j].num.classList.toggle("on", enc); }
        lastLit = lit;
      }
      var pav = p > .36;
      if (pav !== pavimento) {
        gVias.classList.toggle("on", pav); gVerde.classList.toggle("on", pav);
        huecos.forEach(function (c) { c.classList.toggle("on", pav); });
        pavimento = pav;
      }
      noche.style.opacity = (night * .68).toFixed(3);
      luces.style.opacity = night > 0 ? 1 : 0;
      var st = p < .2 ? -1 : Math.min(steps.length - 1, Math.floor(((p - .2) / .8) * steps.length * .999));
      if (st !== lastStep) { steps.forEach(function (s, i) { s.classList.toggle("is-on", i === st); }); lastStep = st; }
    }
    if (reduce) { draw(1); steps.forEach(function (s) { s.classList.add("is-on"); }); scene.classList.add("lv--static"); return; }
    scrubbers.push(function () {
      var r = track.getBoundingClientRect(), vh = window.innerHeight;
      draw(clamp(-r.top / Math.max(1, r.height - vh)));
    });
  }

  function loop() {
    var ticking = false;
    function run() { ticking = false; scrubbers.forEach(function (fn) { fn(); }); }
    function req() { if (!ticking) { ticking = true; requestAnimationFrame(run); } }
    window.addEventListener("scroll", req, { passive: true });
    window.addEventListener("resize", req);
    run();
  }

  document.addEventListener("DOMContentLoaded", function () {
    document.documentElement.classList.add("js");
    initPalabras(); initConverge(); initContadores(); initReveal(); initLotesVivos(); loop();
  });
})();
