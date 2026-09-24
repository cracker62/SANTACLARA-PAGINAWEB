/* MONTE OLIMPO · versión de trabajo de la página de la empresa
   Pone el logo de cada proyecto en su tarjeta, los numera en orden cronológico
   y agrega Santa Clara de último, resaltado porque es el único en venta.
   Corre después de inicio.js, que es quien arma las tarjetas de los proyectos entregados. */
(function () {
  document.addEventListener("DOMContentLoaded", function () {
    var grid = document.querySelector("[data-proyectos]");
    if (!grid) return;
    var LOGOS = window.LOGOS_PROYECTOS || {};
    var SC = window.SANTA_CLARA;

    Array.prototype.forEach.call(grid.querySelectorAll(".proj"), function (card, i) {
      var cuerpo = card.querySelector(".proj__body"), img = card.querySelector(".proj__img");
      var nombre = (card.querySelector("h3") || {}).textContent;
      var logo = LOGOS[nombre];
      if (img && logo) {
        img.innerHTML = '<div class="proj__logo">' + logo + "</div>";
        img.classList.add("proj__img--logo");
      }
      if (cuerpo) {
        var orden = document.createElement("span");
        orden.className = "proj__orden";
        orden.textContent = "Proyecto " + (i + 1);
        cuerpo.insertBefore(orden, cuerpo.firstChild);
      }
    });

    var disponibles = SC ? SC.lots.filter(function (l) { return l.estado === "disponible"; }).length : null;
    var card = document.createElement("article");
    card.className = "proj proj--vivo";
    card.innerHTML =
      '<div class="proj__img proj__img--logo"><div class="proj__logo">' + (LOGOS["Santa Clara"] || "") + "</div></div>" +
      '<div class="proj__body">' +
        '<span class="proj__orden">Proyecto 5 · hoy</span>' +
        "<h3>Santa Clara</h3>" +
        '<span class="proj__loc">Palmar de Varela · Atlántico</span>' +
        '<span class="sello-vivo"><i></i>En venta' + (disponibles ? " · " + disponibles + " lotes" : "") + "</span>" +
        '<a class="btn" href="../#lotes">Conocer Santa Clara</a>' +
      "</div>";
    grid.appendChild(card);
  });
})();
