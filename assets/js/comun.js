/* Utilidades compartidas: formato, WhatsApp, financiación, curvas de nivel, navegación */
(function () {
  var CFG = window.MO_CONFIG;

  var fmt = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
  function pesos(v) { return "$" + fmt.format(Math.round(v)); }
  function m2(v) { return fmt.format(v) + " m²"; }

  function waLink(texto) {
    return "https://wa.me/" + CFG.whatsapp.numero + "?text=" + encodeURIComponent(texto);
  }

  function reglaPlazo(area) {
    var rules = CFG.financiacion.financing_rules;
    for (var i = 0; i < rules.length; i++) {
      if (rules[i].hasta_m2 === null || area <= rules[i].hasta_m2) return rules[i];
    }
    return rules[rules.length - 1];
  }

  /* valor_lote × % inicial; saldo / meses. Sin intereses. La última cuota absorbe el redondeo. */
  function proyeccion(valor, pctInicial, meses) {
    var inicial = Math.round(valor * pctInicial / 100);
    var saldo = valor - inicial;
    var cuota = Math.round(saldo / meses);
    var filas = [], pendiente = saldo;
    for (var m = 1; m <= meses; m++) {
      var c = m === meses ? pendiente : cuota;
      pendiente -= c;
      filas.push({ mes: m, cuota: c, saldo: pendiente });
    }
    return { valor: valor, inicial: inicial, saldo: saldo, cuota: cuota, meses: meses, filas: filas };
  }

  /* Cuota de un lote con el plazo máximo de referencia para su área */
  function cuotaLote(l, pct) {
    var r = reglaPlazo(l.area);
    return { cuota: Math.round((l.precio - l.precio * pct / 100) / r.max_months), meses: r.max_months, inicial: Math.round(l.precio * pct / 100) };
  }

  /* Recomienda lotes disponibles para un presupuesto mensual.
     Devuelve hasta 3 opciones distintas: la de más área, la mejor ubicación y la más económica. */
  function recomendar(presupuesto, pct) {
    var disp = (window.SANTA_CLARA ? window.SANTA_CLARA.lots : []).filter(function (l) { return l.estado === "disponible"; });
    var conCuota = disp.map(function (l) { var c = cuotaLote(l, pct); return { l: l, cuota: c.cuota, meses: c.meses, inicial: c.inicial }; });
    var minimo = conCuota.reduce(function (m, o) { return o.cuota < m.cuota ? o : m; }, conCuota[0]);
    var caben = conCuota.filter(function (o) { return o.cuota <= presupuesto; });
    var elegidas = [], usados = {};
    function tomar(o, etiqueta) { if (o && !usados[o.l.id]) { usados[o.l.id] = 1; elegidas.push({ o: o, etiqueta: etiqueta }); } }
    var premium = ["Vista Lago", "Lago", "Esquina"];
    tomar(caben.slice().sort(function (a, b) { return b.l.area - a.l.area || a.cuota - b.cuota; })[0], "Más área para tu presupuesto");
    tomar(caben.filter(function (o) { return premium.indexOf(o.l.ubic) !== -1; }).sort(function (a, b) { return premium.indexOf(a.l.ubic) - premium.indexOf(b.l.ubic) || b.l.area - a.l.area; })[0], "Mejor ubicación");
    tomar(caben.slice().sort(function (a, b) { return a.cuota - b.cuota || b.l.area - a.l.area; })[0], "La cuota más cómoda");
    caben.sort(function (a, b) { return b.cuota - a.cuota; }).some(function (o) { if (elegidas.length >= 3) return true; tomar(o, "Se ajusta a tu presupuesto"); });
    return { total: caben.length, opciones: elegidas, minimo: minimo, disponibles: disp.length };
  }

  /* Curvas de nivel animadas (firma gráfica de Monte Olimpo) */
  function curvas(canvas, opts) {
    if (!canvas || !canvas.getContext) return;
    opts = opts || {};
    var ctx = canvas.getContext("2d"), w, h, dpr = Math.min(window.devicePixelRatio || 1, 2);
    var color = opts.color || "201,160,82", fx = opts.cx || 0.78, fy = opts.cy || 0.42, rings = opts.rings || 18;
    var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    function size() {
      var r = canvas.getBoundingClientRect(); w = r.width; h = r.height;
      canvas.width = Math.max(1, w * dpr); canvas.height = Math.max(1, h * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    function n(x, y, t) { return Math.sin(x * 1.7 + t) * .35 + Math.sin(y * 2.3 - t * .8) * .3 + Math.sin((x + y) * 3.1 + t * .5) * .15; }
    function draw(t) {
      ctx.clearRect(0, 0, w, h);
      var cx = w * fx, cy = h * fy, base0 = Math.max(w, h) / rings * .62;
      for (var i = 1; i <= rings; i++) {
        ctx.beginPath();
        for (var a = 0; a <= Math.PI * 2 + .01; a += Math.PI / 72) {
          var ca = Math.cos(a), sa = Math.sin(a);
          var r = i * base0 * (1 + .13 * n(ca * 1.2, sa * 1.2, t + i * .12));
          var x = cx + ca * r * 1.25, y = cy + sa * r * .72;
          a === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.strokeStyle = "rgba(" + color + "," + (i % 5 === 0 ? (opts.strong || .5) : (opts.soft || .18)) + ")";
        ctx.lineWidth = i % 5 === 0 ? 1 : .7;
        ctx.stroke();
      }
    }
    size(); draw(0);
    window.addEventListener("resize", function () { size(); draw(0); });
    if (reduce) return;
    var visible = true, t0 = performance.now();
    if ("IntersectionObserver" in window) new IntersectionObserver(function (e) { visible = e[0].isIntersecting; }).observe(canvas);
    (function loop(now) { if (visible) draw((now - t0) / 9000); requestAnimationFrame(loop); })(t0);
  }

  function navegacion() {
    var header = document.querySelector("[data-header]");
    if (header) {
      var onScroll = function () { header.classList.toggle("is-scrolled", window.scrollY > 40); };
      onScroll(); window.addEventListener("scroll", onScroll, { passive: true });
    }
    var toggle = document.querySelector("[data-menu-toggle]"), menu = document.querySelector("[data-menu]");
    if (toggle && menu) {
      toggle.addEventListener("click", function () {
        var open = toggle.getAttribute("aria-expanded") !== "true";
        toggle.setAttribute("aria-expanded", open); document.body.classList.toggle("menu-open", open);
      });
      menu.addEventListener("click", function (e) {
        if (e.target.closest("a")) { toggle.setAttribute("aria-expanded", "false"); document.body.classList.remove("menu-open"); }
      });
    }
    // Enlaces de WhatsApp declarativos: <a data-wa="mensaje">
    document.querySelectorAll("[data-wa]").forEach(function (a) {
      a.href = waLink(a.getAttribute("data-wa")); a.target = "_blank"; a.rel = "noopener";
    });
    document.querySelectorAll("[data-wa-visible]").forEach(function (el) { el.textContent = CFG.whatsapp.visible; });
    document.querySelectorAll("[data-red]").forEach(function (a) {
      var r = CFG.redes[a.getAttribute("data-red")]; if (!r) return;
      a.href = r.url; a.target = "_blank"; a.rel = "noopener";
      var u = a.querySelector("[data-red-usuario]"); if (u) u.textContent = (a.getAttribute("data-red") === "youtube" ? "" : "@") + r.usuario;
    });
    document.querySelectorAll("[data-year]").forEach(function (el) { el.textContent = new Date().getFullYear(); });
    // Videos: cargar la versión vertical en pantallas angostas
    document.querySelectorAll("video[data-src-h]").forEach(function (v) {
      var vertical = window.matchMedia("(max-width: 700px)").matches;
      v.poster = vertical ? v.dataset.posterV : v.dataset.posterH;
      v.src = vertical ? v.dataset.srcV : v.dataset.srcH;
      if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) { var p = v.play(); if (p && p.catch) p.catch(function () {}); }
    });
  }

  /* Preguntas frecuentes: pinta window.MO_FAQ en un contenedor. Reemplaza {PLAZOS}, {AREAS} e {INICIAL}. */
  function faq(el, soloHome) {
    if (!el || !window.MO_FAQ) return;
    var F = CFG.financiacion, prev = 0, nf = new Intl.NumberFormat("es-CO");
    var plazos = F.financing_rules.map(function (r) {
      var t = r.hasta_m2 === null ? "desde " + nf.format(prev + 1) + " m², " : (prev ? "de " + nf.format(prev + 1) + " a " : "hasta ") + nf.format(r.hasta_m2) + " m², ";
      prev = r.hasta_m2 || prev;
      return t + r.min_months + " a " + r.max_months + " meses";
    }).join("; ");
    var areas = "";
    if (window.SANTA_CLARA) {
      var a = window.SANTA_CLARA.lots.filter(function (l) { return l.area && l.estado !== "tecnico"; }).map(function (l) { return l.area; });
      areas = nf.format(Math.min.apply(null, a)) + " a " + nf.format(Math.max.apply(null, a)) + " m²";
    }
    el.innerHTML = window.MO_FAQ.filter(function (f) { return !soloHome || f.home; }).map(function (f) {
      var r = f.r.replace("{PLAZOS}", plazos).replace("{AREAS}", areas).replace("{INICIAL}", F.default_down_payment);
      return '<details class="faq__item"><summary>' + f.p + "</summary><p>" + r + "</p></details>";
    }).join("");
  }

  window.MO = { pesos: pesos, m2: m2, waLink: waLink, reglaPlazo: reglaPlazo, proyeccion: proyeccion, cuotaLote: cuotaLote, recomendar: recomendar, curvas: curvas, faq: faq, cfg: CFG };
  document.addEventListener("DOMContentLoaded", navegacion);
})();
