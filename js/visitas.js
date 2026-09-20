/* Contador de visitas del portal.
   Debe cargarse en TODAS las páginas (script en el <head> con defer o al final).
   Registra una visita por sesión por página en el Web App de visitas_appscript. */
(function () {
  'use strict';

  /* ============================================================
     CONFIGURACIÓN — pega aquí la URL /exec de tu Apps Script.
     (Los pasos están en servicios/visitas_appscript/README.md)
     ============================================================ */
  var URL = ""; /* ← TU URL /exec */

  if (!URL) return;

  try {
    try {
      var nombre = (location.pathname.split("/").pop() || "index").replace(/\.html?$/i, "");
    } catch (e) {
      nombre = "index";
    }
    var cuenta = "visitas:" + nombre;
    var yaContada = false;
    try { yaContada = sessionStorage.getItem(cuenta) === "1"; } catch (e) {}
    if (yaContada) return;
    try { sessionStorage.setItem(cuenta, "1"); } catch (e) {}

    var payload = {
      pagina: nombre,
      url: location.href,
      ref: document.referrer || ""
    };

    enviar(payload, 0);
  } catch (e) {
    /* el contador nunca debe romper la página */
  }

  function enviar(body, intento) {
    try {
      fetch(URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(body),
        redirect: "follow"
      }).then(function (r) {
        if (!r.ok && intento < 2) {
          setTimeout(function () { enviar(body, intento + 1); }, 1500);
        }
      }).catch(function () {
        if (intento < 2) {
          setTimeout(function () { enviar(body, intento + 1); }, 1500);
        }
      });
    } catch (e) {}
  }
})();