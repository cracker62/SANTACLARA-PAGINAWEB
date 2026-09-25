/*
 * COTIZACIÓN DE VARIOS LOTES · Santa Clara
 * cotizacion.html?lotes=G-12,G-13&modo=financiado&pct=20&nombre=...&wa=...
 * Arma una hoja unificada (todos los lotes, con sus valores y totales) y debajo una hoja por lote:
 * cada una es la cotización normal de ese lote (cotizacion.html?lote=X&embebido=1), con su plano
 * y su plan de pagos mes a mes según el plazo de su área. El PDF lleva la hoja unificada de primera
 * y después una página por lote. El mensaje al asesor dice que el cliente está interesado y quiere
 * que lo llamen (sin prometer descuentos ni beneficios).
 */
(function () {
  var q = new URLSearchParams(location.search);
  if (!q.get("lotes")) return;
  var SC = window.SANTA_CLARA, CFG = window.MO_CONFIG, F = CFG.financiacion;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var nf = new Intl.NumberFormat("es-CO");
  var fmtPct = function (n) { return String(n).replace(".", ","); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var CR = String.fromCharCode(10);

  var ids = [];
  q.get("lotes").split(",").forEach(function (x) { x = x.trim().toUpperCase(); if (x && ids.indexOf(x) < 0) ids.push(x); });
  var lotes = ids.map(function (id) { return (SC.lots || []).filter(function (l) { return l.id === id; })[0]; }).filter(Boolean);
  if (!lotes.length) { $("[data-error]").hidden = false; $("[data-barra]").hidden = true; return; }

  var caja = $("[data-varios]");
  caja.hidden = false;
  $(".barra__t").textContent = "Tu cotización de " + lotes.length + (lotes.length === 1 ? " lote" : " lotes") + " · completa tus datos y envíala al asesor";
  $("#c-wa-enviar").textContent = "Enviar mi cotización de " + lotes.length + (lotes.length === 1 ? " lote" : " lotes") + " por WhatsApp";
  $(".ayuda").innerHTML = "Tu PDF lleva una <b>hoja con todos tus lotes</b> y después <b>una hoja por cada lote</b>, con su ubicación y su plan de pagos. En el computador el PDF se descarga y lo adjuntas en el chat.";

  /* ---------- controles: forma de pago y cuota inicial (el plazo de cada lote depende de su área) ---------- */
  var selModo = $("#c-modo"), selPct = $("#c-pct"), inNombre = $("#c-nombre"), inWa = $("#c-wa"), errBox = $("#c-err");
  var labMeses = $("#c-meses").closest("label"); if (labMeses) labMeses.remove();
  F.down_payment_options.forEach(function (p) { var o = document.createElement("option"); o.value = p; o.textContent = p + "%"; selPct.appendChild(o); });
  var modo = (q.get("modo") || "") === "contado" ? "contado" : "financiado";
  var pct = +q.get("pct"); if (F.down_payment_options.indexOf(pct) < 0) pct = F.default_down_payment;
  selModo.value = modo; selPct.value = pct;
  inNombre.value = q.get("nombre") || ""; inWa.value = q.get("wa") || "";
  var verPct = function () { selPct.closest("label").hidden = modo === "contado"; };
  verPct();

  var hoy = new Date(), dias = F.vigencia_cotizacion_dias || 15, vence = new Date(); vence.setDate(vence.getDate() + dias);
  var fecha = hoy.toLocaleDateString("es-CO", { day: "2-digit", month: "long", year: "numeric" });
  var venceTxt = vence.toLocaleDateString("es-CO", { day: "2-digit", month: "long", year: "numeric" });

  function calculos() {
    return lotes.map(function (l) {
      var r = MO.reglaPlazo(l.area), p = MO.proyeccion(l.precio, pct, r.max_months), c = MO.contado(l.precio);
      return { l: l, p: p, c: c };
    });
  }

  /* ---------- hoja unificada ---------- */
  function hojaResumen() {
    var cs = calculos(), n = inNombre.value.trim(), w = inWa.value.trim();
    var total = 0, area = 0, ini = 0, cuota = 0, contado = 0;
    cs.forEach(function (x) { total += x.l.precio; area += x.l.area; ini += x.p.inicial; cuota += x.p.cuota; contado += x.c.total; });
    var fin = modo !== "contado";
    var filas = cs.map(function (x) {
      var l = x.l;
      return "<tr><td><b>" + esc(l.id) + "</b></td><td>Mz. " + esc(l.mz) + " · Lote " + esc(l.n) + "</td><td class=\"n\">" + nf.format(l.area) + " m²</td>" +
        "<td>" + (l.frente ? (l.lados ? "Irregular" : nf.format(l.frente) + " × " + nf.format(l.fondo) + " m") : "—") + "</td><td>" + esc(l.ubic || "—") + "</td>" +
        (fin ? "<td class=\"n\">" + MO.pesos(x.p.cuota) + " × " + x.p.meses + "</td>" : "<td class=\"n\">" + MO.pesos(x.c.total) + "</td>") +
        "<td class=\"n\"><b>" + MO.pesos(l.precio) + "</b></td></tr>";
    }).join("");
    return '<main class="hoja" data-resumen>' +
      '<header class="cab"><div class="cab__t"><span class="kicker">COTIZACIÓN COMERCIAL · ' + cs.length + (cs.length === 1 ? " LOTE" : " LOTES") + '</span><span class="fecha">' + fecha + '</span><span class="vigencia">Válida hasta el ' + venceTxt + '</span></div>' +
        '<img src="assets/img/santa-clara-logo.png" alt="Santa Clara · Poblado Campestre"></header>' +
      (n || w ? '<div class="cliente"><span><b>Cliente:</b> ' + esc(n || "—") + "</span>" + (w ? "<span><b>WhatsApp:</b> " + esc(w) + "</span>" : "") + "</div>" : "") +
      '<div class="cuerpo">' +
        '<h1 class="titulo">Cotización de ' + cs.length + (cs.length === 1 ? " lote" : " lotes") + "</h1>" +
        '<p class="subtitulo">Santa Clara · Poblado Campestre · Palmar de Varela, Atlántico</p>' +
        '<section class="caja"><h2>Tus lotes</h2><div class="caja__in resumen-caja"><table class="resumen-tabla"><thead><tr><th>Código</th><th>Ubicación en el plano</th><th class="n">Área</th><th>Frente × fondo</th><th>Zona</th>' +
          (fin ? '<th class="n">Cuota mensual</th>' : '<th class="n">De contado</th>') + '<th class="n">Valor</th></tr></thead><tbody>' + filas + "</tbody>" +
          '<tfoot><tr><td colspan="2">Total · ' + cs.length + (cs.length === 1 ? " lote" : " lotes") + '</td><td class="n">' + nf.format(area) + ' m²</td><td></td><td></td><td class="n">' + (fin ? MO.pesos(cuota) + "/mes" : MO.pesos(contado)) + '</td><td class="n"><b>' + MO.pesos(total) + "</b></td></tr></tfoot></table>" +
          '<div class="resumen-par">' +
            '<div><span>Valor total</span><b>' + MO.pesos(total) + "</b></div>" +
            (fin
              ? "<div><span>Cuota inicial " + pct + "% · total</span><b>" + MO.pesos(ini) + '</b></div><div class="verde"><span>Suma de cuotas mensuales</span><b>' + MO.pesos(cuota) + "</b></div>"
              : "<div><span>Descuento de contado " + fmtPct((F.contado && F.contado.descuento_pct) || 0) + "%</span><b>− " + MO.pesos(total - contado) + '</b></div><div class="verde"><span>Valor de contado</span><b>' + MO.pesos(contado) + "</b></div>") +
          "</div>" +
          '<p class="resumen-nota">' + (fin ? "Cuotas sin intereses; el plazo de cada lote va según su área (la cuota de cada uno aparece en su hoja). " : "Pago de contado: separas y pagas el saldo en el plazo acordado con tu asesor. ") +
            "En las páginas siguientes está la hoja de cada lote, con su ubicación en el plano y su plan de pagos mes a mes.</p>" +
        "</div></section>" +
      "</div>" +
      '<p class="aviso">*' + esc(F.aviso) + " Cotización generada el " + fecha + ". Válida por " + dias + " días, hasta el " + venceTxt + ".</p>" +
      '<div class="pie"><span><b>Santa Clara · Poblado Campestre</b> · Palmar de Varela, Atlántico</span><span>WhatsApp <b>' + esc(CFG.whatsapp.visible) + "</b> · <b>" + esc(location.host || "santaclara") + "</b></span></div>" +
    "</main>";
  }

  /* ---------- una hoja por lote (la cotización normal, embebida) ---------- */
  function urlLote(l) {
    var p = new URLSearchParams({ lote: l.id, embebido: "1" });
    if (modo === "contado") p.set("modo", "contado"); else { p.set("pct", pct); p.set("meses", MO.reglaPlazo(l.area).max_months); }
    if (inNombre.value.trim()) p.set("nombre", inNombre.value.trim());
    if (inWa.value.trim()) p.set("wa", inWa.value.trim());
    return "cotizacion.html?" + p.toString();
  }
  function ajustarAlto(f) {
    try { var d = f.contentDocument; if (d) f.style.height = (d.documentElement.scrollHeight + 4) + "px"; } catch (e) {}
  }
  function pintar(recargar) {
    var viejo = caja.querySelector("[data-resumen]");
    var nuevo = document.createElement("div"); nuevo.innerHTML = hojaResumen();
    if (viejo) viejo.replaceWith(nuevo.firstChild);
    else {
      caja.innerHTML = "";
      caja.appendChild(nuevo.firstChild);
      lotes.forEach(function (l, i) {
        var et = document.createElement("p"); et.className = "varios__et"; et.textContent = "Hoja " + (i + 2) + " · Lote " + l.id;
        var f = document.createElement("iframe"); f.className = "hoja-lote"; f.title = "Cotización del lote " + l.id; f.dataset.lote = l.id;
        f.addEventListener("load", function () { ajustarAlto(f); setTimeout(function () { ajustarAlto(f); }, 900); });
        caja.appendChild(et); caja.appendChild(f);
      });
      recargar = true;
    }
    if (recargar) caja.querySelectorAll("iframe[data-lote]").forEach(function (f) { f.src = urlLote(lotes.filter(function (l) { return l.id === f.dataset.lote; })[0]); });
    var p = new URLSearchParams({ lotes: lotes.map(function (l) { return l.id; }).join(",") });
    if (modo === "contado") p.set("modo", "contado"); else p.set("pct", pct);
    if (inNombre.value.trim()) p.set("nombre", inNombre.value.trim());
    if (inWa.value.trim()) p.set("wa", inWa.value.trim());
    history.replaceState(null, "", "?" + p.toString());
  }
  var espera;
  selModo.addEventListener("change", function () { modo = selModo.value; verPct(); pintar(true); });
  selPct.addEventListener("change", function () { pct = +selPct.value; pintar(true); });
  [inNombre, inWa].forEach(function (el) { el.addEventListener("input", function () { pintar(false); clearTimeout(espera); espera = setTimeout(function () { pintar(true); }, 700); }); });
  window.addEventListener("resize", function () { caja.querySelectorAll("iframe[data-lote]").forEach(ajustarAlto); });

  /* ---------- PDF: hoja unificada + una página por lote ---------- */
  function listo(f) {
    return new Promise(function (res, rej) {
      var t0 = Date.now();
      (function mirar() {
        var w = f.contentWindow;
        if (w && w.MO_cotizacion && w.document.readyState === "complete" && w.document.querySelector("[data-plano] svg")) return setTimeout(res, 600);
        if (Date.now() - t0 > 20000) return rej(new Error("la hoja del lote " + f.dataset.lote + " no cargó"));
        setTimeout(mirar, 250);
      })();
    });
  }
  function lienzoResumen() {
    var hoja = caja.querySelector("[data-resumen]");
    return html2canvas(hoja, {
      scale: 2, backgroundColor: "#ffffff", useCORS: true, logging: false, windowWidth: 1100, windowHeight: 1500, width: 920,
      onclone: function (doc) {
        var h = doc.querySelector("[data-resumen]");
        h.style.width = "920px"; h.style.maxWidth = "920px"; h.style.margin = "0"; h.style.boxShadow = "none";
      }
    });
  }
  function armarPDF() {
    if (!window.html2canvas || !window.jspdf) return Promise.reject(new Error("sin librerías"));
    var marcos = Array.prototype.slice.call(caja.querySelectorAll("iframe[data-lote]"));
    var pdf = new window.jspdf.jsPDF({ orientation: "p", unit: "pt", format: "a4" });
    var pagina = function (lienzo, primera) {
      if (!primera) pdf.addPage();
      var ancho = 595.28, alto = 841.89, margen = 18, w = ancho - margen * 2, h = lienzo.height * w / lienzo.width;
      if (h > alto - margen * 2) { h = alto - margen * 2; w = lienzo.width * h / lienzo.height; }
      pdf.addImage(lienzo.toDataURL("image/jpeg", 0.9), "JPEG", (ancho - w) / 2, margen, w, h);
    };
    return lienzoResumen().then(function (l0) {
      pagina(l0, true);
      // cada hoja de lote, una por una (en orden)
      return marcos.reduce(function (cadena, f) {
        return cadena.then(function () { return listo(f); }).then(function () { return f.contentWindow.MO_cotizacion.lienzo(); }).then(function (lz) { pagina(lz, false); });
      }, Promise.resolve());
    }).then(function () { return pdf.output("blob"); });
  }
  function nombreArchivo() {
    return "Cotizacion " + lotes.length + " lotes (" + lotes.map(function (l) { return l.id; }).join(", ") + ") - Santa Clara" + (inNombre.value.trim() ? " - " + inNombre.value.trim() : "") + ".pdf";
  }
  function mensaje() {
    var cs = calculos(), n = inNombre.value.trim(), w = inWa.value.trim(), total = 0, area = 0, ini = 0, cuota = 0, contado = 0;
    var filas = cs.map(function (x) {
      var l = x.l; total += l.precio; area += l.area; ini += x.p.inicial; cuota += x.p.cuota; contado += x.c.total;
      return "• " + l.id + " (Mz. " + l.mz + " · Lote " + l.n + ") · " + nf.format(l.area) + " m²" + (l.frente && !l.lados ? " · " + nf.format(l.frente) + " × " + nf.format(l.fondo) + " m" : "") + " · " + MO.pesos(l.precio);
    });
    return "Hola, soy " + n + ". Estoy interesado en estos " + cs.length + " lotes de Santa Clara y quiero cotizarlos:" + CR + CR + filas.join(CR) + CR + CR +
      "Total: " + cs.length + " lotes · " + nf.format(area) + " m² · " + MO.pesos(total) + CR +
      (modo === "contado"
        ? "Forma de pago: DE CONTADO · valor de contado " + MO.pesos(contado) + CR
        : "Forma de pago: FINANCIADO · cuota inicial " + pct + "% (" + MO.pesos(ini) + ") · cuotas mensuales que suman " + MO.pesos(cuota) + CR) +
      "Mi WhatsApp: " + w + CR + CR + "Adjunto mi cotización en PDF. Quiero que me llamen para darme más información.";
  }
  function fallo(m, campo) { errBox.hidden = false; errBox.textContent = m; if (campo) campo.focus(); }
  function descargar(blob) {
    var url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url; a.download = nombreArchivo(); document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  var enviando = false;
  $("#c-wa-enviar").addEventListener("click", function () {
    var boton = this;
    if (enviando) return;
    var n = inNombre.value.trim(), w = inWa.value.replace(/[^0-9+]/g, "");
    if (n.length < 3) return fallo("Escribe tu nombre y apellido.", inNombre);
    if (w.replace(/[^0-9]/g, "").length < 7) return fallo("Escribe tu número de WhatsApp.", inWa);
    errBox.hidden = true; enviando = true; boton.disabled = true;
    var texto = boton.textContent; boton.textContent = "Armando tu cotización…";
    var msg = mensaje();
    if (window.dataLayer) window.dataLayer.push({ event: "cotizacion_varios_whatsapp", lotes: lotes.map(function (l) { return l.id; }).join(","), modo: modo });
    armarPDF().then(function (blob) {
      var archivo = new File([blob], nombreArchivo(), { type: "application/pdf" });
      if (navigator.canShare && navigator.canShare({ files: [archivo] })) return navigator.share({ files: [archivo], text: msg, title: "Cotización de " + lotes.length + " lotes · Santa Clara" });
      descargar(blob);
      window.open(MO.waLink(msg), "_blank", "noopener");
      errBox.hidden = false; errBox.textContent = "Se descargó tu cotización en PDF y se abrió WhatsApp: adjunta el archivo en el chat.";
    }).catch(function (e) {
      if (window.console) console.error("cotización de varios lotes: no se pudo armar el PDF", e);
      window.open(MO.waLink(msg + CR + CR + "Cotización: " + location.href), "_blank", "noopener");
    }).then(function () { enviando = false; boton.disabled = false; boton.textContent = texto; });
  });
  $("#c-pdf").addEventListener("click", function () {
    var boton = this, texto = boton.textContent;
    boton.disabled = true; boton.textContent = "Armando el PDF…";
    armarPDF().then(descargar).catch(function (e) { fallo("No se pudo armar el PDF en este navegador. Intenta de nuevo."); if (window.console) console.error(e); })
      .then(function () { boton.disabled = false; boton.textContent = texto; });
  });
  window.MO_cotizacionVarios = { pdf: armarPDF };   // para pruebas

  pintar(true);
  document.title = "Cotización de " + lotes.length + " lotes · Santa Clara · Poblado Campestre";
})();
