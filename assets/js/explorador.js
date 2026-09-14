/* Santa Clara Digital · Explorador de lotes, ficha, simulador y WhatsApp */
(function () {
  var SC = window.SANTA_CLARA, CFG = MO.cfg, F = CFG.financiacion;
  var NS = "http://www.w3.org/2000/svg";
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var track = function (ev, data) { if (window.dataLayer) window.dataLayer.push(Object.assign({ event: ev }, data || {})); };
  var isMobile = function () { return window.matchMedia("(max-width: 1100px)").matches; };
  var fmtN = new Intl.NumberFormat("es-CO");

  var lots = SC.lots, byId = {};
  lots.forEach(function (l) { byId[l.id] = l; });
  var vendibles = lots.filter(function (l) { return l.estado !== "tecnico"; });
  var disponibles = lots.filter(function (l) { return l.estado === "disponible"; });

  var ESTADO = { disponible: "Disponible", vendido: "Vendido", proximamente: "Próximamente", tecnico: "Zona técnica" };
  var nombreLote = function (l) { return "Mz. " + l.mz + " · Lote " + l.n; };
  var cuotaDesde = function (l) { var r = MO.reglaPlazo(l.area); return MO.proyeccion(l.precio, F.default_down_payment, r.max_months).cuota; };

  document.addEventListener("DOMContentLoaded", function () {
    document.documentElement.classList.add("js");
    stats(); comercial(); youtube(); carrusel(); mapaUbicacion(); visita();
    buildMap(); filtros(); vistas(); lista(); amenidades();
    window.seleccionarLote = function (id) {
      var l = byId[norm(id)]; if (!l) return;
      $("#lotes").scrollIntoView({ behavior: "smooth" });
      setTimeout(function () { setVista("plano"); select(l, { zoom: true }); }, 450);
    };
    var q = new URLSearchParams(location.search).get("lote");
    if (q && byId[norm(q)]) { select(byId[norm(q)], { zoom: true }); setTimeout(function () { $("#lotes").scrollIntoView(); }, 60); }
  });

  /* ------------------------------------------------------------------ datos generales */
  function stats() {
    var areas = vendibles.map(function (l) { return l.area; });
    var precios = disponibles.map(function (l) { return l.precio; });
    var set = function (k, v) { $$('[data-stat="' + k + '"]').forEach(function (el) { el.textContent = v; }); };
    var M = function (v) { return "$" + Math.round(v / 1e6) + " M"; };
    set("disponibles", disponibles.length);
    set("desde", M(Math.min.apply(null, precios)));
    set("rango-area", fmtN.format(Math.min.apply(null, areas)) + " – " + fmtN.format(Math.max.apply(null, areas)) + " m²");
    set("rango-precio", M(Math.min.apply(null, precios)) + " – " + M(Math.max.apply(null, precios)));
    set("total-txt", vendibles.length + " lotes en el plano");
  }

  /* Video comercial con información general: suena solo si la persona lo activa */
  function comercial() {
    var box = $("[data-comercial]"); if (!box) return;
    var v = $("video", box), snd = $("[data-sound]", box), label = $("span", snd);
    if ("IntersectionObserver" in window) new IntersectionObserver(function (e) {
      if (e[0].isIntersecting) { var p = v.play(); if (p && p.catch) p.catch(function () {}); } else v.pause();
    }, { threshold: .3 }).observe(box);
    snd.addEventListener("click", function () {
      var on = v.muted; v.muted = !on;
      if (on) { v.currentTime = 0; v.play(); track("video_sonido", {}); }
      snd.setAttribute("aria-pressed", on); label.textContent = on ? "Silenciar" : "Activar sonido";
    });
  }

  /* Videos de YouTube: se reproducen solos (en silencio, como exigen los navegadores) cuando aparecen en pantalla */
  function youtube() {
    var box = $("[data-youtube]"); if (!box) return;
    (CFG.videos_youtube || []).forEach(function (v) {
      var card = document.createElement("article");
      card.className = "ytc";
      card.innerHTML =
        '<div class="ytc__media"><img src="https://i.ytimg.com/vi/' + v.id + '/hqdefault.jpg" alt="" loading="lazy">' +
        '<button class="play" type="button" aria-label="Reproducir: ' + v.titulo + '"><span><svg viewBox="0 0 22 22" fill="currentColor"><path d="M6 3l13 8-13 8z"/></svg></span></button></div>' +
        '<div class="ytc__info"><span class="yt__tag">YouTube</span><h3>' + v.titulo + "</h3>" + (v.descripcion ? "<p>" + v.descripcion + "</p>" : "") +
        '<a href="https://youtu.be/' + v.id + '" target="_blank" rel="noopener">Ver en YouTube →</a></div>';
      var media = $(".ytc__media", card), cargado = false;
      function cargar(conSonido) {
        if (cargado) return; cargado = true;
        media.innerHTML = '<iframe src="https://www.youtube-nocookie.com/embed/' + v.id + "?autoplay=1&mute=" + (conSonido ? 0 : 1) +
          "&playsinline=1&loop=1&playlist=" + v.id + '&rel=0&modestbranding=1" title="' + v.titulo + '" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>';
        track("video_play", { video: v.id, auto: !conSonido });
      }
      $(".play", card).addEventListener("click", function () { cargar(true); });
      if ("IntersectionObserver" in window && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        var io = new IntersectionObserver(function (e) { if (e[0].isIntersecting) { cargar(false); io.disconnect(); } }, { threshold: .5 });
        io.observe(media);
      }
      box.appendChild(card);
    });
  }

  function carrusel() {
    var c = $("[data-carrusel]"); if (!c) return;
    $$("[data-carr]").forEach(function (b) {
      b.addEventListener("click", function () { c.scrollBy({ left: +b.dataset.carr * c.clientWidth * .8, behavior: "smooth" }); });
    });
  }

  /* Ubicación: tarjeta liviana; el mapa interactivo de Google carga solo si la persona lo pide */
  function mapaUbicacion() {
    var box = $("[data-ubi-mapa]"), b = $("[data-ubi-ver]"); if (!box || !b) return;
    b.addEventListener("click", function () {
      box.classList.add("is-mapa");
      box.innerHTML = '<iframe title="Mapa de ubicación de Santa Clara" referrerpolicy="no-referrer-when-downgrade" src="https://maps.google.com/maps?q=10.6997354,-74.8061069&z=14&hl=es&output=embed"></iframe>';
      track("mapa_ubicacion", {});
    });
  }

  function visita() {
    var f = $("[data-visita]"); if (!f) return;
    f.addEventListener("submit", function (e) {
      e.preventDefault();
      var err = $("[data-err]", f), nombre = f.nombre.value.trim();
      if (!nombre) { err.hidden = false; err.textContent = "Escribe tu nombre para que el asesor sepa con quién habla."; f.nombre.focus(); return; }
      if (!f.acepto.checked) { err.hidden = false; err.textContent = "Para enviarlo, acepta la política de tratamiento de datos."; return; }
      err.hidden = true;
      var msg = "Hola, soy " + nombre + ". Quiero agendar una visita a Santa Clara – Poblado Campestre.\nFecha: " + f.cuando.value + "." +
        (f.lote.value.trim() ? "\nLote de interés: " + f.lote.value.trim().toUpperCase() + "." : "");
      track("schedule_visit", { lote: f.lote.value });
      window.open(MO.waLink(msg), "_blank", "noopener");
    });
  }

  /* ------------------------------------------------------------------ mapa */
  var svg, view, mapEl, vb, fitVb, lotEls = {}, tip, badges = [];
  function el(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function poiPos(name) {
    if (name === "CIÉNAGA") {
      var w = SC.water.slice().sort(function (a, b) { return b.length - a.length; })[0].split(" ").map(function (p) { return p.split(",").map(Number); });
      var xs = w.map(function (p) { return p[0]; }), ys = w.map(function (p) { return p[1]; });
      return { x: (Math.min.apply(null, xs) + Math.max.apply(null, xs)) / 2, y: (Math.min.apply(null, ys) + Math.max.apply(null, ys)) / 2 };
    }
    var p = SC.pois.filter(function (p) { return p.t === name; })[0];
    return p ? { x: p.x, y: p.y } : null;
  }

  /* ---------- geometría y terreno (assets/js/terreno.js) ---------- */
  var TR = window.MOTerreno, T = TR.T, parsePts = TR.parsePts, inAny = TR.inAny, blob = TR.blob, pintarTerreno = TR.pintar;

  function buildMap() {
    mapEl = $("[data-map]"); svg = $("[data-svg]"); view = $("[data-view]"); tip = $("[data-tip]");
    var sitePolys = SC.site.map(parsePts), waterPolys = SC.water.map(parsePts);
    // 1) terreno: pasto, cultivos, vía y árboles pintados en un lienzo (una sola imagen, rápida al mover el mapa)
    var terreno = el("image", { x: T.x, y: T.y, width: T.w, height: T.h, preserveAspectRatio: "none" }, view);
    pintarTerreno(sitePolys, waterPolys, function (url) { terreno.setAttribute("href", url); });
    // 2) predio: vías internas en afirmado
    SC.site.forEach(function (pts) { el("polygon", { points: pts, class: "site" }, view); });
    // 3) zonas verdes del proyecto alrededor de lagos, ecoparque y áreas comunes (recortadas al predio)
    var clip = el("clipPath", { id: "clip-predio" }, $("defs", svg));
    SC.site.forEach(function (pts) { el("polygon", { points: pts }, clip); });
    var gVerde = el("g", { "clip-path": "url(#clip-predio)" }, view);
    ["ECOPARQUE", "ZONA CONTEMPLACIÓN", "ZONA PICNIC", "ÁREA COMÚN", "LAGO 1", "LAGO 2"].forEach(function (n) {
      SC.pois.filter(function (p) { return p.t === n; }).forEach(function (p) {
        el("path", { d: blob(p.x, p.y, n.indexOf("LAGO") === 0 ? 78 : 62, n.length), class: "green" }, gVerde);
      });
    });
    // 4) agua con reflejo y oleaje animado
    waterPolys.forEach(function (w, i) {
      var pts = SC.water[i];
      el("polygon", { points: pts, class: "shore" }, view);
      el("polygon", { points: pts, class: "water" }, view);
      el("polygon", { points: pts, class: "waves" }, view);
      el("polygon", { points: pts, class: "glint" }, view);
    });
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) $$("[data-anim]", svg).forEach(function (a) { a.remove(); });
    // 5) árboles de las zonas verdes internas (encima del pasto, debajo de los lotes)
    var gArb = el("g", {}, view), seed = 11;
    var rnd = function () { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    ["ECOPARQUE", "ZONA CONTEMPLACIÓN", "ZONA PICNIC", "ÁREA COMÚN"].forEach(function (n) {
      SC.pois.filter(function (p) { return p.t === n; }).forEach(function (p) {
        for (var i = 0; i < 16; i++) {
          var a = rnd() * 6.283, r = 10 + rnd() * 48, x = p.x + Math.cos(a) * r, y = p.y + Math.sin(a) * r * .75;
          var s = 12 + rnd() * 12;
          if (!inAny(x, y, waterPolys)) el("use", { href: "#arbol", x: x - s / 2, y: y - s / 2, width: s, height: s }, gArb);
        }
      });
    });

    var gLots = el("g", {}, view), gNums = el("g", {}, view), gMz = el("g", {}, view), gPoi = el("g", {}, view);
    var mz = {};
    lots.forEach(function (l) {
      var p = el("polygon", { points: l.pts, class: "lot " + l.estado, "data-id": l.id }, gLots);
      lotEls[l.id] = p;
      // los números de lotes disponibles brillan en una ola que recorre el plano de la entrada hacia el fondo
      var t = el("text", { x: l.cx, y: l.cy, class: "lnum" + (l.estado === "vendido" ? " v" : l.estado === "disponible" ? " d" : ""),
        style: l.estado === "disponible" ? "animation-delay:" + (((2040 - l.cx) / 2040) * 3.2 + ((l.cy / 1930) * .8)).toFixed(2) + "s" : "" }, gNums);
      t.textContent = l.n;
      (mz[l.mz] = mz[l.mz] || []).push(l);
    });
    // insignias de manzana en la misma posición del círculo "Mz" del plano
    (SC.manzanas || []).forEach(function (m) {
      var g = el("g", { class: "mzb", "data-x": m.x, "data-y": m.y }, gMz);
      el("circle", { r: 15 }, g);
      el("text", { class: "mzl" }, g).textContent = m.mz;
      badges.push(g);
    });
    // Íconos de amenidades: [clave, nombre, estado, ícono, desplazamiento x, desplazamiento y]
    var labels = [
      ["LAGO 1", "Lago 1", "Proyectado", "ico-lago", 0, 0], ["LAGO 2", "Lago 2", "Proyectado", "ico-lago", 0, 0],
      ["ECOPARQUE", "Ecoparque", "Proyectado", "ico-ecoparque", 64, 34], ["ZONA CONTEMPLACIÓN", "Contemplación", "Proyectado", "ico-contemplacion", -78, 0],
      ["ZONA PICNIC", "Picnic", "Proyectado", "ico-picnic", -60, -34], ["GARITA", "Garita", "Proyectado", "ico-garita", -30, -30],
      ["ÁREA COMÚN", "Área común", "Proyectado", "ico-comun", 0, 0], ["CIÉNAGA", "Ciénaga El Pelú", "Entorno natural", "ico-cienaga", 0, 0]
    ];
    var vistos = {};
    labels.forEach(function (d) {
      var p = poiPos(d[0]); if (!p || vistos[d[0]]) return;
      vistos[d[0]] = 1;
      var x = p.x + d[4], y = p.y + d[5];
      var g = el("g", { class: "poi" + (d[2] === "Entorno natural" ? " nat" : ""), "data-x": x, "data-y": y }, gPoi);
      el("circle", { r: 17, class: "poi__bg" }, g);
      el("use", { href: "#" + d[3], x: -10, y: -10, width: 20, height: 20, class: "poi__ico" }, g);
      el("text", { y: 32, class: "t" }, g).textContent = d[1];
      el("text", { y: 44, class: "s" }, g).textContent = d[2].toUpperCase();
      badges.push(g);
    });
    // Vía de acceso
    var ac = poiPos("GARITA");
    if (ac) {
      var ga = el("g", { class: "acceso", "data-x": ac.x + 40, "data-y": ac.y + 64 }, gPoi);
      el("text", { "text-anchor": "middle" }, ga).textContent = "Doble calzada · Vía Sabanalarga – Palmar de Varela";
      badges.push(ga);
    }

    // encuadre inicial al predio
    var xs = [], ys = [];
    SC.site.forEach(function (s) { s.split(" ").forEach(function (p) { var c = p.split(","); xs.push(+c[0]); ys.push(+c[1]); }); });
    var bb = { x: Math.min.apply(null, xs), y: Math.min.apply(null, ys) };
    bb.w = Math.max.apply(null, xs) - bb.x; bb.h = Math.max.apply(null, ys) - bb.y;
    fitVb = function () { return fit(bb, 1.04); };
    vb = fitVb(); apply();
    // si el contenedor cambia de tamaño (carga de fuentes, rotación del celular) se reencuadra,
    // salvo que la persona ya haya movido el mapa: en ese caso se conserva el centro
    var refit = function () {
      if (!mapEl.dataset.moved) { vb = fitVb(); apply(); return; }
      var c = { x: vb.x + vb.w / 2, y: vb.y + vb.h / 2 }; vb.h = vb.w * ratio(); vb.x = c.x - vb.w / 2; vb.y = c.y - vb.h / 2; apply();
    };
    if ("ResizeObserver" in window) new ResizeObserver(refit).observe(mapEl); else window.addEventListener("resize", refit);
    ["pointerdown", "wheel"].forEach(function (ev) { mapEl.addEventListener(ev, function () { mapEl.dataset.moved = "1"; }, { passive: true }); });

    interactions();
  }
  function ratio() { var r = mapEl.getBoundingClientRect(); return (r.height || 600) / (r.width || 800); }
  function fit(b, pad) {
    var a = ratio(), w = Math.max(b.w, b.h / a) * pad, h = w * a;
    return { x: b.x + b.w / 2 - w / 2, y: b.y + b.h / 2 - h / 2, w: w, h: h };
  }
  function apply() {
    svg.setAttribute("viewBox", vb.x + " " + vb.y + " " + vb.w + " " + vb.h);
    mapEl.classList.toggle("z2", vb.w < 760);
    mapEl.classList.toggle("z0", vb.w > 1250);
    // las insignias mantienen un tamaño legible en pantalla
    var px = mapEl.getBoundingClientRect().width || 800, s = Math.max(1.05, Math.min(2.2, (vb.w / px) * .8));
    badges.forEach(function (g) { g.setAttribute("transform", "translate(" + g.dataset.x + " " + g.dataset.y + ") scale(" + s + ")"); });
  }
  function zoomAt(factor, cx, cy) {
    var maxW = fitVb().w * 1.3, minW = 160;
    var nw = Math.min(maxW, Math.max(minW, vb.w * factor)), k = nw / vb.w;
    vb.x = cx - (cx - vb.x) * k; vb.y = cy - (cy - vb.y) * k; vb.w = nw; vb.h = nw * ratio();
    apply();
  }
  function toSvg(clientX, clientY) {
    var r = mapEl.getBoundingClientRect();
    return { x: vb.x + (clientX - r.left) / r.width * vb.w, y: vb.y + (clientY - r.top) / r.height * vb.h };
  }
  function animateTo(target) {
    mapEl.dataset.moved = "1";
    var from = Object.assign({}, vb), t0 = performance.now(), dur = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 520;
    (function step(now) {
      var t = dur ? Math.min(1, (now - t0) / dur) : 1, e = 1 - Math.pow(1 - t, 3);
      ["x", "y", "w", "h"].forEach(function (k) { vb[k] = from[k] + (target[k] - from[k]) * e; });
      apply(); if (t < 1) requestAnimationFrame(step);
    })(t0);
  }
  function focusBox(b, minW) {
    var a = ratio(), w = Math.max(b.w * 1.6, (b.h * 1.6) / a, minW || 380), h = w * a;
    animateTo({ x: b.x + b.w / 2 - w / 2, y: b.y + b.h / 2 - h / 2, w: w, h: h });
  }
  function lotBox(ls) {
    var xs = [], ys = [];
    ls.forEach(function (l) { l.pts.split(" ").forEach(function (p) { var c = p.split(","); xs.push(+c[0]); ys.push(+c[1]); }); });
    var x = Math.min.apply(null, xs), y = Math.min.apply(null, ys);
    return { x: x, y: y, w: Math.max.apply(null, xs) - x, h: Math.max.apply(null, ys) - y };
  }

  function interactions() {
    var pointers = new Map(), start = null, moved = 0, downTarget = null, pinch = null, active = false;
    mapEl.addEventListener("pointerdown", function (e) {
      if (e.target.closest(".map-ctrl")) return;
      active = true;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      mapEl.setPointerCapture(e.pointerId);
      if (pointers.size === 1) { start = { x: e.clientX, y: e.clientY, vb: Object.assign({}, vb) }; moved = 0; downTarget = e.target; }
      if (pointers.size === 2) { var p = Array.from(pointers.values()); pinch = { d: dist(p[0], p[1]), w: vb.w }; moved = 99; }
      hideTip();
    });
    mapEl.addEventListener("pointermove", function (e) {
      if (!pointers.has(e.pointerId)) { hover(e); return; }
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      var r = mapEl.getBoundingClientRect();
      if (pointers.size === 1 && start) {
        var dx = e.clientX - start.x, dy = e.clientY - start.y;
        moved = Math.max(moved, Math.abs(dx) + Math.abs(dy));
        if (moved > 5) {
          mapEl.classList.add("is-dragging");
          vb.x = start.vb.x - dx / r.width * vb.w; vb.y = start.vb.y - dy / r.height * vb.h; apply();
        }
      } else if (pointers.size === 2 && pinch) {
        var p = Array.from(pointers.values()), mid = toSvg((p[0].x + p[1].x) / 2, (p[0].y + p[1].y) / 2);
        zoomAt((pinch.w * pinch.d / dist(p[0], p[1])) / vb.w, mid.x, mid.y);
      }
    });
    var end = function (e) {
      if (!pointers.has(e.pointerId)) return;
      pointers.delete(e.pointerId);
      mapEl.classList.remove("is-dragging");
      if (pointers.size < 2) pinch = null;
      if (pointers.size === 1) { var p = Array.from(pointers.values())[0]; start = { x: p.x, y: p.y, vb: Object.assign({}, vb) }; }
      if (pointers.size === 0 && moved <= 5 && downTarget && downTarget.classList && downTarget.classList.contains("lot")) {
        var l = byId[downTarget.getAttribute("data-id")];
        if (l && l.estado !== "tecnico") select(l, { from: "map" });
      }
    };
    mapEl.addEventListener("pointerup", end);
    mapEl.addEventListener("pointercancel", end);
    mapEl.addEventListener("pointerleave", function () { active = false; hideTip(); });
    mapEl.addEventListener("wheel", function (e) {
      if (!(active || e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      var p = toSvg(e.clientX, e.clientY);
      zoomAt(Math.exp(e.deltaY * 0.0016), p.x, p.y);
    }, { passive: false });
    $$("[data-zoom]").forEach(function (b) {
      b.addEventListener("click", function () {
        var z = b.dataset.zoom, c = { x: vb.x + vb.w / 2, y: vb.y + vb.h / 2 };
        if (z === "reset") animateTo(fitVb()); else zoomAt(z === "in" ? .65 : 1.5, c.x, c.y);
      });
    });
  }
  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y) || 1; }
  function hover(e) {
    if (e.pointerType !== "mouse") return;
    var t = e.target;
    if (!t.classList || !t.classList.contains("lot")) { hideTip(); return; }
    var l = byId[t.getAttribute("data-id")], r = mapEl.getBoundingClientRect();
    tip.hidden = false;
    tip.style.left = (e.clientX - r.left) + "px"; tip.style.top = (e.clientY - r.top) + "px";
    tip.innerHTML = '<span class="st">' + ESTADO[l.estado] + "</span><b>" + nombreLote(l) + "</b>" +
      (l.area ? fmtN.format(l.area) + " m²" : "") + (l.estado === "disponible" ? " · " + MO.pesos(l.precio) : "");
  }
  function hideTip() { if (tip) tip.hidden = true; }

  /* ------------------------------------------------------------------ filtros y lista */
  var st = { q: "", etapa: "", area: "", ubic: "", solo: false, sort: "precio", limit: 30 };
  function norm(q) {
    q = (q || "").toUpperCase().replace(/\s+/g, "").replace(/^MZ\.?/, "");
    var m = q.match(/^([A-Z]\d?)[-·.]?(\d+(?:-\d)?)$/);
    if (!m) return q;
    var id = m[1] + "-" + m[2];
    if (byId[id]) return id;
    // tolera A/A1 y E/E1 y F/F1
    var alt = [m[1] + "1-" + m[2], m[1].replace(/1$/, "") + "-" + m[2]];
    for (var i = 0; i < alt.length; i++) if (byId[alt[i]]) return alt[i];
    return id;
  }
  function matches(l) {
    if (st.etapa && String(l.etapa) !== st.etapa) return false;
    if (st.area) { var r = st.area.split("-").map(Number); if (!(l.area >= r[0] && l.area <= r[1])) return false; }
    if (st.ubic && l.ubic !== st.ubic) return false;
    if (st.solo && l.estado !== "disponible") return false;
    return true;
  }
  function filtros() {
    var ubics = {};
    disponibles.forEach(function (l) { if (l.ubic) ubics[l.ubic] = 1; });
    var sel = $("[data-ubic]");
    Object.keys(ubics).sort().forEach(function (u) { var o = document.createElement("option"); o.value = u; o.textContent = u; sel.appendChild(o); });
    sel.addEventListener("change", function () { st.ubic = sel.value; refresh(true); });
    $$("[data-filter]").forEach(function (g) {
      g.addEventListener("click", function (e) {
        var b = e.target.closest("button"); if (!b) return;
        $$("button", g).forEach(function (x) { x.setAttribute("aria-pressed", x === b); });
        st[g.dataset.filter] = b.dataset.v; refresh(true);
      });
    });
    $("[data-solo-disp]").addEventListener("change", function (e) { st.solo = e.target.checked; refresh(true); });
    $("[data-sort]").addEventListener("change", function (e) { st.sort = e.target.value; st.shown = 0; st.limit = 24; lista(); });
    var tgl = $("[data-filters-toggle]"), bar = $("[data-toolbar]");
    tgl.addEventListener("click", function () { var o = !bar.classList.contains("is-open"); bar.classList.toggle("is-open", o); tgl.setAttribute("aria-expanded", o); });

    var input = $("[data-search]"), timer;
    input.addEventListener("input", function () { clearTimeout(timer); timer = setTimeout(function () { buscar(input.value, false); }, 180); });
    input.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); buscar(input.value, true); } });
    refresh(false);
  }
  function buscar(raw, enter) {
    var q = raw.trim();
    $$(".lot.is-hit").forEach(function (p) { p.classList.remove("is-hit"); });
    if (!q) return;
    var id = norm(q);
    if (byId[id]) { track("search_lot", { lote: id }); select(byId[id], { zoom: true }); return; }
    var pref = id.replace(/-$/, "");
    var hits = lots.filter(function (l) { return l.mz === pref || l.id.indexOf(pref + "-") === 0; });
    if (hits.length) { hits.forEach(function (l) { lotEls[l.id].classList.add("is-hit"); }); focusBox(lotBox(hits), 300); }
  }
  function refresh(user) {
    var n = 0, nd = 0;
    lots.forEach(function (l) {
      var ok = matches(l);
      lotEls[l.id].classList.toggle("is-dim", !ok);
      if (ok) { n++; if (l.estado === "disponible") nd++; }
    });
    $("[data-count]").innerHTML = "<b>" + nd + "</b> disponibles";
    $$("[data-count-n], [data-count-list]").forEach(function (el) { el.textContent = nd; });
    if (user) track("filter_lots", { etapa: st.etapa, area: st.area, ubic: st.ubic, solo: st.solo });
    st.limit = 24; st.shown = 0; lista();
  }

  /* Vista Plano / Lista (en celular y tablet se muestra una a la vez para no alargar la página) */
  function setVista(v) {
    var body = $("[data-expl-body]"); if (!body) return;
    body.setAttribute("data-vista-activa", v);
    $$("[data-vista]").forEach(function (b) { b.setAttribute("aria-selected", b.dataset.vista === v); });
    if (v === "plano") window.dispatchEvent(new Event("resize"));
  }
  function vistas() {
    $$("[data-vista]").forEach(function (b) { b.addEventListener("click", function () { setVista(b.dataset.vista); }); });
    // carga progresiva de la lista al desplazarse dentro del panel
    var scroller = $("[data-panel-scroll]");
    if (scroller) scroller.addEventListener("scroll", function () {
      if (st.shown < st.total && scroller.scrollTop + scroller.clientHeight > scroller.scrollHeight - 320) { st.limit += 24; lista(); }
    }, { passive: true });
  }
  function lista() {
    var ul = $("[data-list]"); if (!ul) return;
    var ls = disponibles.filter(matches).slice();
    var s = st.sort;
    ls.sort(function (a, b) {
      if (s === "precio") return a.precio - b.precio || a.area - b.area;
      if (s === "area") return a.area - b.area; if (s === "area-desc") return b.area - a.area;
      return a.id.localeCompare(b.id, "es", { numeric: true });
    });
    var desde = st.shown && st.limit > st.shown && ul.children.length === st.shown ? st.shown : 0;  // al cargar más, solo agrega
    if (!desde) ul.innerHTML = ls.length ? "" : '<li class="empty">No hay lotes disponibles con estos filtros. Prueba con otra área o ubicación.</li>';
    ls.slice(desde, st.limit).forEach(function (l) {
      var li = document.createElement("li");
      li.innerHTML = '<button type="button" data-id="' + l.id + '"><span class="id">' + l.id + '</span><span class="a">' + fmtN.format(l.area) + " m² · " + l.ubic + (l.etapa ? " · Etapa " + l.etapa : "") + '</span><span class="p">' + MO.pesos(l.precio) + '</span><span class="c">desde ' + MO.pesos(cuotaDesde(l)) + "/mes</span></button>";
      ul.appendChild(li);
    });
    st.shown = Math.min(st.limit, ls.length); st.total = ls.length;
    ul.onclick = function (e) { var b = e.target.closest("button[data-id]"); if (b) select(byId[b.dataset.id], { zoom: true, from: "list" }); };
  }

  /* ------------------------------------------------------------------ ficha */
  var current = null, sim = { pct: F.default_down_payment, meses: null }, backdrop = null;
  function select(l, opts) {
    opts = opts || {};
    if (current) lotEls[current.id].classList.remove("is-sel");
    current = l; lotEls[l.id].classList.add("is-sel");
    // traer al frente
    var p = lotEls[l.id]; p.parentNode.appendChild(p);
    var r = MO.reglaPlazo(l.area || 0);
    sim = { pct: F.default_down_payment, meses: r.max_months };
    renderFicha();
    if (opts.zoom) focusBox(lotBox([l]), isMobile() ? 260 : 420);
    var url = new URL(location.href); url.searchParams.set("lote", l.id); url.hash = "lotes";
    history.replaceState(null, "", url);
    var li = $("[data-lote-interes]"); if (li && l.estado === "disponible") li.value = l.id;
    track("view_lot", { lote: l.id, estado: l.estado });
  }
  function closeFicha() {
    if (current) lotEls[current.id].classList.remove("is-sel");
    current = null;
    $("[data-ficha]").hidden = true; $("[data-list-view]").hidden = false;
    var panel = $("[data-panel]"); panel.classList.remove("has-lot");
    document.body.classList.remove("sheet-open");
    if (backdrop) { backdrop.remove(); backdrop = null; }
    var url = new URL(location.href); url.searchParams.delete("lote"); history.replaceState(null, "", url);
  }
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && current) closeFicha(); });

  function renderFicha() {
    var l = current, box = $("[data-ficha]"), panel = $("[data-panel]");
    $("[data-list-view]").hidden = true; box.hidden = false;
    if (isMobile()) {
      panel.classList.add("has-lot"); document.body.classList.add("sheet-open");
      if (!backdrop) { backdrop = document.createElement("div"); backdrop.className = "sheet-backdrop"; backdrop.addEventListener("click", closeFicha); document.body.appendChild(backdrop); }
    }
    var close = '<button type="button" class="ficha__close" data-close aria-label="Cerrar ficha"><svg viewBox="0 0 16 16" stroke="currentColor" stroke-width="1.6"><path d="m3 3 10 10M13 3 3 13"/></svg></button>';
    var html;
    if (l.estado === "disponible") html = fichaDisponible(l, close);
    else if (l.estado === "vendido") html = fichaVendido(l, close);
    else html = fichaProximo(l, close);
    box.innerHTML = html;
    $("[data-panel-scroll]").scrollTop = 0;
    wireFicha(box, l);
  }

  function datos(l) {
    return '<dl class="kv">' +
      (l.etapa ? "<dt>Etapa</dt><dd>" + l.etapa + "</dd>" : "") +
      "<dt>Manzana</dt><dd>" + l.mz + "</dd><dt>Lote</dt><dd>" + l.n + "</dd>" +
      (l.area ? "<dt>Área</dt><dd>" + fmtN.format(l.area) + " m²</dd>" : "") +
      (l.vm2 ? "<dt>Valor por m²</dt><dd>" + MO.pesos(l.vm2) + "</dd>" : "") +
      (l.ubic ? "<dt>Ubicación</dt><dd>" + l.ubic + "</dd>" : "") +
      (l.mat ? "<dt>Matrícula</dt><dd>" + l.mat + "</dd>" : "") +
      "</dl>";
  }

  function fichaDisponible(l, close) {
    var r = MO.reglaPlazo(l.area), opts = "";
    for (var m = r.min_months; m <= r.max_months; m++) opts += '<option value="' + m + '"' + (m === sim.meses ? " selected" : "") + ">" + m + " meses</option>";
    var pcts = F.down_payment_options.map(function (p) { return '<button type="button" class="chip" data-pct="' + p + '" aria-pressed="' + (p === sim.pct) + '">' + p + "%</button>"; }).join("");
    return '<div class="ficha">' +
      '<div class="ficha__top"><div><span class="kicker">¡Excelente elección!</span><h3>' + nombreLote(l) + "</h3></div>" + close + "</div>" +
      '<div class="pills"><span class="pill ok">Disponible</span>' + (l.etapa ? '<span class="pill">Etapa ' + l.etapa + "</span>" : "") + (l.ubic ? '<span class="pill">' + l.ubic + "</span>" : "") + "</div>" +
      '<div class="price"><span>Valor</span><b>' + MO.pesos(l.precio) + "</b></div>" +
      datos(l) +
      '<div class="simbox" data-sim>' +
        "<h4>Proyección de pagos · sin intereses</h4>" +
        '<div class="simrow"><span>Cuota inicial</span><div class="seg" style="gap:6px">' + pcts + "</div></div>" +
        '<div class="simrow"><span>Plazo</span><select class="select plazo-select" data-meses aria-label="Plazo en meses">' + opts + '</select><span class="plazo-note">Plazo disponible para ' + fmtN.format(l.area) + " m²: " + r.min_months + " — " + r.max_months + " meses</span></div>" +
        '<dl class="kv" style="border-top:1px solid var(--sc-linea);padding-top:6px"><dt>Cuota inicial <span data-o-pct></span></dt><dd data-o-ini></dd><dt>Saldo a financiar</dt><dd data-o-saldo></dd>' +
          "<dt>Separación</dt><dd>" + (F.reservation_amount ? MO.pesos(F.reservation_amount) : "Consúltala con tu asesor") + "</dd></dl>" +
        '<div class="cuota"><span>Cuota mensual</span><b data-o-cuota></b></div>' +
        '<details class="proj-table"><summary>Ver proyección mes a mes</summary><div class="tbl-wrap"><table><thead><tr><th>Mes</th><th>Cuota</th><th>Saldo pendiente</th></tr></thead><tbody data-o-tabla></tbody></table></div></details>' +
      "</div>" +
      '<div class="actions">' +
        '<a class="btn btn--sol" data-act="quiero">Quiero este lote</a>' +
        '<a class="btn btn--wa" data-act="proyeccion">Enviar proyección por WhatsApp</a>' +
        '<div class="row2"><a class="btn btn--line" data-act="asesor">Hablar con un asesor</a><a class="btn btn--line" data-act="visita">Agendar visita</a></div>' +
        '<button type="button" class="share" data-share>Compartir este lote</button>' +
      "</div>" +
      '<p class="aviso">' + F.aviso + " El plazo final se acuerda con tu asesor.</p>" +
    "</div>";
  }

  function fichaVendido(l, close) {
    var sims = disponibles.slice().sort(function (a, b) {
      var da = Math.abs(a.area - (l.area || 500)) + Math.hypot(a.cx - l.cx, a.cy - l.cy) * .4;
      var db = Math.abs(b.area - (l.area || 500)) + Math.hypot(b.cx - l.cx, b.cy - l.cy) * .4;
      return da - db;
    }).slice(0, 3);
    return '<div class="ficha">' +
      '<div class="ficha__top"><div><span class="kicker v">Lote vendido</span><h3>' + nombreLote(l) + "</h3></div>" + close + "</div>" +
      '<div class="pills"><span class="pill no">Vendido</span>' + (l.etapa ? '<span class="pill">Etapa ' + l.etapa + "</span>" : "") + "</div>" +
      '<p style="color:var(--sc-tinta-2)">Este lote ya tiene propietario. Estos lotes disponibles se le parecen en área y ubicación:</p>' +
      '<div class="similar"><h4>Lotes similares disponibles</h4><ul class="lotlist">' +
      sims.map(function (s) { return '<li><button type="button" data-id="' + s.id + '"><span class="id">' + s.id + '</span><span class="a">' + fmtN.format(s.area) + " m² · " + s.ubic + '</span><span class="p">' + MO.pesos(s.precio) + '</span><span class="c">desde ' + MO.pesos(cuotaDesde(s)) + "/mes</span></button></li>"; }).join("") +
      "</ul></div>" +
      '<div class="actions"><a class="btn btn--wa" data-act="asesor-general">Hablar con un asesor</a></div></div>';
  }

  function fichaProximo(l, close) {
    return '<div class="ficha">' +
      '<div class="ficha__top"><div><span class="kicker p">Próximamente</span><h3>' + nombreLote(l) + "</h3></div>" + close + "</div>" +
      '<div class="pills"><span class="pill">Próximamente</span></div>' +
      datos(l) +
      '<p style="color:var(--sc-tinta-2)">Este lote aparece en el plano, pero todavía no tiene precio publicado. Pregúntale a tu asesor cuándo sale a la venta.</p>' +
      '<div class="actions"><a class="btn btn--wa" data-act="proximo">Preguntar por este lote</a></div></div>';
  }

  function wireFicha(box, l) {
    var close = $("[data-close]", box); if (close) close.addEventListener("click", closeFicha);
    $$(".similar button[data-id]", box).forEach(function (b) { b.addEventListener("click", function () { select(byId[b.dataset.id], { zoom: true }); }); });
    var simEl = $("[data-sim]", box);
    var proy = null;
    function calc() {
      proy = MO.proyeccion(l.precio, sim.pct, sim.meses);
      $("[data-o-pct]", box).textContent = sim.pct + "%";
      $("[data-o-ini]", box).textContent = MO.pesos(proy.inicial);
      $("[data-o-saldo]", box).textContent = MO.pesos(proy.saldo);
      $("[data-o-cuota]", box).textContent = MO.pesos(proy.cuota);
      $("[data-o-tabla]", box).innerHTML = '<tr class="ini"><td>Inicial</td><td>' + MO.pesos(proy.inicial) + "</td><td>" + MO.pesos(proy.saldo) + "</td></tr>" +
        proy.filas.map(function (f) { return "<tr><td>Mes " + f.mes + "</td><td>" + MO.pesos(f.cuota) + "</td><td>" + MO.pesos(f.saldo) + "</td></tr>"; }).join("");
      links();
    }
    function resumen() {
      return "Área: " + fmtN.format(l.area) + " m²\nValor: " + MO.pesos(l.precio) +
        "\nCuota inicial simulada: " + sim.pct + "% (" + MO.pesos(proy.inicial) + ")" +
        "\nPlazo: " + sim.meses + " meses\nCuota mensual aproximada: " + MO.pesos(proy.cuota);
    }
    function links() {
      var msgs = {
        quiero: "Hola, quiero el lote " + l.id + " de Santa Clara (" + nombreLote(l) + ").\n\n" + resumen() + "\n\n¿Cómo puedo separarlo?",
        proyeccion: "Hola, estoy interesado en el lote " + l.id + " de Santa Clara.\n\n" + resumen() + "\n\nQuiero confirmar disponibilidad y condiciones de financiación.",
        asesor: "Hola, tengo preguntas sobre el lote " + l.id + " de Santa Clara (" + fmtN.format(l.area || 0) + " m²).",
        visita: "Hola, quiero agendar una visita a Santa Clara para conocer el lote " + l.id + ".",
        "asesor-general": "Hola, vi que el lote " + l.id + " de Santa Clara está vendido. ¿Me ayudan a encontrar uno similar?",
        proximo: "Hola, quiero información sobre el lote " + l.id + " de Santa Clara, que aparece como próximamente."
      };
      $$("[data-act]", box).forEach(function (a) {
        a.href = MO.waLink(msgs[a.dataset.act]); a.target = "_blank"; a.rel = "noopener";
        a.onclick = function () { track("whatsapp_click", { lote: l.id, accion: a.dataset.act, meses: sim.meses, inicial: sim.pct }); };
      });
    }
    if (simEl) {
      simEl.addEventListener("click", function (e) {
        var b = e.target.closest("[data-pct]"); if (!b) return;
        sim.pct = +b.dataset.pct;
        $$("[data-pct]", simEl).forEach(function (x) { x.setAttribute("aria-pressed", x === b); });
        calc(); track("financing_simulation", { lote: l.id, inicial: sim.pct, meses: sim.meses });
      });
      $("[data-meses]", simEl).addEventListener("change", function (e) { sim.meses = +e.target.value; calc(); track("financing_simulation", { lote: l.id, inicial: sim.pct, meses: sim.meses }); });
      calc();
    } else links();
    var share = $("[data-share]", box);
    if (share) share.addEventListener("click", function () {
      var url = location.origin + location.pathname + "?lote=" + encodeURIComponent(l.id) + "#lotes";
      var text = "Mira este lote en Santa Clara: " + nombreLote(l);
      if (navigator.share) navigator.share({ title: "Santa Clara · " + l.id, text: text, url: url }).catch(function () {});
      else if (navigator.clipboard) navigator.clipboard.writeText(url).then(function () { share.textContent = "Enlace copiado"; setTimeout(function () { share.textContent = "Compartir este lote"; }, 2200); });
    });
  }

  /* ------------------------------------------------------------------ amenidades → plano */
  function amenidades() {
    $$("[data-poi]").forEach(function (b) {
      b.addEventListener("click", function () {
        var p = poiPos(b.dataset.poi); if (!p) return;
        $("#lotes").scrollIntoView({ behavior: "smooth" });
        setTimeout(function () { focusBox({ x: p.x - 60, y: p.y - 60, w: 120, h: 120 }, b.dataset.poi === "CIÉNAGA" ? 700 : 420); }, 450);
      });
    });
  }
})();
