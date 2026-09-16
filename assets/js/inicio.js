/* Home Monte Olimpo: datos en vivo de Santa Clara, trayectoria, Google Maps, FAQ, escena de lotes y simulador por presupuesto */
document.addEventListener("DOMContentLoaded", function () {
  var CFG = MO.cfg, SC = window.SANTA_CLARA, F = CFG.financiacion;
  var nf = new Intl.NumberFormat("es-CO");
  var millones = function (v) { return "$" + (v / 1e6).toLocaleString("es-CO", { maximumFractionDigits: 1 }) + " M"; };
  document.documentElement.classList.add("js");

  /* ---- Datos en vivo desde el inventario ---- */
  var disp = [], cuotaMin = 0;
  if (SC) {
    disp = SC.lots.filter(function (l) { return l.estado === "disponible"; });
    var vendibles = SC.lots.filter(function (l) { return l.estado !== "tecnico"; });
    var areas = vendibles.map(function (l) { return l.area; });
    var precioMin = Math.min.apply(null, disp.map(function (l) { return l.precio; }));
    cuotaMin = Math.min.apply(null, disp.map(function (l) { return MO.cuotaLote(l, F.default_down_payment).cuota; }));
    var set = function (sel, v) { document.querySelectorAll(sel).forEach(function (el) { el.textContent = v; }); };
    set('[data-stat="disponibles"]', disp.length);
    set('[data-stat="desde"]', "$" + Math.round(precioMin / 1e6) + " M");
    set('[data-stat="areas"]', Math.min.apply(null, areas) + "–" + nf.format(Math.max.apply(null, areas)) + " m²");
    set('[data-lv="total"]', vendibles.length);
    set('[data-lv="disponibles"]', disp.length);
    set('[data-lv="desde"]', "$" + Math.round(precioMin / 1e6) + " M");
    set('[data-lv="cuota"]', millones(cuotaMin));
    set("[data-cuota-min]", millones(cuotaMin));
  }

  /* ---- Proyectos comercializados ---- */
  var grid = document.querySelector("[data-proyectos]");
  if (grid) {
    CFG.proyectos.comercializados.forEach(function (p, i) {
      var el = document.createElement("article");
      el.className = "proj reveal";
      el.style.transitionDelay = (i * .08) + "s";
      el.innerHTML =
        '<div class="proj__img">' + placeholder(i) + '<span class="pend">Espacio para render o fotografía</span></div>' +
        '<div class="proj__body">' +
          "<h3>" + p.nombre + "</h3>" +
          (p.ubicacion ? '<span class="proj__loc">' + p.ubicacion + "</span>" : "") +
          (p.nota ? '<span class="proj__note">' + p.nota + "</span>" : "") +
          '<span class="seal"><svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M2.5 6.2 5 8.5l4.5-5"/></svg>100% comercializado</span>' +
          (p.mapa ? '<a class="proj__map" href="' + p.mapa + '" target="_blank" rel="noopener">Ver ubicación en Google Maps</a>' : "") +
        "</div>";
      grid.appendChild(el);
    });
    if ("IntersectionObserver" in window && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      var cards = grid.querySelectorAll(".proj");
      cards.forEach(function (c) { c.classList.add("is-pending"); });
      var io = new IntersectionObserver(function (en) { en.forEach(function (e) { if (e.isIntersecting) { e.target.classList.remove("is-pending"); io.unobserve(e.target); } }); }, { threshold: .15 });
      cards.forEach(function (c) { io.observe(c); });
    }
  }
  function placeholder(seed) {
    var s = "", cx = 70 + seed * 37 % 60, cy = 40 + seed * 23 % 30;
    for (var i = 1; i <= 9; i++) {
      s += '<ellipse cx="' + cx + '%" cy="' + cy + '%" rx="' + (i * 26) + '" ry="' + (i * 16) + '" transform="rotate(' + (-8 + seed * 5) + ')" fill="none" stroke="#C9A052" stroke-opacity="' + (i % 3 === 0 ? .3 : .1) + '" stroke-width=".8"/>';
    }
    return '<svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" aria-hidden="true">' + s + "</svg>";
  }

  /* ---- Preguntas frecuentes ---- */
  MO.faq(document.querySelector('[data-faq="home"]'), true);

  /* ---- Simulador por presupuesto mensual: recomienda lotes disponibles ---- */
  var box = document.querySelector("[data-presupuesto]");
  if (box && disp.length) {
    var q = function (s) { return box.querySelector(s); };
    var input = q("[data-presu-input]"), range = q("[data-presu-range]"), pctBox = q("[data-presu-pct]");
    var st = { pct: F.default_down_payment, monto: 0 };
    var redondear = function (v, paso) { return Math.ceil(v / paso) * paso; };
    function limites() {
      var cuotas = disp.map(function (l) { return MO.cuotaLote(l, st.pct).cuota; });
      return { min: Math.min.apply(null, cuotas), max: redondear(Math.max.apply(null, cuotas), 100000) };
    }
    F.down_payment_options.forEach(function (p) {
      var b = document.createElement("button"); b.type = "button"; b.textContent = p + "%"; b.dataset.pct = p;
      b.setAttribute("aria-pressed", p === st.pct); pctBox.appendChild(b);
    });
    q("[data-aviso]").textContent = F.aviso + " Cuotas calculadas con el plazo máximo de referencia de cada lote.";

    function tarjeta(item, i) {
      var o = item.o, l = o.l;
      var msg = "Hola, quiero separar el lote " + l.id + " de Santa Clara.\n\nÁrea: " + nf.format(l.area) + " m²\nValor: " + MO.pesos(l.precio) +
        "\nCuota inicial " + st.pct + "%: " + MO.pesos(o.inicial) + "\nCuota mensual aproximada: " + MO.pesos(o.cuota) + " a " + o.meses + " meses\n\nMi presupuesto mensual es de " + MO.pesos(st.monto) + ".";
      return '<article class="reco" style="animation-delay:' + (i * .08) + 's">' +
        '<span class="reco__tag">' + item.etiqueta + "</span>" +
        '<div class="reco__top"><b class="reco__id">' + l.id + '</b><span class="reco__cuota">' + MO.pesos(o.cuota) + "<small>/mes</small></span></div>" +
        '<p class="reco__meta">' + nf.format(l.area) + " m² · " + l.ubic + " · Etapa " + l.etapa + "</p>" +
        '<dl class="reco__dl"><dt>Valor</dt><dd>' + millones(l.precio) + "</dd><dt>Inicial " + st.pct + "%</dt><dd>" + MO.pesos(o.inicial) + "</dd><dt>Plazo</dt><dd>" + o.meses + " meses</dd></dl>" +
        '<div class="reco__act"><a class="btn btn--sm btn--dark" href="../?lote=' + encodeURIComponent(l.id) + '#lotes">Ver en el plano</a>' +
        '<a class="btn btn--sm btn--wa" href="' + MO.waLink(msg) + '" target="_blank" rel="noopener">Separar</a></div></article>';
    }
    function render(desdeTexto) {
      var lim = limites();
      range.min = lim.min; range.max = lim.max; range.step = 10000;
      if (!st.monto) st.monto = redondear(lim.min * 1.3, 50000);
      if (!desdeTexto) input.value = nf.format(st.monto);
      range.value = Math.min(Math.max(st.monto, lim.min), lim.max);
      range.style.setProperty("--p", ((range.value - lim.min) / (lim.max - lim.min) * 100) + "%");
      q("[data-presu-min]").textContent = MO.pesos(lim.min);
      q("[data-presu-rmin]").textContent = millones(lim.min);
      q("[data-presu-rmax]").textContent = millones(lim.max);
      document.querySelectorAll("[data-cuota-min]").forEach(function (el) { el.textContent = millones(Math.min(lim.min, cuotaMin || lim.min)); });

      var r = MO.recomendar(st.monto, st.pct), res = q("[data-presu-res]"), cards = q("[data-presu-cards]");
      if (!r.total) {
        res.innerHTML = "Con <b>" + MO.pesos(st.monto) + "</b> al mes aún no alcanzas ningún lote. La cuota más baja hoy es <b>" + MO.pesos(r.minimo.cuota) + "</b>: el lote <b>" + r.minimo.l.id + "</b>. Prueba subiendo tu cuota inicial o habla con un asesor.";
        cards.innerHTML = tarjeta({ o: r.minimo, etiqueta: "La opción más cercana" }, 0);
      } else {
        res.innerHTML = "Con <b>" + MO.pesos(st.monto) + "</b> al mes puedes elegir entre <b>" + r.total + " lotes</b>. Te recomendamos:";
        cards.innerHTML = r.opciones.map(tarjeta).join("");
      }
    }
    input.addEventListener("input", function () {
      var v = +input.value.replace(/[^\d]/g, "");
      st.monto = v; input.value = v ? nf.format(v) : "";
      render(true);
    });
    range.addEventListener("input", function () { st.monto = +range.value; render(); });
    pctBox.addEventListener("click", function (e) {
      var b = e.target.closest("button"); if (!b) return;
      pctBox.querySelectorAll("button").forEach(function (x) { x.setAttribute("aria-pressed", x === b); });
      st.pct = +b.dataset.pct; render();
    });
    render();
  }

  /* ---- Barra fija mobile ---- */
  var dock = document.querySelector("[data-dock]"), hero = document.querySelector(".hero");
  if (dock && hero && "IntersectionObserver" in window) {
    new IntersectionObserver(function (e) { dock.classList.toggle("is-on", !e[0].isIntersecting); }).observe(hero);
  }
});
