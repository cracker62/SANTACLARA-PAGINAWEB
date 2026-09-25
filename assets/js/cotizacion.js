/*
 * COTIZACIÓN EN PDF · Santa Clara
 * Arma la hoja de cotización de un lote con los datos reales del inventario y la imprime
 * (el navegador la guarda como PDF). Nada se inventa: todo sale de data/santa-clara.js,
 * del inventario en vivo y de las condiciones de data/config.js.
 * Se abre como cotizacion.html?lote=G-12&pct=20&meses=24&nombre=...&wa=...
 * Con ?lotes=G-12,G-13 la arma assets/js/cotizacion-varios.js (una hoja por lote + hoja unificada),
 * que carga esta misma página con &embebido=1 para cada lote y le pide su imagen con MO_cotizacion.lienzo().
 */
(function () {
  var SC = window.SANTA_CLARA, CFG = window.MO_CONFIG, F = CFG.financiacion;
  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };
  var nf = new Intl.NumberFormat("es-CO");
  var fmtPct = function (n) { return String(n).replace(".", ","); };
  var CR = String.fromCharCode(10);
  var NS = "http://www.w3.org/2000/svg";

  var q = new URLSearchParams(location.search);
  if (q.get("lotes")) return;   // varios lotes: lo maneja cotizacion-varios.js
  if (q.get("embebido") === "1") document.documentElement.classList.add("embebido");
  var id = (q.get("lote") || "").toUpperCase().trim();
  var lote = (SC && SC.lots || []).filter(function (l) { return l.id === id; })[0];

  if (!lote) { $("[data-error]").hidden = false; $("[data-barra]").hidden = true; return; }
  $("[data-hoja]").hidden = false;

  var modo = (q.get("modo") || "").toLowerCase() === "contado" ? "contado" : "financiado";
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
    var p = new URLSearchParams(modo === "contado" ? { lote: lote.id, modo: "contado" } : { lote: lote.id, pct: pct, meses: meses });
    if (inNombre.value.trim()) p.set("nombre", inNombre.value.trim());
    if (inWa.value.trim()) p.set("wa", inWa.value.trim());
    history.replaceState(null, "", "?" + p.toString());
  }

  /* ---------- datos fijos del lote ---------- */
  var fecha = new Date().toLocaleDateString("es-CO", { day: "2-digit", month: "long", year: "numeric" });
  $("[data-fecha]").textContent = fecha;
  // Vigencia: la cotización vale 15 días (config: financiacion.vigencia_cotizacion_dias)
  var diasVigencia = F.vigencia_cotizacion_dias || 15;
  var vence = new Date(); vence.setDate(vence.getDate() + diasVigencia);
  var venceTxt = vence.toLocaleDateString("es-CO", { day: "2-digit", month: "long", year: "numeric" });
  var vigencia = "Válida por " + diasVigencia + " días, hasta el " + venceTxt + ".";
  $("[data-vigencia]").textContent = "Válida hasta el " + venceTxt;
  $("[data-d-etapa]").textContent = lote.etapa;
  $("[data-d-mz]").textContent = lote.mz;
  $("[data-d-lote]").textContent = lote.n;
  $("[data-d-area]").textContent = nf.format(lote.area) + " m²";
  // Frente y fondo según el plano del arquitecto (lotes irregulares: la medida de cada lado)
  if (lote.frente) {
    $("[data-d-medidas-caja]").hidden = false;
    if (lote.lados) {
      $("[data-d-medidas-t]").textContent = "Medidas (irregular)";
      $("[data-d-medidas]").textContent = lote.lados.map(function (v) { return nf.format(v); }).join(" · ") + " m";
    } else {
      $("[data-d-medidas]").textContent = nf.format(lote.frente) + " × " + nf.format(lote.fondo) + " m";
    }
  }
  $("[data-d-vm2]").textContent = lote.vm2 ? MO.pesos(lote.vm2) : "—";
  $("[data-d-ubic]").textContent = lote.ubic || "—";
  $("[data-d-mat]").textContent = (lote.mat || "En trámite").replace(/-/g, "‑");
  $("[data-d-precio]").textContent = MO.pesos(lote.precio);
  $("[data-pie-wa]").textContent = CFG.whatsapp.visible;
  $("[data-pie-web]").textContent = location.host || "santaclara";

  if (F.reservation_amount) $("[data-p-sep]").textContent = MO.pesos(F.reservation_amount);
  else $("[data-p-sep-caja]").hidden = true;

  /* ---------- plan de pago, se recalcula al cambiar los controles ---------- */
  function pintarPago() {
    if (modo === "contado") return pintarContado();
    $("[data-hoja]").classList.remove("es-contado");
    var proy = MO.proyeccion(lote.precio, pct, meses);
    $("[data-p-pct]").textContent = pct + "%";
    $("[data-p-ini]").textContent = MO.pesos(proy.inicial);
    $("[data-p-saldo-pct]").textContent = (100 - pct) + "%";
    $("[data-p-saldo]").textContent = MO.pesos(proy.saldo);
    $("[data-p-meses]").textContent = proy.meses;
    $("[data-p-cuota]").textContent = MO.pesos(proy.cuota);
    $("[data-p-total]").textContent = MO.pesos(lote.precio);
    $("[data-p-ultima]").textContent = MO.pesos(proy.ultima);
    $("[data-p-ultima-mes]").textContent = proy.meses;
    $("[data-p-rango]").textContent = "Las cuotas son cifras cerradas y la última ajusta el cierre exacto del pago. " +
      "Para un lote de " + nf.format(lote.area) + " m² el plazo de referencia va de " + regla.min_months + " a " +
      regla.max_months + " meses y se acuerda con tu asesor.";

    pintarCuotas(proy);

    var estado = lote.estado === "disponible" ? "" :
      " Este lote aparece hoy como " + (lote.estado === "reservado" ? "reservado por otro cliente" : lote.estado === "vendido" ? "vendido" : "no disponible") + ": confirma con tu asesor antes de avanzar.";
    $("[data-aviso]").textContent = "*Proyección con cuota inicial del " + pct + "% y saldo a " + proy.meses +
      " cuotas mensuales sin intereses, redondeadas a cifras cerradas; la última cuota ajusta el total. " + F.aviso + estado + " Cotización generada el " + fecha + ". " + vigencia;
  }

  /* Pago de contado: valor de lista, descuento, valor de contado, separación y saldo */
  function pintarContado() {
    var c = MO.contado(lote.precio);
    $("[data-hoja]").classList.add("es-contado");
    $("[data-p-titulo]").textContent = "Pago de contado";
    $("[data-cuota-et]").textContent = "Valor de contado";
    $("[data-p-cuota]").textContent = MO.pesos(c.total);
    $("[data-cuota-nota]").textContent = c.pct ? fmtPct(c.pct) + "% de descuento sobre el valor de lista" : "Pago único";
    $("[data-pago-filas]").innerHTML =
      "<li><span>Valor de lista</span><b>" + MO.pesos(c.lista) + "</b></li>" +
      (c.pct ? "<li><span>Descuento por pago de contado</span><b>− " + MO.pesos(c.descuento) + "</b></li>" : "") +
      (c.separacion ? "<li><span>Separación para apartarlo</span><b>" + MO.pesos(c.separacion) + "</b></li>" : "") +
      (c.separacion ? "<li><span>Saldo" + (c.dias ? " · hasta " + c.dias + " días" : "") + "</span><b>" + MO.pesos(c.saldo) + "</b></li>" : "") +
      '<li class="tot"><span>Total a pagar</span><b>' + MO.pesos(c.total) + "</b></li>";
    $("[data-p-rango]").textContent = c.dias
      ? "Separas el lote y tienes hasta " + c.dias + " días para pagar el saldo. El descuento aplica pagando de contado."
      : "El descuento aplica pagando de contado.";
    $("[data-aviso]").textContent = "*Pago de contado con " + (c.pct ? fmtPct(c.pct) + "% de descuento sobre el valor de lista. " : "") +
      F.aviso + (lote.estado === "disponible" ? "" : " Este lote aparece hoy como " + (lote.estado === "reservado" ? "reservado por otro cliente" : "vendido") + ": confirma con tu asesor.") +
      " Cotización generada el " + fecha + ". " + vigencia;
  }

  /* Plan de pagos en columnas: mes 1 arriba, sigue hacia abajo y pasa a la columna de la derecha */
  function pintarCuotas(proy) {
    var filas = [{ et: "Inicial", v: proy.inicial, ini: true }].concat(proy.filas.map(function (f) {
      return { et: "Mes " + f.mes, v: f.cuota };
    }));
    var cols = filas.length > 22 ? 3 : 2;
    var porCol = Math.ceil(filas.length / cols), html = "";
    for (var c = 0; c < cols; c++) {
      var trozo = filas.slice(c * porCol, (c + 1) * porCol);
      if (!trozo.length) continue;
      html += "<table><thead><tr><th>Cuota</th><th>Valor</th></tr></thead><tbody>" +
        trozo.map(function (f) { return '<tr' + (f.ini ? ' class="ini"' : "") + "><td>" + f.et + "</td><td>" + MO.pesos(f.v) + "</td></tr>"; }).join("") +
        "</tbody></table>";
    }
    $("[data-cuotas]").innerHTML = html;
    $("[data-cuotas]").style.gridTemplateColumns = "repeat(" + cols + ",minmax(0,1fr))";
  }

  function pintarCliente() {
    var n = inNombre.value.trim(), w = inWa.value.trim();
    $("[data-cliente]").hidden = !n && !w;
    $("[data-c-nombre]").textContent = n || "—";
    $("[data-c-wa-caja]").hidden = !w;
    $("[data-c-wa]").textContent = w;
  }

  /* Cambiar entre financiado y contado desde la misma hoja */
  var selModo = $("#c-modo");
  function verControles() {
    $$("[data-solo-fin]").forEach(function (el) { el.hidden = modo === "contado"; });
  }
  selModo.value = modo; verControles();
  selModo.addEventListener("change", function () { modo = selModo.value; verControles(); pintarPago(); guardarUrl(); });
  selPct.addEventListener("change", function () { pct = +selPct.value; pintarPago(); guardarUrl(); });
  selMeses.addEventListener("change", function () { meses = +selMeses.value; pintarPago(); guardarUrl(); });
  [inNombre, inWa].forEach(function (el) { el.addEventListener("input", function () { pintarCliente(); guardarUrl(); }); });
  $("#c-pdf").addEventListener("click", function () {
    if (window.dataLayer) window.dataLayer.push({ event: "cotizacion_pdf", lote: lote.id, meses: meses, inicial: pct });
    window.print();
  });

  /* ---------- enviar la cotización en PDF por WhatsApp ----------
     Se arma el PDF en el navegador y se comparte: en el celular, el propio WhatsApp del cliente
     manda el archivo al asesor; en el computador se descarga y se abre el chat para adjuntarlo. */
  var errBox = $("#c-err");
  function fallo(m, campo) { errBox.hidden = false; errBox.textContent = m; if (campo) campo.focus(); }

  function mensajeAsesor() {
    var n = inNombre.value.trim(), w = inWa.value.trim();
    var t = "Hola, soy " + n + " y quiero el lote " + lote.id + " de Santa Clara – Poblado Campestre (Mz. " + lote.mz + " · Lote " + lote.n + ")." + CR + CR +
      "Mi WhatsApp: " + w + CR + "Área: " + nf.format(lote.area) + " m²" + (lote.frente && !lote.lados ? " · Frente " + nf.format(lote.frente) + " m × Fondo " + nf.format(lote.fondo) + " m" : "") + (lote.ubic ? " · " + lote.ubic : "") + CR +
      "Valor del lote: " + MO.pesos(lote.precio) + CR;
    if (modo === "contado") {
      var c = MO.contado(lote.precio);
      t += "Forma de pago: DE CONTADO" + CR + (c.pct ? "Descuento " + fmtPct(c.pct) + "%: − " + MO.pesos(c.descuento) + CR : "") +
        "Valor de contado: " + MO.pesos(c.total) + CR + (c.separacion ? "Separación: " + MO.pesos(c.separacion) + CR : "");
    } else {
      var proy = MO.proyeccion(lote.precio, pct, meses);
      t += "Forma de pago: FINANCIADO" + CR + "Cuota inicial " + pct + "%: " + MO.pesos(proy.inicial) + CR +
        "Cuota mensual: " + MO.pesos(proy.cuota) + " × " + proy.meses + " meses (última " + MO.pesos(proy.ultima) + ")" + CR;
    }
    return t + CR + "Adjunto mi cotización en PDF. Quiero confirmar disponibilidad y los pasos para separarlo.";
  }

  /* El plano es un SVG con el terreno pintado: se convierte a imagen para que salga igual en el PDF */
  function planoComoImagen() {
    var svg = $("[data-plano] svg");
    if (!svg) return Promise.resolve(null);
    var caja = svg.getBoundingClientRect();
    var clon = svg.cloneNode(true);
    var img = clon.querySelector("image");
    var href = img && (img.getAttribute("href") || img.getAttribute("xlink:href"));
    var paso = !href || href.indexOf("blob:") !== 0 ? Promise.resolve(href) : fetch(href).then(function (r) { return r.blob(); }).then(function (b) {
      return new Promise(function (res) { var fr = new FileReader(); fr.onload = function () { res(fr.result); }; fr.readAsDataURL(b); });
    });
    return paso.then(function (data) {
      if (img && data) { img.setAttribute("href", data); img.removeAttribute("xlink:href"); }
      var an = Math.round(caja.width * 2), al = Math.round(caja.height * 2);
      clon.setAttribute("width", an); clon.setAttribute("height", al);
      var xml = new XMLSerializer().serializeToString(clon);
      return new Promise(function (res, rej) {
        var im = new Image();
        im.onload = function () {
          var c = document.createElement("canvas"); c.width = an; c.height = al;
          c.getContext("2d").drawImage(im, 0, 0, an, al);
          res({ url: c.toDataURL("image/jpeg", 0.88), alto: caja.height });
        };
        im.onerror = rej;
        im.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(xml);
      });
    }).catch(function () { return null; });
  }

  /* La hoja como imagen (lienzo), siempre con el diseño de computador. La usa el PDF de un lote
     y también la cotización de varios lotes, que la pide a cada hoja embebida. */
  function armarLienzo() {
    if (!window.html2canvas) return Promise.reject(new Error("sin librerías"));
    var hoja = $("[data-hoja]"), cajaPlano = $("[data-plano]"), svg = $("[data-plano] svg"), sustituto = null;
    return planoComoImagen().then(function (p) {
      if (p && svg) {
        sustituto = document.createElement("img");
        sustituto.src = p.url; sustituto.style.cssText = "display:block;width:100%;height:" + p.alto + "px;object-fit:cover";
        cajaPlano.replaceChild(sustituto, svg);
      }
      // Siempre con el diseño de computador (hoja de 920 px), aunque se genere desde el celular:
      // html2canvas copia la página en un marco de 1100 px de ancho, así aplican los estilos de computador
      return html2canvas(hoja, {
        scale: 2, backgroundColor: "#ffffff", useCORS: true, logging: false,
        windowWidth: 1100, windowHeight: 1500, width: 920,
        onclone: function (doc) {
          doc.documentElement.classList.add("para-pdf");
          var h = doc.querySelector("[data-hoja]");
          h.style.width = "920px"; h.style.maxWidth = "920px"; h.style.margin = "0"; h.style.boxShadow = "none";
          var cc = doc.querySelector("[data-cuotas]");
          if (cc) cc.style.gridTemplateColumns = "repeat(" + cc.children.length + ",minmax(0,1fr))";
          var im = doc.querySelector("[data-plano] img");
          if (im) { im.style.height = "auto"; im.style.aspectRatio = "16/6"; }
        }
      });
    }).then(function (lienzo) {
      if (sustituto && svg) cajaPlano.replaceChild(svg, sustituto);
      return lienzo;
    }).catch(function (e) {
      if (sustituto && svg && sustituto.parentNode) cajaPlano.replaceChild(svg, sustituto);
      throw e;
    });
  }
  window.MO_cotizacion = { lienzo: armarLienzo };

  function armarPDF() {
    if (!window.jspdf) return Promise.reject(new Error("sin librerías"));
    return armarLienzo().then(function (lienzo) {
      var pdf = new window.jspdf.jsPDF({ orientation: "p", unit: "pt", format: "a4" });
      var ancho = 595.28, alto = 841.89, margen = 18;
      var w = ancho - margen * 2, h = lienzo.height * w / lienzo.width;
      if (h > alto - margen * 2) { h = alto - margen * 2; w = lienzo.width * h / lienzo.height; }
      pdf.addImage(lienzo.toDataURL("image/jpeg", 0.92), "JPEG", (ancho - w) / 2, margen, w, h);
      return pdf.output("blob");
    });
  }

  function nombreArchivo() {
    return "Cotizacion " + lote.id + " - Santa Clara" + (inNombre.value.trim() ? " - " + inNombre.value.trim() : "") + ".pdf";
  }

  var enviando = false;
  $("#c-wa-enviar").addEventListener("click", function () {
    var boton = this;
    if (enviando) return;
    var n = inNombre.value.trim(), w = inWa.value.replace(/[^0-9+]/g, "");
    if (n.length < 3) return fallo("Escribe tu nombre y apellido.", inNombre);
    if (w.replace(/[^0-9]/g, "").length < 7) return fallo("Escribe tu número de WhatsApp.", inWa);
    errBox.hidden = true;
    enviando = true; boton.disabled = true;
    var textoOriginal = boton.textContent;
    boton.textContent = "Armando tu cotización…";
    var msg = mensajeAsesor();
    if (window.dataLayer) window.dataLayer.push({ event: "cotizacion_whatsapp", lote: lote.id, modo: modo });
    armarPDF().then(function (blob) {
      var archivo = new File([blob], nombreArchivo(), { type: "application/pdf" });
      if (navigator.canShare && navigator.canShare({ files: [archivo] })) {
        return navigator.share({ files: [archivo], text: msg, title: "Cotización " + lote.id + " · Santa Clara" });
      }
      // En computador: se descarga el PDF y se abre el chat del asesor para adjuntarlo
      var url = URL.createObjectURL(blob), a = document.createElement("a");
      a.href = url; a.download = archivo.name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
      window.open(MO.waLink(msg), "_blank", "noopener");
      errBox.hidden = false;
      errBox.textContent = "Se descargó tu cotización en PDF y se abrió WhatsApp: adjunta el archivo en el chat.";
    }).catch(function (e) {
      if (window.console) console.error("cotización: no se pudo armar el PDF", e);
      // Si el navegador no puede armar el PDF, al menos va el mensaje con el enlace
      window.open(MO.waLink(msg + CR + CR + "Cotización: " + location.href), "_blank", "noopener");
    }).then(function () {
      enviando = false; boton.disabled = false; boton.textContent = textoOriginal;
    });
  });

  /* ---------- plano con el mismo aspecto del explorador: pasto, árboles, lagos y el lote señalado ---------- */
  function plano() {
    var TR = window.MOTerreno, T = TR.T;
    var vb = SC.viewBox;
    // Vista acercada al lote (formato apaisado) para que el cliente lo reconozca en la hoja impresa
    var ANCHO = 1300, ALTO = 380;
    var vx = Math.max(vb[0] - 120, Math.min(lote.cx - ANCHO / 2, vb[0] + vb[2] + 120 - ANCHO));
    var vy = Math.max(vb[1] - 120, Math.min(lote.cy - ALTO / 2, vb[1] + vb[3] + 120 - ALTO));
    var svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", [vx, vy, ANCHO, ALTO].join(" "));
    svg.setAttribute("preserveAspectRatio", "xMidYMid slice");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", "Plano de Santa Clara con el lote " + lote.id + " señalado");

    var g = function (tag, attrs, padre) {
      var e = document.createElementNS(NS, tag);
      for (var k in attrs) e.setAttribute(k, attrs[k]);
      (padre || svg).appendChild(e);
      return e;
    };
    var texto = function (e, t) { e.textContent = t; return e; };

    // definiciones: agua y copas de árbol, iguales a las del plano del sitio
    var defs = g("defs", {});
    var agua = g("linearGradient", { id: "cot-agua", x1: 0, y1: 0, x2: 1, y2: 1 }, defs);
    g("stop", { offset: "0", "stop-color": "#5FA8C9" }, agua);
    g("stop", { offset: ".55", "stop-color": "#2F7FA8" }, agua);
    g("stop", { offset: "1", "stop-color": "#1E5F86" }, agua);
    var copa = g("radialGradient", { id: "cot-copa", cx: ".38", cy: ".35", r: ".7" }, defs);
    g("stop", { offset: "0", "stop-color": "#8DB658" }, copa);
    g("stop", { offset: ".6", "stop-color": "#4F7C31" }, copa);
    g("stop", { offset: "1", "stop-color": "#2E5120" }, copa);
    var arbol = g("symbol", { id: "cot-arbol", viewBox: "-12 -12 24 24" }, defs);
    g("ellipse", { cx: 3, cy: 3.5, rx: 9.5, ry: 8, fill: "#1E2D14", opacity: ".28" }, arbol);
    g("path", { d: "M0-10 6-8 10-3 9 4 4 9-3 9-8 5-10-1-7-7Z", fill: "url(#cot-copa)" }, arbol);

    var predio = SC.site.concat(SC.vias || []);
    var sitePolys = predio.map(TR.parsePts), waterPolys = SC.water.map(TR.parsePts);

    // 1) terreno pintado (pasto, cultivos, doble calzada y arboleda)
    var terreno = g("image", { x: T.x, y: T.y, width: T.w, height: T.h, preserveAspectRatio: "none" });
    TR.pintar(sitePolys, waterPolys, function (url) { terreno.setAttribute("href", url); });

    // 2) predio y zonas verdes del proyecto
    predio.forEach(function (pts) { g("polygon", { points: pts, fill: "#E6DCC3", stroke: "#C9B892", "stroke-width": 2 }); });
    var clip = g("clipPath", { id: "cot-predio" }, defs);
    predio.forEach(function (pts) { g("polygon", { points: pts }, clip); });
    var gVerde = g("g", { "clip-path": "url(#cot-predio)" });
    ["ECOPARQUE", "ZONA CONTEMPLACIÓN", "ZONA PICNIC", "ÁREA COMÚN", "LAGO 1", "LAGO 2"].forEach(function (n) {
      (SC.pois || []).filter(function (p) { return p.t === n; }).forEach(function (p) {
        g("path", { d: TR.blob(p.x, p.y, n.indexOf("LAGO") === 0 ? 78 : 62, n.length), fill: "#7FAA52", stroke: "#6C9744", "stroke-width": 1 }, gVerde);
      });
    });

    // 3) lagos con orilla
    SC.water.forEach(function (pts) {
      g("polygon", { points: pts, fill: "none", stroke: "#D8C9A0", "stroke-width": 9, "stroke-linejoin": "round" });
      g("polygon", { points: pts, fill: "url(#cot-agua)", stroke: "#1C5A7E", "stroke-width": 1.2 });
    });

    // 4) árboles de las zonas verdes internas
    var gArb = g("g", {}), semilla = 11;
    var rnd = function () { semilla = (semilla * 9301 + 49297) % 233280; return semilla / 233280; };
    ["ECOPARQUE", "ZONA CONTEMPLACIÓN", "ZONA PICNIC", "ÁREA COMÚN"].forEach(function (n) {
      (SC.pois || []).filter(function (p) { return p.t === n; }).forEach(function (p) {
        for (var i = 0; i < 16; i++) {
          var a = rnd() * 6.283, r = 10 + rnd() * 48, x = p.x + Math.cos(a) * r, y = p.y + Math.sin(a) * r * .75, s = 12 + rnd() * 12;
          if (!TR.inAny(x, y, waterPolys)) g("use", { href: "#cot-arbol", x: x - s / 2, y: y - s / 2, width: s, height: s }, gArb);
        }
      });
    });

    // 5) lotes y números, con los mismos colores del explorador
    var gLotes = g("g", {}), gNums = g("g", {});
    var enVista = function (l) { return l.cx > vx - 80 && l.cx < vx + ANCHO + 80 && l.cy > vy - 60 && l.cy < vy + ALTO + 60; };
    SC.lots.forEach(function (l) {
      if (!l.pts || l.id === lote.id) return;
      var relleno = l.estado === "disponible" ? "#C9E2A2" : l.estado === "proximamente" ? "#E7EADF" : "#E9B9A5";
      g("polygon", { points: l.pts, fill: relleno, stroke: "#FDFBF4", "stroke-width": 1.6 }, gLotes);
      if (enVista(l)) {
        texto(g("text", { x: l.cx, y: l.cy, "text-anchor": "middle", "dominant-baseline": "central", "font-size": 13,
          "font-weight": 800, fill: l.estado === "disponible" ? "#24401A" : "#7A3F2D", "paint-order": "stroke",
          stroke: "rgba(255,255,255,.85)", "stroke-width": 2.4, "stroke-linejoin": "round" }, gNums), l.n);
      }
    });

    // 6) insignias de manzana
    (SC.manzanas || []).forEach(function (m) {
      if (Math.abs(m.x - lote.cx) > ANCHO * .6 || Math.abs(m.y - lote.cy) > ALTO * .7) return;
      var b = g("g", {});
      g("circle", { cx: m.x, cy: m.y, r: 15, fill: "#fff", stroke: "#1B2A45", "stroke-width": 1.4 }, b);
      texto(g("text", { x: m.x, y: m.y, "text-anchor": "middle", "dominant-baseline": "central", "font-size": 13, "font-weight": 800, fill: "#1B2A45" }, b), m.mz);
    });

    // 7) el lote de la cotización, destacado
    g("circle", { cx: lote.cx, cy: lote.cy, r: 52, fill: "none", stroke: "#F4A62A", "stroke-width": 8, opacity: .9 });
    if (lote.pts) g("polygon", { points: lote.pts, fill: "#F4A62A", stroke: "#1B2A45", "stroke-width": 4 });
    texto(g("text", { x: lote.cx, y: lote.cy, "text-anchor": "middle", "dominant-baseline": "central", "font-size": 14, "font-weight": 800, fill: "#1B2A45" }), lote.n);

    // cartel "tu lote está aquí", volteado hacia el lado con más espacio
    var derecha = lote.cx < vx + ANCHO * .55;
    var ancho = 330, alto = 86, sep = 104;
    var x = derecha ? lote.cx + sep : lote.cx - sep - ancho;
    var y = Math.max(vy + 12, Math.min(lote.cy - alto / 2, vy + ALTO - alto - 12));
    g("line", { x1: lote.cx, y1: lote.cy, x2: derecha ? x : x + ancho, y2: y + alto / 2, stroke: "#1B2A45", "stroke-width": 4 });
    g("rect", { x: x, y: y, width: ancho, height: alto, rx: 6, fill: "#1B2A45", opacity: .96 });
    texto(g("text", { x: x + 18, y: y + 36, "font-size": 25, "font-weight": 700, fill: "#FFFFFF", "letter-spacing": 1.5 }), "TU LOTE ESTÁ AQUÍ");
    texto(g("text", { x: x + 18, y: y + 65, "font-size": 21, "font-weight": 600, fill: "#F4A62A" }),
      "Mz " + lote.mz + " · Lote " + lote.n + " · " + nf.format(lote.area) + " m²");

    $("[data-plano]").appendChild(svg);
  }

  pintarPago(); pintarCliente(); plano();
  document.title = "Cotización " + lote.id + " · Santa Clara · Poblado Campestre";
})();
