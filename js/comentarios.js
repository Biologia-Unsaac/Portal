/* ============================================================================
   SISTEMA DE COMENTARIOS / SUGERENCIAS — FRONT
   Recibe comentarios simples desde el portal (index.html) y los envía al
   backend Apps Script (comentarios_appscript/Code.gs), que los guarda en el
   Google Sheets vinculado. No pide datos al estudiante: solo el texto.
   ============================================================================ */
(function () {
  "use strict";

  var APPSCRIPT_URL = (window.COMENTARIOS_URL || "").trim();
  var MAX_INTENTOS = 3;

  var form = document.getElementById("form-comentario");
  var area = document.getElementById("comentario-texto");
  var boton = document.getElementById("comentario-btn");
  var estado = document.getElementById("comentario-estado");
  var contador = document.getElementById("comentario-contador");
  var MAX_LEN = 600;

  if (!form || !area || !boton) return;
  if (!APPSCRIPT_URL) {
    if (estado) estado.textContent = "Sistema de comentarios no configurado aún.";
    return;
  }

  if (contador) contador.textContent = "0 / " + MAX_LEN;
  area.addEventListener("input", function () {
    if (contador) contador.textContent = area.value.length + " / " + MAX_LEN;
  });

  function nombreError(err) {
    try { if (err && err.name) return err.name; } catch (e) {}
    return "red";
  }

  function leerJson(resp) {
    return resp.text().then(function (texto) {
      try { return JSON.parse(texto); }
      catch (e) {
        var fragmento = String(texto || "").replace(/\s+/g, " ").slice(0, 120);
        return { ok: false, error: "El servidor respondió algo que no era JSON" +
          (fragmento ? ": «" + fragmento + "…»" : "") +
          ". ¿Publicaste la nueva versión del Web App?" };
      }
    });
  }

  function enviar(comentario, intento) {
    intento = intento || 1;
    if (estado) {
      estado.textContent = (intento === 1)
        ? "Enviando comentario..."
        : "Enviando comentario... (intento " + intento + " de " + MAX_INTENTOS + ")";
    }
    boton.disabled = true;

    return fetch(APPSCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ comentario: comentario })
    })
      .then(leerJson)
      .then(function (res) {
        if (res && res.ok) {
          if (estado) estado.textContent = res.msj || "¡Gracias! Tu comentario fue recibido.";
          area.value = "";
          if (contador) contador.textContent = "0 / " + MAX_LEN;
          boton.disabled = false;
          return;
        }
        var falloTransitorio = res && res.ok === false && /no era JSON/.test(res.error || "");
        if (falloTransitorio && intento < MAX_INTENTOS) {
          setTimeout(function () { enviar(comentario, intento + 1); }, 600 * intento);
          return;
        }
        if (estado) estado.textContent = (res && res.error) || "No se pudo enviar el comentario.";
        boton.disabled = false;
      })
      .catch(function (err) {
        if (intento < MAX_INTENTOS) {
          setTimeout(function () { enviar(comentario, intento + 1); }, 600 * intento);
          return;
        }
        if (estado) {
          estado.textContent = "No se pudo enviar tu comentario. Verifica tu conexión y vuelve a"
            + " intentar en unos minutos. [" + nombreError(err) + "]";
        }
        boton.disabled = false;
      });
  }

  form.addEventListener("submit", function (ev) {
    ev.preventDefault();
    enviarComentario();
  });
  if (boton && !form) boton.addEventListener("click", enviarComentario);

  function enviarComentario() {
    var comentario = area.value.replace(/\s+/g, " ").trim();
    if (!comentario) {
      if (estado) estado.textContent = "Escribe un comentario o sugerencia antes de enviar.";
      area.focus();
      return;
    }
    if (comentario.length > MAX_LEN) {
      if (estado) estado.textContent = "El comentario no puede pasar de " + MAX_LEN + " caracteres.";
      return;
    }
    enviar(comentario);
  }
})();