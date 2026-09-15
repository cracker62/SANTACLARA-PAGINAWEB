/*
 * OLIMPO · asistente virtual de Monte Olimpo y Santa Clara
 * Responde con la información real del sitio: inventario de lotes (data/santa-clara.js), condiciones comerciales
 * (data/config.js) y preguntas frecuentes (data/faq.js). No inventa datos: si no sabe, conecta con un asesor.
 * Funciona sin servidor. Más adelante puede conectarse a un modelo de IA (Claude) desde un backend propio.
 */
(function () {
  var CFG = window.MO_CONFIG, SC = window.SANTA_CLARA, F = CFG.financiacion;
  var nf = new Intl.NumberFormat("es-CO");
  var pesos = function (v) { return "$" + nf.format(Math.round(v)); };
  var millones = function (v) { return "$" + (v / 1e6).toLocaleString("es-CO", { maximumFractionDigits: 1 }) + " M"; };
  var lots = SC ? SC.lots : [], disp = lots.filter(function (l) { return l.estado === "disponible"; });
  var byId = {}; lots.forEach(function (l) { byId[l.id] = l; });

  // Imagen de Olimpo: el isotipo de Monte Olimpo (laurel y M) sobre un círculo oscuro
  var scriptActual = document.currentScript || document.querySelector('script[src*="olimpo.js"]');
  var RAIZ = scriptActual ? scriptActual.src.replace(/assets\/js\/olimpo\.js.*$/, "") : "";
  var AVATAR = '<span class="olimpo-logo" aria-hidden="true"><img src="' + RAIZ + 'assets/img/monte-olimpo-isotipo.png" alt="" width="64" height="60"></span>';

  function norm(s) { return (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[¿?¡!.,;:]/g, " ").replace(/\s+/g, " ").trim(); }
  function has(t, words) { return words.some(function (w) { return t.indexOf(w) !== -1; }); }

  function reglasTexto() {
    var prev = 0;
    return F.financing_rules.map(function (r) {
      var t = r.hasta_m2 === null ? "desde " + nf.format(prev + 1) + " m²" : (prev ? nf.format(prev + 1) + "–" : "hasta ") + nf.format(r.hasta_m2) + " m²";
      prev = r.hasta_m2 || prev;
      return "<li>" + t + ": <b>" + r.min_months + " a " + r.max_months + " meses</b></li>";
    }).join("");
  }
  function regla(area) {
    for (var i = 0; i < F.financing_rules.length; i++) { var r = F.financing_rules[i]; if (r.hasta_m2 === null || area <= r.hasta_m2) return r; }
  }
  function cuota(valor, pct, meses) { return Math.round((valor - valor * pct / 100) / meses); }

  /* ---------- extracción de datos del mensaje ---------- */
  function extraer(raw) {
    var t = norm(raw), e = { t: t };
    var m = raw.match(/\b(?:mz\.?|manzana)\s*([a-pr]\d?)\s*(?:·|,|-)?\s*(?:lote)?\s*(\d{1,2}(?:-\d)?)\b/i) ||
            raw.match(/\blote\s+([a-pr]\d?)\s*-?\s*(\d{1,2}(?:-\d)?)\b/i) ||
            raw.match(/\b([a-pr]\d?)\s*-\s*(\d{1,2}(?:-\d)?)\b/i);
    if (m) {
      var mz = m[1].toUpperCase(), n = m[2], cands = [mz + "-" + n, mz + "1-" + n, mz.replace(/1$/, "") + "-" + n];
      for (var i = 0; i < cands.length; i++) if (byId[cands[i]]) { e.lote = byId[cands[i]]; break; }
      if (!e.lote) e.loteNo = mz + "-" + n;
    }
    var ma = t.match(/(\d{3,4})\s*(m2|m²|mts|metros|mt\b)/); if (ma && +ma[1] >= 300) e.area = +ma[1];
    var mm = t.match(/(\d+(?:[.,]\d+)?)\s*(millones|millon|mill\b|mm\b|palos)/) || (!e.area && t.match(/\b(\d{2,3})\s*m(?![\w²])/));
    if (mm) e.dinero = parseFloat(mm[1].replace(",", ".")) * 1e6;
    else {
      var big = raw.replace(/\$/g, "").match(/\b\d{1,3}(?:[.\s]\d{3})+\b|\b\d{6,9}\b/);
      if (big && +big[0].replace(/[.\s]/g, "") >= 100000) e.dinero = +big[0].replace(/[.\s]/g, "");
    }
    var mes = t.match(/(\d{1,2})\s*meses/); if (mes) e.meses = +mes[1];
    var pc = t.match(/(\d{2})\s*(%|por ciento)/); if (pc) e.pct = +pc[1];
    var et = t.match(/etapa\s*(1|2|uno|dos)/); if (et) e.etapa = /1|uno/.test(et[1]) ? 1 : 2;
    [["vista lago", "Vista Lago"], ["lago", "Lago"], ["esquina", "Esquina"], ["altura", "Altura"], ["carretera", "Carretera A1"], ["frente", "Frente A2"]].some(function (u) {
      if (t.indexOf(u[0]) !== -1) { e.ubic = u[1]; return true; }
    });
    return e;
  }

  /* ---------- respuestas ---------- */
  function linkLote(l, base) { return '<a href="#" data-ir-lote="' + l.id + '">' + l.id + "</a>"; }
  function filaLote(l) {
    var r = regla(l.area);
    return "<li>" + linkLote(l) + " · " + nf.format(l.area) + " m² · " + (l.ubic || "") + " · <b>" + millones(l.precio) + "</b> · desde " + pesos(cuota(l.precio, F.default_down_payment, r.max_months)) + "/mes</li>";
  }

  function responder(raw) {
    var e = extraer(raw), t = e.t, out = { html: "", chips: [] };
    var W = function (h, chips) { out.html = h; out.chips = chips || []; return out; };

    if (!t) return W("Escríbeme tu pregunta.");

    // lote específico
    if (e.lote) {
      var l = e.lote;
      if (l.estado === "vendido" || l.estado === "reservado") {
        var sim = disp.slice().sort(function (a, b) { return Math.abs(a.area - l.area) - Math.abs(b.area - l.area) || a.precio - b.precio; }).slice(0, 3);
        return W("El lote <b>" + l.id + "</b> ya está <b>" + (l.estado === "reservado" ? "reservado por otro cliente" : "vendido") + "</b>. Estos disponibles se le parecen:<ul>" + sim.map(filaLote).join("") + "</ul>", ["Hablar con un asesor"]);
      }
      if (l.estado !== "disponible") return W("El lote <b>" + l.id + "</b> aparece como <b>" + (l.estado === "tecnico" ? "zona técnica" : "próximamente") + "</b> y no tiene precio publicado. Tu asesor te puede dar novedades.", ["Hablar con un asesor"]);
      var r = regla(l.area), meses = e.meses ? Math.min(Math.max(e.meses, r.min_months), r.max_months) : r.max_months, pct = e.pct && F.down_payment_options.indexOf(e.pct) !== -1 ? e.pct : F.default_down_payment;
      var ajuste = e.meses && meses !== e.meses ? " (para este lote el plazo de referencia es de " + r.min_months + " a " + r.max_months + " meses)" : "";
      return W("¡Buena elección! <b>Mz. " + l.mz + " · Lote " + l.n + "</b><ul><li>Área: " + nf.format(l.area) + " m²</li><li>Valor: <b>" + pesos(l.precio) + "</b></li><li>Ubicación: " + l.ubic + " · Etapa " + l.etapa + "</li><li>Cuota inicial " + pct + "%: " + pesos(l.precio * pct / 100) + "</li><li>Cuota mensual a " + meses + " meses: <b>" + pesos(cuota(l.precio, pct, meses)) + "</b>" + ajuste + "</li></ul>" +
        '<a class="olimpo__cta" href="#" data-ir-lote="' + l.id + '">Ver este lote en el plano →</a>', ["Quiero este lote", "Lotes parecidos"]);
    }
    if (e.loteNo) return W("No encuentro el lote <b>" + e.loteNo + "</b> en el plano. Revisa la manzana y el número (ejemplo: G-12).");

    // saludos / cortesía
    if (/^(hola|buenas|buenos dias|buenas tardes|buenas noches|hey|que tal|saludos)\b/.test(t) && t.split(" ").length <= 4)
      return W("¡Hola! Soy <b>Olimpo</b>. Puedo decirte qué lotes hay disponibles, cuánto cuestan, simular tu cuota o explicarte la financiación. ¿Qué te gustaría saber?", ["Lotes más económicos", "¿Tiene intereses?", "¿Dónde queda?"]);
    if (has(t, ["gracias", "muy amable", "perfecto", "listo"]) && t.split(" ").length <= 5)
      return W("¡Con gusto! Cuando quieras dar el siguiente paso, un asesor te acompaña por WhatsApp.", ["Hablar con un asesor"]);

    // propósito de compra: primero entender, luego recomendar
    if (has(t, ["casa de descanso", "construir", "finca", "vivir", "invertir", "inversion", "valorizacion", "para mi familia", "jubil"]) && !e.dinero && !e.area)
      return W((has(t, ["invertir", "inversion", "valorizacion"]) ? "Buena decisión: la tierra es un patrimonio que se hereda completo." : "¡Qué buen sueño! Santa Clara está pensado justo para eso: agua, naturaleza y a 45 minutos de Barranquilla.") +
        " Para recomendarte el lote ideal, cuéntame: <b>¿cuánto podrías pagar al mes?</b>", ["Hasta $1,5 M al mes", "Hasta $2,5 M al mes", "Más de $3 M al mes"]);

    // presupuesto mensual con recomendación (usa el mismo recomendador del simulador)
    if (e.dinero && e.dinero < 8e6 && window.MO && MO.recomendar) {
      var rec = MO.recomendar(e.dinero, e.pct || F.default_down_payment);
      if (!rec.total) return W("Con " + pesos(e.dinero) + " al mes todavía no alcanza ningún lote. La cuota más baja hoy es <b>" + pesos(rec.minimo.cuota) + "</b> (lote " + linkLote(rec.minimo.l) + ", " + nf.format(rec.minimo.l.area) + " m²). Si das una cuota inicial mayor, la cuota baja. ¿Lo revisamos con un asesor?", ["Hablar con un asesor"]);
      return W("Con <b>" + pesos(e.dinero) + " al mes</b> puedes elegir entre <b>" + rec.total + " lotes</b>. Mis recomendaciones:<ul>" +
        rec.opciones.map(function (x) { return "<li>" + linkLote(x.o.l) + " · " + x.etiqueta.toLowerCase() + ": " + nf.format(x.o.l.area) + " m², " + x.o.l.ubic + ", <b>" + pesos(x.o.cuota) + "/mes</b> a " + x.o.meses + " meses (inicial " + pesos(x.o.inicial) + ")</li>"; }).join("") +
        "</ul>Toca un código para verlo en el plano. ¿Te gustaría visitarlo?", ["Agendar visita", "Separar un lote"]);
    }

    // asesor humano
    if (has(t, ["asesor", "humano", "persona", "whatsapp", "llamar", "telefono", "celular", "contacto", "quiero este lote", "separar", "apartar", "comprar ya", "reserva"]))
      return W("Te conecto con un asesor comercial por WhatsApp (" + CFG.whatsapp.visible + "). Él confirma la disponibilidad, el valor de separación y los siguientes pasos." +
        '<a class="olimpo__cta" data-wa-olimpo href="#">Escribir por WhatsApp →</a>');

    // buscar / recomendar lotes
    var sinFiltros = !e.area && !e.ubic && !e.dinero && !e.etapa;
    if (sinFiltros && has(t, ["cuanto vale", "cuanto cuesta", "cuanto valen", "precio", "precios", "valor de los", "tamano", "tamanos", "medidas", "que areas"]) && !has(t, ["barato", "economico", "grande"])) {
      var pr = disp.map(function (l) { return l.precio; }), ar = disp.map(function (l) { return l.area; });
      return W("Hoy hay <b>" + disp.length + " lotes disponibles</b> en Santa Clara:<ul><li>Áreas de <b>" + Math.min.apply(null, ar) + " a " + nf.format(Math.max.apply(null, ar)) + " m²</b></li><li>Precios desde <b>" + millones(Math.min.apply(null, pr)) + "</b> hasta <b>" + millones(Math.max.apply(null, pr)) + "</b></li></ul>", ["Lotes más económicos", "Lotes más grandes"]);
    }
    var quiereLotes = has(t, ["lote", "lotes", "disponible", "recomienda", "recomiendame", "opciones", "barato", "economico", "grande", "presupuesto", "tengo", "alcanza", "parecidos"]) || e.area || e.ubic || e.etapa;
    if (e.dinero && e.dinero < 8e6 && has(t, ["cuota", "mensual", "al mes", "mensualidad", "pagar"])) {
      // presupuesto mensual
      var porCuota = disp.filter(function (l) { return cuota(l.precio, F.default_down_payment, regla(l.area).max_months) <= e.dinero; }).sort(function (a, b) { return b.area - a.area; });
      if (!porCuota.length) return W("Con una cuota de " + pesos(e.dinero) + " al mes no encuentro lotes con la cuota inicial de referencia (" + F.default_down_payment + "%). La cuota más baja hoy es de " + pesos(Math.min.apply(null, disp.map(function (l) { return cuota(l.precio, F.default_down_payment, regla(l.area).max_months); }))) + ". Un asesor puede revisar otras opciones contigo.", ["Hablar con un asesor"]);
      return W("Con una cuota de hasta <b>" + pesos(e.dinero) + "/mes</b> hay <b>" + porCuota.length + " lotes</b>. Los de mayor área:<ul>" + porCuota.slice(0, 4).map(filaLote).join("") + "</ul><small>Cuota con " + F.default_down_payment + "% de inicial y el plazo máximo de referencia.</small>");
    }
    if (quiereLotes && !has(t, ["interes", "financ", "donde", "ubica", "llegar", "visita", "matricula", "escritura"])) {
      var ls = disp.slice();
      if (e.etapa) ls = ls.filter(function (l) { return l.etapa === e.etapa; });
      if (e.ubic) ls = ls.filter(function (l) { return l.ubic === e.ubic; });
      if (e.area) ls = ls.filter(function (l) { return Math.abs(l.area - e.area) <= Math.max(30, e.area * .08); });
      if (e.dinero) ls = ls.filter(function (l) { return l.precio <= e.dinero; });
      var grande = has(t, ["grande", "mayor area", "mas area", "amplio"]);
      ls.sort(function (a, b) { return grande ? b.area - a.area : a.precio - b.precio; });
      var filtros = [e.area ? "de unos " + e.area + " m²" : "", e.ubic ? "en ubicación " + e.ubic.toLowerCase() : "", e.etapa ? "de la etapa " + e.etapa : "", e.dinero ? "hasta " + millones(e.dinero) : ""].filter(Boolean).join(", ");
      if (!ls.length) return W("No encuentro lotes disponibles " + filtros + ". Prueba con otra área o presupuesto, o pregúntale a un asesor.", ["Lotes más económicos", "Hablar con un asesor"]);
      return W("Hay <b>" + ls.length + " lotes disponibles</b>" + (filtros ? " " + filtros : "") + ". " + (grande ? "Los más grandes" : "Los más económicos") + ":<ul>" + ls.slice(0, 4).map(filaLote).join("") + "</ul>Toca un código para verlo en el plano.", ["Simular cuota", "Lotes en el lago"]);
    }

    // simular cuota con un valor
    if (has(t, ["cuota", "simula", "cuanto pagaria", "cuanto pago", "mensual", "financiar"]) && e.dinero) {
      var area = e.area || 500, rr = regla(area), mes = e.meses ? Math.min(Math.max(e.meses, rr.min_months), rr.max_months) : rr.max_months, p = e.pct || F.default_down_payment;
      return W("Para un lote de <b>" + pesos(e.dinero) + "</b>" + (e.area ? " y " + e.area + " m²" : "") + ":<ul><li>Cuota inicial " + p + "%: " + pesos(e.dinero * p / 100) + "</li><li>Saldo: " + pesos(e.dinero * (100 - p) / 100) + "</li><li>A " + mes + " meses: <b>" + pesos(cuota(e.dinero, p, mes)) + "/mes</b></li></ul><small>" + (e.area ? "" : "Supuse un lote de 500 m² (plazo hasta " + rr.max_months + " meses). ") + "Sin intereses. " + F.aviso + "</small>");
    }

    // financiación
    if (has(t, ["interes", "financ", "credito", "banco", "plazo", "cuota inicial", "inicial", "cuotas", "meses", "separacion", "cuanto hay que dar", "forma de pago", "pago"])) {
      var sep = F.reservation_amount ? "La separación es de <b>" + pesos(F.reservation_amount) + "</b>." : "El valor de separación te lo confirma tu asesor.";
      if (has(t, ["separacion"])) return W(sep + " Escríbele con el código del lote que te gusta.", ["Hablar con un asesor"]);
      return W("La financiación es <b>directa con Monte Olimpo, sin bancos y sin intereses</b>. La cuota inicial de referencia es el <b>" + F.default_down_payment + "%</b> y el saldo se paga en cuotas mensuales. Plazos de referencia según el área:<ul>" + reglasTexto() + "</ul>El plazo final se acuerda con tu asesor. " + sep, ["Simular cuota", "Lotes más económicos"]);
    }
    if (has(t, ["simula", "cuota", "cuanto pagaria", "mensualidad"]))
      return W("Dime el <b>código del lote</b> (ej. G-12) o un <b>valor</b> (ej. «cuota para 50 millones a 24 meses») y te calculo la cuota.");

    // precios y tamaños generales
    if (has(t, ["precio", "cuesta", "valen", "valor", "tamano", "tamanos", "metros", "area", "medidas", "cuanto vale"])) {
      var precios = disp.map(function (l) { return l.precio; }), areas = disp.map(function (l) { return l.area; });
      return W("Hoy hay <b>" + disp.length + " lotes disponibles</b> en Santa Clara:<ul><li>Áreas de <b>" + Math.min.apply(null, areas) + " a " + nf.format(Math.max.apply(null, areas)) + " m²</b></li><li>Precios desde <b>" + millones(Math.min.apply(null, precios)) + "</b> hasta <b>" + millones(Math.max.apply(null, precios)) + "</b></li></ul>", ["Lotes más económicos", "Lotes más grandes"]);
    }

    // ubicación
    if (has(t, ["donde", "ubica", "llegar", "direccion", "mapa", "palmar", "queda", "via", "barranquilla", "distancia", "lejos"]))
      return W("Santa Clara queda en la zona rural de <b>Palmar de Varela, Atlántico</b>, con acceso por la doble calzada Sabanalarga – Palmar de Varela. Estás a <b>45 minutos de Barranquilla</b>, a <b>20 minutos del aeropuerto</b> y a <b>10 minutos de Santo Tomás y Palmar de Varela</b>." +
        '<a class="olimpo__cta" href="' + CFG.proyectos.santaClara.mapa + '" target="_blank" rel="noopener">Abrir en Google Maps →</a>', ["Agendar visita"]);

    // amenidades
    if (has(t, ["amenidad", "lago", "ecoparque", "parque", "zonas comunes", "zona comun", "picnic", "contemplacion", "garita", "porteria", "seguridad", "piscina", "club"]))
      return W("El proyecto contempla <b>Lago 1 y Lago 2, ecoparque, zona de contemplación, zona picnic, garita de acceso y áreas comunes</b>. Todas están <b>proyectadas</b>; tu asesor te informa su avance. Dentro del proyecto también está la <b>Ciénaga El Pelú</b>." + (has(t, ["piscina", "club"]) ? " No tengo confirmada una piscina o club house." : ""), ["Lotes en el lago"]);

    // servicios no confirmados
    if (has(t, ["agua", "luz", "energia", "servicios", "gas", "internet", "alcantarillado", "vias pavimentadas"]))
      return W("No tengo confirmada la información de servicios públicos. Prefiero no inventarte nada: un asesor te la da con precisión.", ["Hablar con un asesor"]);

    // visita
    if (has(t, ["visita", "visitar", "conocer el proyecto", "ir a ver", "recorrido presencial", "cita"]))
      return W("¡Claro! Puedes visitar Santa Clara antes de comprar. Escríbenos y agendamos tu recorrido." + '<a class="olimpo__cta" data-wa-olimpo="visita" href="#">Agendar visita por WhatsApp →</a>');

    // exterior, 360, separación en línea
    if (has(t, ["exterior", "fuera del pais", "extranjero", "vivo en", "desde afuera", "estados unidos", "espana", "chile", "venezuela", "europa"]))
      return W("Sí puedes comprar desde el exterior: un asesor te atiende por WhatsApp desde cualquier país. <b>Muy pronto</b> podrás separar tu lote en línea y recorrer el proyecto en 360°.", ["Hablar con un asesor"]);
    if (has(t, ["360", "virtual", "tour", "en linea", "online"]))
      return W("El <b>recorrido 360°</b> y la <b>separación en línea</b> estarán disponibles muy pronto. Mientras tanto, mira los videos del proyecto o agenda una visita.", ["Agendar visita"]);

    // legal
    if (has(t, ["matricula", "escritura", "papeles", "legal", "licencia", "documentos"]))
      return W("Cada lote muestra su <b>número de matrícula</b> en la ficha del plano; algunos aparecen con la matrícula <b>en trámite</b>. Para escrituración y documentos, tu asesor te explica el proceso.", ["Hablar con un asesor"]);

    // empresa y trayectoria
    if (has(t, ["monte olimpo", "quienes", "empresa", "trayectoria", "confianza", "proyectos anteriores", "confiable", "seguro", "respaldo"]))
      return W("Monte Olimpo desarrolla proyectos campestres en el Atlántico. Ya comercializó al 100% <b>San Nicolás</b> (su primer proyecto), <b>Monte Olimpo</b>, <b>La Inmaculada</b> y <b>Las Mercedes</b>. Hoy desarrolla <b>Santa Clara – Poblado Campestre</b>.", ["Lotes más económicos"]);

    // coincidencia con preguntas frecuentes
    var faq = (window.MO_FAQ || []).map(function (f) {
      var words = norm(f.p).split(" ").filter(function (w) { return w.length > 3; });
      var score = words.filter(function (w) { return t.indexOf(w) !== -1; }).length / (words.length || 1);
      return { f: f, s: score };
    }).sort(function (a, b) { return b.s - a.s; })[0];
    if (faq && faq.s >= .5) return W(faq.f.r.replace("{PLAZOS}", "").replace("{AREAS}", "").replace("{INICIAL}", F.default_down_payment));

    return W("No estoy seguro de haber entendido. Puedo ayudarte con <b>lotes disponibles, precios, cuotas, financiación, ubicación y visitas</b>. Si prefieres, te conecto con un asesor.", ["Lotes más económicos", "¿Tiene intereses?", "Hablar con un asesor"]);
  }

  /* ---------- interfaz ---------- */
  var api = {};
  function montar(root, opts) {
    if (!root) return;
    opts = opts || {};
    var ultima = "";
    root.innerHTML =
      '<div class="olimpo__head"><span class="olimpo__av">' + AVATAR + '</span><div><b>Olimpo</b><span><i></i>Asistente de Monte Olimpo</span></div>' +
      '<button type="button" class="olimpo__close" data-close aria-label="Cerrar chat"><svg viewBox="0 0 16 16" stroke="currentColor" stroke-width="1.6"><path d="m3 3 10 10M13 3 3 13"/></svg></button></div>' +
      '<div class="olimpo__log" data-log aria-live="polite"></div>' +
      '<div class="olimpo__chips" data-chips></div>' +
      '<form class="olimpo__form" data-form><label class="sr-only" for="olimpo-in">Escríbele a Olimpo</label><input id="olimpo-in" type="text" autocomplete="off" placeholder="Pregúntame: ¿qué lotes hay de 500 m²?"><button type="submit" aria-label="Enviar"><svg viewBox="0 0 20 20" fill="currentColor"><path d="M2.5 10 17 3l-4.5 14-2.6-5.4Z"/></svg></button></form>' +
      '<p class="olimpo__legal">Olimpo responde con la información publicada. Las condiciones finales las confirma un asesor.</p>';
    var log = root.querySelector("[data-log]"), chips = root.querySelector("[data-chips]"), form = root.querySelector("[data-form]"), input = form.querySelector("input");

    function burbuja(html, quien) {
      var d = document.createElement("div");
      d.className = "olimpo__msg olimpo__msg--" + quien;
      d.innerHTML = quien === "bot" ? '<span class="olimpo__av olimpo__av--sm">' + AVATAR + "</span><div>" + html + "</div>" : "<div></div>";
      if (quien === "yo") d.firstChild.textContent = html;
      log.appendChild(d); log.scrollTop = log.scrollHeight;
      return d;
    }
    function ponerChips(list) {
      chips.innerHTML = "";
      list.forEach(function (c) { var b = document.createElement("button"); b.type = "button"; b.textContent = c; chips.appendChild(b); });
    }
    var historial = [], iaDisponible = !!CFG.olimpo_api && /^https?:$/.test(location.protocol), ocupado = false;

    /* Convierte la respuesta de la IA en HTML seguro: escapa todo y luego crea negritas, listas y botones */
    function htmlIA(txt) {
      var esc = function (s) { return s.replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
      var cta = "";
      var s = esc(txt).replace(/\[\[whatsapp:([\s\S]*?)\]\]/gi, function (_, msg) {
        var real = msg.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
        cta = '<a class="olimpo__cta olimpo__cta--wa" href="' + MO.waLink(real.trim()) + '" target="_blank" rel="noopener">Continuar con un asesor por WhatsApp →</a>';
        return "";
      }).replace(/\[\[lote:\s*([A-Z0-9-]+)\s*\]\]/gi, function (_, id) {
        var l = byId[id.toUpperCase()];
        return l ? '<a href="#" class="olimpo__lote" data-ir-lote="' + l.id + '">' + l.id + (l.estado === "disponible" ? " · " + millones(l.precio) : "") + "</a>" : "<b>" + id + "</b>";
      }).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
      var out = [], lista = [];
      s.split(/\n/).forEach(function (linea) {
        var m = linea.match(/^\s*[-•]\s+(.*)$/);
        if (m) { lista.push("<li>" + m[1] + "</li>"); return; }
        if (lista.length) { out.push("<ul>" + lista.join("") + "</ul>"); lista = []; }
        if (linea.trim()) out.push("<p>" + linea + "</p>");
      });
      if (lista.length) out.push("<ul>" + lista.join("") + "</ul>");
      return out.join("") + cta;
    }
    function chipsIA(txt) {
      var c = [];
      if (!/\[\[whatsapp:/i.test(txt)) c.push("Agendar visita");
      if (/\[\[lote:/i.test(txt)) c.push("Separar un lote");
      c.push("Hablar con un asesor");
      return c;
    }
    function textoPlano(html) { var d = document.createElement("div"); d.innerHTML = html; return d.textContent.trim(); }

    function preguntar(texto) {
      if (!texto.trim() || ocupado) return;
      ultima = texto; ocupado = true;
      burbuja(texto, "yo"); ponerChips([]);
      historial.push({ role: "user", content: texto });
      var typing = burbuja('<span class="olimpo__typing"><i></i><i></i><i></i></span>', "bot");
      var t0 = Date.now();
      function mostrar(html, chips, plano) {
        setTimeout(function () {
          typing.remove(); burbuja(html, "bot"); ponerChips(chips);
          historial.push({ role: "assistant", content: plano });
          ocupado = false;
          if (window.dataLayer) window.dataLayer.push({ event: "olimpo_pregunta", texto: texto, ia: iaDisponible });
        }, Math.max(0, 500 - (Date.now() - t0)));
      }
      function local() { var r = responder(texto); mostrar(r.html, r.chips, textoPlano(r.html)); }
      if (!iaDisponible) return local();
      var ctrl = "AbortController" in window ? new AbortController() : null;
      var limite = setTimeout(function () { if (ctrl) ctrl.abort(); }, 45000);
      fetch(CFG.olimpo_api, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: historial.slice(-20) }), signal: ctrl ? ctrl.signal : undefined })
        .then(function (res) {
          clearTimeout(limite);
          if ([404, 405, 501, 503].indexOf(res.status) !== -1) { iaDisponible = false; throw new Error("sin IA"); }
          if (!res.ok) throw new Error("error " + res.status);
          return res.json();
        })
        .then(function (d) { mostrar(htmlIA(d.respuesta), chipsIA(d.respuesta), d.respuesta); })
        .catch(function () { clearTimeout(limite); local(); });
    }
    form.addEventListener("submit", function (e) { e.preventDefault(); var v = input.value; input.value = ""; preguntar(v); });
    chips.addEventListener("click", function (e) {
      var b = e.target.closest("button"); if (!b) return;
      var map = { "Lotes más económicos": "¿Cuáles son los lotes más económicos?", "Lotes más grandes": "Muéstrame los lotes más grandes", "Simular cuota": "Quiero simular una cuota",
        "Lotes en el lago": "Lotes disponibles en el lago", "Lotes parecidos": "lotes disponibles de " + (root.dataset.area || 500) + " m2", "Agendar visita": "Quiero agendar una visita",
        "Hasta $1,5 M al mes": "Puedo pagar 1.500.000 al mes", "Hasta $2,5 M al mes": "Puedo pagar 2.500.000 al mes", "Más de $3 M al mes": "Puedo pagar 3.500.000 al mes",
        "Casa de descanso": "Quiero un lote para construir mi casa de descanso", "Quiero invertir": "Quiero invertir en un lote", "Separar un lote": "Quiero separar un lote" };
      preguntar(map[b.textContent] || b.textContent);
    });
    log.addEventListener("click", function (e) {
      var a = e.target.closest("[data-ir-lote]");
      if (a) {
        e.preventDefault();
        var id = a.getAttribute("data-ir-lote"); root.dataset.area = byId[id] ? byId[id].area : 500;
        if (typeof window.seleccionarLote === "function") { if (window.matchMedia("(max-width: 860px)").matches) cerrar(); window.seleccionarLote(id); }
        else location.href = (opts.base || "") + "?lote=" + encodeURIComponent(id) + "#lotes";
        return;
      }
      var w = e.target.closest("[data-wa-olimpo]");
      if (w) {
        e.preventDefault();
        var msg = w.getAttribute("data-wa-olimpo") === "visita" ? "Hola, quiero agendar una visita a Santa Clara – Poblado Campestre." :
          "Hola, vengo del asistente Olimpo de la página web." + (ultima ? " Mi pregunta: " + ultima : "");
        window.open(MO.waLink(msg), "_blank", "noopener");
      }
    });
    burbuja("¡Hola! Soy <b>Olimpo</b>. Te ayudo a encontrar tu lote en Santa Clara: hay " + disp.length + " disponibles, sin intereses. Para empezar, <b>¿qué sueñas construir?</b>", "bot");
    historial.push({ role: "assistant", content: "¡Hola! Soy Olimpo. Te ayudo a encontrar tu lote en Santa Clara: hay " + disp.length + " disponibles, sin intereses. Para empezar, ¿qué sueñas construir?" });
    ponerChips(["Casa de descanso", "Quiero invertir", "Hasta $1,5 M al mes", "¿Dónde queda?", "Agendar visita"]);

    root.querySelector("[data-close]").addEventListener("click", function () { cerrar(); });
    api.preguntar = preguntar;
    api.input = input;
  }

  /* ---------- panel lateral derecho + botón flotante ---------- */
  var drawer, backdrop, fab, abierto = false;
  function abrir(pregunta) {
    if (!drawer) return;
    abierto = true;
    drawer.classList.add("is-open"); backdrop.classList.add("is-open"); fab.classList.add("is-hidden");
    drawer.setAttribute("aria-hidden", "false");
    if (window.matchMedia("(max-width: 860px)").matches) document.body.classList.add("olimpo-lock");
    if (pregunta) setTimeout(function () { api.preguntar(pregunta); }, 260);
    else setTimeout(function () { api.input.focus({ preventScroll: true }); }, 320);
  }
  function cerrar() {
    if (!drawer || !abierto) return;
    abierto = false;
    drawer.classList.remove("is-open"); backdrop.classList.remove("is-open"); fab.classList.remove("is-hidden");
    drawer.setAttribute("aria-hidden", "true");
    document.body.classList.remove("olimpo-lock");
    fab.focus({ preventScroll: true });
  }
  document.addEventListener("DOMContentLoaded", function () {
    if (!window.MO) return;
    drawer = document.createElement("aside");
    drawer.className = "olimpo-drawer"; drawer.setAttribute("aria-label", "Chat con Olimpo"); drawer.setAttribute("aria-hidden", "true");
    drawer.innerHTML = '<div class="olimpo" data-olimpo-panel></div>';
    backdrop = document.createElement("div"); backdrop.className = "olimpo-backdrop";
    fab = document.createElement("button");
    fab.type = "button"; fab.className = "olimpo-fab"; fab.setAttribute("aria-label", "Abrir chat con Olimpo");
    fab.innerHTML = '<span class="olimpo__av">' + AVATAR + '</span><span class="olimpo-fab__txt"><b>Olimpo</b><small>¿Te ayudo?</small></span>';
    document.body.appendChild(backdrop); document.body.appendChild(drawer); document.body.appendChild(fab);
    montar(drawer.querySelector("[data-olimpo-panel]"), { base: document.body.getAttribute("data-olimpo-base") || "" });
    fab.addEventListener("click", function () { abierto ? cerrar() : abrir(); });
    backdrop.addEventListener("click", cerrar);
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && abierto) cerrar(); });
    document.querySelectorAll("[data-olimpo-avatar]").forEach(function (el) { el.innerHTML = AVATAR; });
    document.addEventListener("click", function (e) {
      var b = e.target.closest("[data-olimpo-open]"); if (!b) return;
      e.preventDefault(); abrir(b.getAttribute("data-olimpo-open") || "");
    });
  });

  window.Olimpo = { montar: montar, responder: responder, avatar: AVATAR, abrir: abrir, cerrar: cerrar };
})();
