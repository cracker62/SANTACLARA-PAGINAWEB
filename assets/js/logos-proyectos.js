/* Logos de los proyectos de Monte Olimpo, en vector (se ven nítidos en cualquier tamaño).
   Se muestran todos en un solo tono marfil sobre el mismo fondo oscuro, igual que el logo de
   Santa Clara, para que los cinco proyectos se vean como una misma familia.
   Las Mercedes y La Inmaculada se redibujaron a partir de sus logos originales;
   San Nicolás es un logo nuevo en la misma familia. Usan las fuentes Cinzel y Yellowtail. */
(function () {
  var TONO = "#EFE6D2";     // marfil de la marca
  var FONDO = "#15130F";    // para los textos calados sobre una forma clara

  function estrella(cx, cy, r) {
    var p = [];
    for (var i = 0; i < 10; i++) {
      var ang = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.42 : r;
      p.push((cx + Math.cos(ang) * rr).toFixed(1) + "," + (cy + Math.sin(ang) * rr).toFixed(1));
    }
    return '<polygon points="' + p.join(" ") + '" fill="' + TONO + '"/>';
  }

  var MERCEDES =
    '<svg viewBox="0 0 600 260" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Hacienda Campestre Las Mercedes">' +
      '<path d="M62 18H538L582 62V198L538 242H62L18 198V62Z" fill="none" stroke="' + TONO + '" stroke-width="7" stroke-linejoin="round"/>' +
      '<path d="M72 34H528L566 72V188L528 226H72L34 188V72Z" fill="none" stroke="' + TONO + '" stroke-width="1.6" opacity=".6"/>' +
      '<text x="300" y="90" text-anchor="middle" font-family="Montserrat,Arial,sans-serif" font-weight="700" font-size="28" textLength="360" lengthAdjust="spacingAndGlyphs" fill="' + TONO + '">HACIENDA CAMPESTRE</text>' +
      '<line x1="110" y1="112" x2="490" y2="112" stroke="' + TONO + '" stroke-width="2" opacity=".8"/>' +
      '<text x="300" y="180" text-anchor="middle" font-family="Cinzel,Georgia,serif" font-weight="700" font-size="64" textLength="420" lengthAdjust="spacingAndGlyphs" fill="' + TONO + '">LAS MERCEDES</text>' +
      '<line x1="110" y1="202" x2="490" y2="202" stroke="' + TONO + '" stroke-width="2" opacity=".8"/>' +
      estrella(78, 158, 12) + estrella(522, 158, 12) +
    "</svg>";

  var INMACULADA =
    '<svg viewBox="0 0 600 300" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Hacienda Campestre La Inmaculada">' +
      '<g fill="none" stroke="' + TONO + '" stroke-width="3" stroke-linecap="round">' +
        '<path d="M300 22C293 36 288 46 300 60C312 46 307 36 300 22Z" fill="' + TONO + '"/>' +
        '<path d="M300 60C282 52 264 58 258 72C272 67 286 67 300 60Z" fill="' + TONO + '"/>' +
        '<path d="M300 60C318 52 336 58 342 72C328 67 314 67 300 60Z" fill="' + TONO + '"/>' +
        '<path d="M256 74C238 70 226 58 232 48C236 42 246 44 244 52"/>' +
        '<path d="M344 74C362 70 374 58 368 48C364 42 354 44 356 52"/>' +
        '<path d="M92 104H176M424 104H508"/>' +
        '<path d="M96 204H504" stroke-width="2.2"/>' +
        '<path d="M292 238C262 238 240 222 210 228C190 232 188 254 204 256C216 257 218 244 208 242"/>' +
        '<path d="M308 238C338 238 360 222 390 228C410 232 412 254 396 256C384 257 382 244 392 242"/>' +
        '<path d="M300 228L309 238L300 248L291 238Z" fill="' + TONO + '"/>' +
        '<path d="M190 240C168 250 150 248 140 236M410 240C432 250 450 248 460 236"/>' +
      "</g>" +
      '<text x="300" y="112" text-anchor="middle" font-family="Cinzel,Georgia,serif" font-weight="600" font-size="24" textLength="224" lengthAdjust="spacingAndGlyphs" fill="' + TONO + '">HACIENDA CAMPESTRE</text>' +
      '<text x="300" y="184" text-anchor="middle" font-family="Cinzel,Georgia,serif" font-weight="700" font-size="66" textLength="500" lengthAdjust="spacingAndGlyphs" fill="' + TONO + '">LA INMACULADA</text>' +
    "</svg>";

  function palma(x, y, escala, voltear) {
    var s = escala, f = voltear ? -1 : 1;
    var hojas = [[-70, -10], [-45, -38], [0, -52], [45, -38], [70, -8], [-30, 18], [32, 20]];
    var h = hojas.map(function (d) {
      var ex = x + d[0] * s * f, ey = y - 120 * s + d[1] * s;
      var cx = x + d[0] * s * f * 0.4, cy = y - 150 * s + d[1] * s * 0.2;
      return '<path d="M' + x + " " + (y - 120 * s) + "Q" + cx.toFixed(1) + " " + cy.toFixed(1) + " " + ex.toFixed(1) + " " + ey.toFixed(1) + '" stroke="' + TONO + '" stroke-width="' + (8 * s).toFixed(1) + '" stroke-linecap="round" fill="none"/>';
    }).join("");
    return '<path d="M' + x + " " + y + "C" + (x - 6 * s * f) + " " + (y - 50 * s) + " " + (x + 8 * s * f) + " " + (y - 90 * s) + " " + x + " " + (y - 120 * s) + '" stroke="' + TONO + '" stroke-width="' + (7 * s).toFixed(1) + '" fill="none" stroke-linecap="round"/>' + h;
  }

  var NICOLAS =
    '<svg viewBox="0 0 600 340" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Hacienda San Nicolás, Santo Tomás">' +
      '<defs><clipPath id="snCielo"><rect x="0" y="0" width="600" height="190"/></clipPath></defs>' +
      '<circle cx="300" cy="190" r="112" fill="none" stroke="' + TONO + '" stroke-width="6" clip-path="url(#snCielo)"/>' +
      '<circle cx="300" cy="190" r="84" fill="' + TONO + '" clip-path="url(#snCielo)"/>' +
      palma(158, 194, 0.9, false) + palma(452, 192, 1, true) +
      '<path d="M354 186V156L384 136L414 156V186Z" fill="' + FONDO + '" stroke="' + TONO + '" stroke-width="5" stroke-linejoin="round"/>' +
      '<rect x="377" y="164" width="14" height="22" fill="' + TONO + '"/>' +
      '<path d="M40 194C150 176 230 182 300 188C382 196 470 176 560 190V250H40Z" fill="' + TONO + '"/>' +
      '<text x="300" y="228" text-anchor="middle" font-family="Montserrat,Arial,sans-serif" font-weight="800" font-size="22" textLength="190" lengthAdjust="spacingAndGlyphs" fill="' + FONDO + '">HACIENDA</text>' +
      '<text x="300" y="302" text-anchor="middle" font-family="Yellowtail,\'Brush Script MT\',cursive" font-size="88" fill="' + TONO + '" stroke="' + FONDO + '" stroke-width="8" paint-order="stroke" textLength="400" lengthAdjust="spacingAndGlyphs">San Nicolás</text>' +
      '<text x="300" y="334" text-anchor="middle" font-family="Montserrat,Arial,sans-serif" font-weight="700" font-size="20" textLength="190" lengthAdjust="spacingAndGlyphs" fill="' + TONO + '">SANTO TOMÁS</text>' +
    "</svg>";

  window.LOGOS_PROYECTOS = {
    "San Nicolás": NICOLAS,
    "Las Mercedes": MERCEDES,
    "La Inmaculada": INMACULADA,
    "Monte Olimpo": '<img class="logo-mo" src="../assets/img/logos/monte-olimpo-marfil.png" alt="Monte Olimpo · Desarrollo campestre">',
    "Santa Clara": '<img src="../assets/img/santa-clara-logo-blanco.png" alt="Santa Clara · Poblado Campestre">'
  };
})();
