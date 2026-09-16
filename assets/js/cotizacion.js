/*
 * COTIZACIÓN EN PDF · Santa Clara
 * Arma la hoja de cotización de un lote con los datos reales del inventario y la imprime
 * (el navegador la guarda como PDF). Nada se inventa: todo sale de data/santa-clara.js,
 * del inventario en vivo y de las condiciones de data/config.js.
 * Se abre como cotizacion.html?lote=G-12&pct=20&meses=24&nombre=...&wa=...
 */
(function () {
  var SC = window.SANTA_CLARA, CFG = window.MO_CONFIG, F = CFG.financiacion;
  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };
  var nf = new Intl.NumberFormat("es-CO");
  var NS = "http://www.w3.org/2000/svg";

  var q = new URLSearchParams(location.search);
  var id = (q.get("lote") || "").toUpperCase().trim();
  var lote = (SC && SC.lots || []).filter(function (l) { return l.id === id; })[0];

  if (!lote) { $("[data-error]").hidden = false; $("[data-barra]").hidden = true; return; }
  $("[data-hoja]").hidden = false;

  var regla = MO.reglaPlazo(lote.area);
  var pct = +q.get("pct");
  if (F.down_payment_options.indexOf(pct) === -1) pct = F.default_down_payment;
  var meses = +q.get("meses");
  if (!(meses >= regla.min_months && meses <= regla.max_months)) meses = regla.max_months;

  /* ---------- controles ---------- */
  var selPct = $("#c-pct"), selMeses = $("#c-meses"), inNombre = $("#c-nombre"), inWa = $("#c-wa");
  F.down_payment_options.forEach(function (p) {
    var o = document.createElement("option"); o.value = p; o.textContent = p + "%"; selPct.appendChild(o);
  });
  for (var m = regla.min_months; m <= regla.max_months; m++) {
    var o = document.createElement("option"); o.value = m; o.textContent = m + " meses"; selMeses.appendChild(o);
  }
  selPct.value = pct; selMeses.value = meses;
  inNombre.value = q.get("nombre") || "";
  inWa.value = q.get("wa") || "";

  function guardarUrl() {
    var p = new URLSearchParams({ lote: lote.id, pct: pct, meses: meses });
    if (inNombre.value.trim()) p.set("nombre", inNombre.value.trim());
    if (inWa.value.trim()) p.set("wa", inWa.value.trim());
    history.replaceState(null, "", "?" + p.toString());
  }

  /* ---------- datos fijos del lote ---------- */
  var fecha = new Date().toLocaleDateString("es-CO", { day: "2-digit", month: "long", year: "numeric" });
  $("[data-fecha]").textContent = fecha;
  $("[data-d-etapa]").textContent = lote.etapa;
  $("[data-d-mz]").textContent = lote.mz;
  $("[data-d-lote]").textContent = lote.n;
  $("[data-d-area]").textContent = nf.format(lote.area) + " m²";
  $("[data-d-vm2]").textContent = lote.vm2 ? MO.pesos(lote.vm2) : "—";
  $("[data-d-ubic]").textContent = lote.ubic || "—";
  $("[data-d-mat]").textContent = lote.mat || "En trámite";
  $("[data-d-precio]").textContent = MO.pesos(lote.precio);
  $("[data-pie-wa]").textContent = CFG.whatsapp.visible;
  $("[data-pie-web]").textContent = location.host || "santaclara";

  if (F.reservation_amount) $("[data-p-sep]").textContent = MO.pesos(F.reservation_amount);
  else $("[data-p-sep-caja]").hidden = true;

  /* ---------- plan de pago, se recalcula al cambiar los controles ---------- */
  function pintarPago() {
    var proy = MO.proyeccion(lote.precio, pct, meses);
    $("[data-p-pct]").textContent = pct + "%";
    $("[data-p-ini]").textContent = MO.pesos(proy.inicial);
    $("[data-p-saldo-pct]").textContent = (100 - pct) + "%";
    $("[data-p-saldo]").textContent = MO.pesos(proy.saldo);
    $("[data-p-meses]").textContent = meses;
    $("[data-p-cuota]").textContent = MO.pesos(proy.cuota);
    $("[data-p-rango]").textContent = "Para un lote de " + nf.format(lote.area) + " m² el plazo de referencia va de " +
      regla.min_months + " a " + regla.max_months + " meses y se acuerda con tu asesor.";

    var celdas = proy.filas.map(function (f) {
      return "<div><span>Mes " + f.mes + "</span><b>" + MO.pesos(f.cuota) + "</b></div>";
    }).join("");
    $("[data-cuotas]").innerHTML = '<div><span>Inicial</span><b>' + MO.pesos(proy.inicial) + "</b></div>" + celdas;

    var estado = lote.estado === "disponible" ? "" :
      " Este lote aparece hoy como " + (lote.estado === "reservado" ? "reservado por otro cliente" : lote.estado === "vendido" ? "vendido" : "no disponible") + ": confirma con tu asesor antes de avanzar.";
    $("[data-aviso]").textContent = "*Proyección con cuota inicial del " + pct + "% y saldo a " + meses +
      " cuotas mensuales sin intereses" + (F.reservation_amount ? ", más la separación de " + MO.pesos(F.reservation_amount) : "") +
      ". " + F.aviso + estado + " Cotización generada el " + fecha + ".";
  }

  function pintarCliente() {
    var n = inNombre.value.trim(), w = inWa.value.trim();
    $("[data-cliente]").hidden = !n && !w;
    $("[data-c-nombre]").textContent = n || "—";
    $("[data-c-wa-caja]").hidden = !w;
    $("[data-c-wa]").textContent = w;
  }

  selPct.addEventListener("change", function () { pct = +selPct.value; pintarPago(); guardarUrl(); });
  selMeses.addEventListener("change", function () { meses = +selMeses.value; pintarPago(); guardarUrl(); });
  [inNombre, inWa].forEach(function (el) { el.addEventListener("input", function () { pintarCliente(); guardarUrl(); }); });
  $("#c-pdf").addEventListener("click", function () {
    if (window.dataLayer) window.dataLayer.push({ event: "cotizacion_pdf", lote: lote.id, meses: meses, inicial: pct });
    window.print();
  });

  /* ---------- mini plano con el lote señalado ---------- */
  function plano() {
    var vb = SC.viewBox;
    // Vista acercada al lote (formato apaisado) para que el cliente lo reconozca en la hoja impresa
    var ANCHO = 1300, ALTO = 380;
    var vx = Math.max(vb[0], Math.min(lote.cx - ANCHO / 2, vb[0] + vb[2] - ANCHO));
    var vy = Math.max(vb[1], Math.min(lote.cy - ALTO / 2, vb[1] + vb[3] - ALTO));
    var svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", [vx, vy, ANCHO, ALTO].join(" "));
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", "Plano de Santa Clara con el lote " + lote.id + " señalado");

    var g = function (tag, attrs, padre) {
      var e = document.createElementNS(NS, tag);
      for (var k in attrs) e.setAttribute(k, attrs[k]);
      (padre || svg).appendChild(e);
      return e;
    };

    g("rect", { x: vb[0], y: vb[1], width: vb[2], height: vb[3], fill: "#DCE5CB" });
    g("polygon", { points: SC.site, fill: "#F4EEE1", stroke: "#CFC4A8", "stroke-width": 3 });
    (SC.water || []).forEach(function (w) { g("polygon", { points: w, fill: "#A8CFE6", stroke: "#6FA5CB", "stroke-width": 2 }); });

    var capa = g("g", {});
    SC.lots.forEach(function (l) {
      if (!l.pts || l.id === lote.id) return;
      g("polygon", { points: l.pts, fill: l.estado === "disponible" ? "#C9E2A2" : "#E3E0D4", stroke: "#FDFBF4", "stroke-width": 1.2 }, capa);
    });
    (SC.manzanas || []).forEach(function (mz) {
      var t = g("text", { x: mz.x, y: mz.y, class: "mz-eti", "text-anchor": "middle" });
      t.textContent = mz.mz;
    });

    // el lote de la cotización
    if (lote.pts) g("polygon", { points: lote.pts, fill: "#F4A62A", stroke: "#1B2A45", "stroke-width": 4 });
    g("circle", { cx: lote.cx, cy: lote.cy, r: 46, fill: "none", stroke: "#F4A62A", "stroke-width": 7, opacity: .85 });

    // cartel "tu lote está aquí", volteado hacia el lado con más espacio
    var derecha = lote.cx < vx + ANCHO * .55;
    var ancho = 330, alto = 86, sep = 62;
    var x = derecha ? lote.cx + sep : lote.cx - sep - ancho;
    var y = Math.max(vy + 10, Math.min(lote.cy - alto / 2, vy + ALTO - alto - 10));
    g("line", { x1: lote.cx, y1: lote.cy, x2: derecha ? x : x + ancho, y2: y + alto / 2, stroke: "#1B2A45", "stroke-width": 4 });
    g("rect", { x: x, y: y, width: ancho, height: alto, rx: 6, fill: "#1B2A45" });
    var t1 = g("text", { x: x + 18, y: y + 36, class: "pin-cartel" });
    t1.textContent = "TU LOTE ESTÁ AQUÍ";
    var t2 = g("text", { x: x + 18, y: y + 65, class: "pin-sub" });
    t2.textContent = "Mz " + lote.mz + " · Lote " + lote.n + " · " + nf.format(lote.area) + " m²";
    // el texto del SVG no hereda el tamaño del CSS al imprimir: se fija aquí
    t1.setAttribute("font-size", "25"); t1.setAttribute("font-weight", "700"); t1.setAttribute("fill", "#FFFFFF"); t1.setAttribute("letter-spacing", "1.5");
    t2.setAttribute("font-size", "21"); t2.setAttribute("font-weight", "600"); t2.setAttribute("fill", "#F4A62A");
    $$(".mz-eti").forEach(function (e) { e.setAttribute("font-size", "30"); e.setAttribute("font-weight", "700"); e.setAttribute("fill", "rgba(27,42,69,.38)"); });

    $("[data-plano]").appendChild(svg);
  }

  pintarPago(); pintarCliente(); plano();
  document.title = "Cotización " + lote.id + " · Santa Clara · Poblado Campestre";
})();
