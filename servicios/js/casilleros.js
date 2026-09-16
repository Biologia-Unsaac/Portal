(function () {
  "use strict";

  var API_URL = (window.APPSCRIPT_URL || "").trim();

  /* Frescura máxima del estado guardado localmente (ms). 2 min: la mayoría de
     visitas se pintan al instante desde caché y se revalidan en segundo plano;
     el plano de casilleros cambia pocas veces al día, no necesita 15 s. */
  var ESTADO_TTL = 120000;
  var ESTADO_CACHE_KEY = "cas_estado_v1";

  /* Máximos intentos (contando el primero) antes de mostrar el error al
     usuario. No hay timeout: si tarda, el usuario espera con el mensaje
     "Consultando…" visible. */
  var MAX_INTENTOS = 3;

  /* -------------------------------------------------------------------------
     CONFIGURACIÓN DEL PLANO (68 puertas: serie A azul + serie C celeste)
     ------------------------------------------------------------------------- */
  var FILAS = 4;
  var GRUPOS = [
    { tipo: "A", cols: 3 },
    { tipo: "A", cols: 3 },
    { tipo: "C", cols: 4 },
    { tipo: "C", cols: 4 },
    { tipo: "A", cols: 3 }
  ];

  var estadoPuertas = {};   // numero -> "Disponible" | "Ocupado"
  var seleccion = [];       // celdas seleccionadas (elementos)
  var enviando = false;

  /* -------------------------------------------------------------------------
     Utilidades de red
     ------------------------------------------------------------------------- */

  /** Convierte la respuesta en objeto. Si el backend devuelve algo que no es
   *  JSON (p.ej. una página de error de Apps Script), arma un mensaje claro
   *  en vez de romper el fetch y mostrar "no se pudo conectar" sin detalles. */
  function leerJson(resp) {
    return resp.text().then(function (texto) {
      try { return JSON.parse(texto); }
      catch (e) {
        var fragmento = String(texto || "").replace(/\s+/g, " ").slice(0, 120);
        return { ok: false, error: "El servidor respondió algo que no era JSON" +
          (fragmento ? ": «" + fragmento + "…»" : "") +
          ". ¿publicaste la nueva versión del Web App?" };
      }
    });
  }

  function apiGet(params) {
    var qs = new URLSearchParams(params).toString();
    return fetch(API_URL + (qs ? "?" + qs : "")).then(leerJson);
  }

  function apiPost(body) {
    return fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(body)
    }).then(leerJson);
  }

  /** ¿Falla transitoria? solo cuando el Web App respondió algo que no era
   *  JSON (p.ej. página HTML de error de Apps Script en arranque en frío).
   *  Los errores de negocio reales (ok:false con "No se encontró...") NO
   *  se reintentan. */
  function esFalloTransitorio(res) {
    return res && res.ok === false && /no era JSON/.test(res.error || "");
  }

  /* Usa el fetch anticipado lanzado desde el <head> de la página si todavía
     no fue consumido; si no, hace una llamada normal. */
  function descargarEstado() {
    var p = window.__estadoFetch;
    if (p) { window.__estadoFetch = null; return p; }
    return apiGet({ accion: "estado" });
  }

  function estadoDesdeCache() {
    try {
      var obj = JSON.parse(sessionStorage.getItem(ESTADO_CACHE_KEY) || "null");
      if (obj && obj.datos && obj.datos.puertas) return obj;
    } catch (e) {}
    return null;
  }

  function estadoGuardarCache(datos) {
    try {
      sessionStorage.setItem(ESTADO_CACHE_KEY, JSON.stringify({ ts: Date.now(), datos: datos }));
    } catch (e) {}
  }

  function estadoBorrarCache() {
    try { sessionStorage.removeItem(ESTADO_CACHE_KEY); } catch (e) {}
  }

  /* Comprime/escala imágenes de voucher ANTES de subirlas: una foto de cámara
     puede pesar 5-12 MB y trabar la carga en el gestor. PDFs y otros archivos
     se envían tal cual (máx. ~1280 px de lado mayor, JPEG ~82%). */
  function escalarImagen(file, maxLado, calidad) {
    return new Promise(function (resolve) {
      if (!file.type || file.type.indexOf("image/") !== 0 ||
          !/^image\/(jpeg|png|gif|webp|bmp)$/i.test(file.type)) { resolve(file); return; }
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        var ladoMayor = Math.max(img.width, img.height);
        var escala = Math.min(1, maxLado / (ladoMayor || 1));
        if (escala >= 1) { URL.revokeObjectURL(url); resolve(file); return; }
        var ancho = Math.max(1, Math.round(img.width * escala));
        var alto  = Math.max(1, Math.round(img.height * escala));
        var canvas = document.createElement("canvas");
        canvas.width = ancho; canvas.height = alto;
        var ctx = canvas.getContext("2d");
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, ancho, alto);
        ctx.drawImage(img, 0, 0, ancho, alto);
        URL.revokeObjectURL(url);
        canvas.toBlob(function (blob) {
          if (!blob) { resolve(file); return; }
          var base = (file.name || "voucher").replace(/\.[^.]*$/, "");
          resolve(new File([blob], base + ".jpg", { type: "image/jpeg" }));
        }, "image/jpeg", calidad);
      };
      img.onerror = function () { URL.revokeObjectURL(url); resolve(file); };
      img.src = url;
    });
  }

  function prepararVoucher(file) { return escalarImagen(file, 1280, 0.82); }
  function esImagen(file) { return !!(file && /^image\//.test(file.type || "")); }

  // Convierte un File a base64 (sin el prefijo "data:...;base64,").
  function archivoABase64(file) {
    return new Promise(function (resolve, reject) {
      var lector = new FileReader();
      lector.onload = function () {
        var data = String(lector.result);
        var coma = data.indexOf(",");
        resolve(coma === -1 ? data : data.slice(coma + 1));
      };
      lector.onerror = reject;
      lector.readAsDataURL(file);
    });
  }

  /* -------------------------------------------------------------------------
     Construcción del plano
     ------------------------------------------------------------------------- */
  function construirPlano() {
    var stage = document.getElementById("stage");
    stage.innerHTML = "";
    stage.classList.remove("oculto");

    var numPorSerie = { A: 0, C: 0 };

    GRUPOS.forEach(function (grupo) {
      var seccion = document.createElement("section");
      seccion.className = "cas-locker-group " + (grupo.tipo === "A" ? "azul" : "celeste");
      seccion.style.gridTemplateColumns = "repeat(" + grupo.cols + ", var(--cas-cell-w))";

      var rejilla = document.createElement("div");
      rejilla.className = "cas-grid";
      rejilla.style.gridTemplateColumns = "repeat(" + grupo.cols + ", var(--cas-cell-w))";

      for (var f = 0; f < FILAS; f++) {
        for (var c = 0; c < grupo.cols; c++) {
          numPorSerie[grupo.tipo]++;

          var celda = document.createElement("div");
          celda.className = "cas-cell free";
          celda.dataset.num = grupo.tipo + numPorSerie[grupo.tipo];

          var tag = document.createElement("span");
          tag.className = "cas-tag";
          tag.textContent = grupo.tipo;
          celda.appendChild(tag);

          var num = document.createElement("span");
          num.className = "cas-num";
          num.textContent = numPorSerie[grupo.tipo];
          celda.appendChild(num);

          rejilla.appendChild(celda);
        }
      }

      seccion.appendChild(rejilla);
      stage.appendChild(seccion);
    });

    // NO llamar pintarEstado() aquí: el plano nace vacío y se colorea cuando
    // llega la respuesta del servidor (aplicarEstado). Evita un flash inicial
    // de "todo verde" aunque haya casilleros ocupados.
    ajustarEscala();
  }

  /** Aplica la ocupación real (viene del backend) sobre el plano.
   *  Solo cambia clases; los clicks se manejan por delegación en #stage. */
  function pintarEstado() {
    var celdas = document.querySelectorAll(".cas-cell");
    celdas.forEach(function (celda) {
      var estado = estadoPuertas[celda.dataset.num];
      celda.classList.remove("alquilado", "observado");
      if (estado === "En Observación") {
        celda.classList.add("observado");
      } else if (estado === "Ocupado") {
        celda.classList.add("alquilado");
      } else {
        celda.classList.add("free");
      }
    });
  }

  /* -------------------------------------------------------------------------
     Selección de puertas y modal
     ------------------------------------------------------------------------- */
  function toggleSeleccion(celda) {
    if (enviando) return;

    var i = seleccion.indexOf(celda);
    if (i === -1) {
      celda.classList.add("selected");
      seleccion.push(celda);
    } else {
      celda.classList.remove("selected");
      seleccion.splice(i, 1);
    }
    refrescarModal();
  }

  function refrescarModal() {
    var modal = document.getElementById("modal");
    var selList = document.getElementById("selList");

    if (seleccion.length === 0) {
      cerrarModal();
      return;
    }
    selList.textContent = seleccion
      .map(function (c) { return c.dataset.num; })
      .join(", ");
    modal.classList.remove("hidden");
  }

  function cerrarModal() {
    document.getElementById("modal").classList.add("hidden");
    seleccion.forEach(function (c) { c.classList.remove("selected"); });
    seleccion = [];
    document.getElementById("form-inscripcion").reset();
    var drop = document.getElementById("drop");
    var input = document.getElementById("f-vaucher");
    drop.innerHTML = "Arrastra o haz clic para subir el voucher";
    drop.appendChild(input);
    mensaje("resp-modal", "", false);
  }

  /* -------------------------------------------------------------------------
     Envío de la inscripción
     ------------------------------------------------------------------------- */
  function enviarInscripcion(ev) {
    ev.preventDefault();
    if (enviando || seleccion.length === 0) return;

    var nombre   = document.getElementById("f-nombre").value.trim();
    var codigo   = document.getElementById("f-codigo").value.trim();
    var celular  = document.getElementById("f-celular").value.trim();
    var ciclo    = document.getElementById("f-ciclo").value;
    var correo   = document.getElementById("f-correo").value.trim();
    var voucher  = document.getElementById("f-vaucher").files[0];

    if (!nombre)   return mensaje("resp-modal", "Escribe tu nombre completo.", true);
    if (!codigo)   return mensaje("resp-modal", "Escribe tu código universitario.", true);
    if (!/^\d{6}$/.test(codigo))
      return mensaje("resp-modal", "El código universitario debe tener 6 dígitos.", true);
    if (!celular)  return mensaje("resp-modal", "Escribe tu celular (9 dígitos).", true);
    if (!/^9\d{8}$/.test(celular))
      return mensaje("resp-modal", "El celular debe tener 9 dígitos y empezar con 9.", true);
    if (!voucher)  return mensaje("resp-modal", "Adjunta el voucher de pago.", true);
    if (voucher.size > (esImagen(voucher) ? 25 * 1024 * 1024 : 5 * 1024 * 1024))
      return mensaje("resp-modal", "El voucher no debe superar los 5 MB.", true);
    if (!API_URL || API_URL.indexOf("script.google.com") === -1)
      return mensaje("resp-modal", "Falta configurar window.APPSCRIPT_URL.", true);

    enviando = true;
    var btn = document.getElementById("confirmBtn");
    btn.disabled = true;
    btn.textContent = "Registrando…";

    var numLista = seleccion.map(function (c) { return c.dataset.num; });

    prepararVoucher(voucher).then(function (archivo) {
      return archivoABase64(archivo).then(function (b64) {
        return apiPost({
          accion: "registrar",
          codigo: codigo,
          nombre: nombre,
          ciclo: ciclo,
          correo: correo,
          telefono: celular,
          casillero: numLista,
          voucherNombre: archivo.name,
          voucherBase64: b64
        });
      });
    }).then(function (res) {
      enviando = false;
      btn.disabled = false;
      btn.textContent = "Confirmar";

      if (!res.ok) {
        var msg = res.error || "Error del servidor.";
        if (esFalloTransitorio(res))
          msg += " Tu solicitud puede haberse procesado; recarga y verifica antes de reintentar.";
        return mensaje("resp-modal", msg, true);
      }

      // La puerta quedó en revisión (amarilla) esperando la aprobación del gestor.
      seleccion.forEach(function (c) {
        c.classList.remove("selected", "free");
        c.classList.add("observado");
        estadoPuertas[c.dataset.num] = "En Observación";
      });
      // El snapshot guardado quedó viejo: forzar descarga en la próxima visita.
      estadoBorrarCache();
      actualizarContador();
      mensaje("resp-reservar",
        "Casillero " + (res.casillero || "") + " en revisión. El gestor validará tu voucher; mientras tanto se muestra en amarillo.", false);
      cerrarModal();
    }).catch(function (err) {
      enviando = false;
      btn.disabled = false;
      btn.textContent = "Confirmar";
      mensaje("resp-modal", "No se pudo enviar tu solicitud. Verifica tu conexión y vuelve a intentar en unos minutos. [" + nombreError(err) + "]", true);
    });
  }

  /* -------------------------------------------------------------------------
     Consultar / Renovar
     ------------------------------------------------------------------------- */
  function consultar(ev) {
    ev.preventDefault();
    var codigo = document.getElementById("consultar-codigo").value.trim();
    if (!codigo) return;
    consultarIntento(codigo, 1);
  }

  function consultarIntento(codigo, intento) {
    var mensajeConsulta = "Consultando…" + (intento > 1 ? " (reintento " + (intento - 1) + " de " + MAX_INTENTOS + ")" : "");
    mensaje("consultar-resultado", mensajeConsulta, false);

    apiGet({ accion: "consultar", codigo: codigo }).then(function (res) {
      var cont = document.getElementById("consultar-resultado");
      cont.classList.remove("oculto");

      if (!res.ok) {
        if (intento < MAX_INTENTOS && esFalloTransitorio(res)) {
          setTimeout(function () { consultarIntento(codigo, intento + 1); }, 3000);
          return;
        }
        cont.innerHTML = "<p class=\"err\">" + esc(res.error || "Error.") + "</p>";
        return;
      }
      if (!res.data || res.data.length === 0) {
        cont.innerHTML = "<p>No hay registros.</p>";
        return;
      }

      var html = "<p><strong>" + esc(res.data[0].nombre) + "</strong> · " +
                 esc(res.data[0].codigo) + "</p><div class=\"cas-tarjeta-estado\">";
      res.data.forEach(function (fila) {
        html += "<div class=\"cas-dato\"><span>Casillero</span><strong>" + esc(fila.casillero) + "</strong></div>";
        html += "<div class=\"cas-dato\"><span>Semestre</span><strong>" + esc(fila.semestre || "—") + "</strong></div>";
        html += "<div class=\"cas-dato\"><span>Vence</span><strong>" + esc(fila.vencimiento) + "</strong></div>";
        html += "<div class=\"cas-dato\"><span>Estado</span><strong><span class=\"estado-badge " + badgeDe(fila.estado) + "\">" + esc(fila.estado) + "</span></strong></div>";
      });
      cont.innerHTML = html + "</div>";
    }).catch(function (err) {
      var cont = document.getElementById("consultar-resultado");
      cont.classList.remove("oculto");
      if (intento < MAX_INTENTOS) {
        setTimeout(function () { consultarIntento(codigo, intento + 1); }, 3000);
        return;
      }
      cont.innerHTML = "<p class=\"err\">No se pudo consultar. Revisa tu conexión o vuelve a intentar en unos minutos. [" + nombreError(err) + "]</p>";
    });
  }

  /** Clase CSS segura para el badge según el estado del registro. */
  function badgeDe(estado) {
    var mapa = { "Activo": "Activo", "En Observación": "Pendiente", "Vencido": "Vencido", "Liberado": "Liberado" };
    return mapa[estado] || "Pendiente";
  }

  function renovar(ev) {
    ev.preventDefault();
    var codigo = document.getElementById("renovar-codigo").value.trim();
    var voucher = document.getElementById("renovar-voucher").files[0];
    if (!codigo) return;
    if (!voucher) {
      mensajeRenovar("Adjunta el voucher de tu renovación.", true);
      return;
    }
    if (voucher.size > (esImagen(voucher) ? 25 * 1024 * 1024 : 5 * 1024 * 1024)) {
      mensajeRenovar("El voucher no debe superar los 5 MB.", true);
      return;
    }

    var cont = document.getElementById("renovar-resultado");
    cont.classList.remove("oculto");
    cont.innerHTML = "<p>Enviando renovación…</p>";

    prepararVoucher(voucher).then(function (archivo) {
      return archivoABase64(archivo).then(function (b64) {
        return apiPost({
          accion: "renovar",
          codigo: codigo,
          voucherNombre: archivo.name,
          voucherBase64: b64
        });
      });
    }).then(function (res) {
      if (res.motivo === "sin_registro") {
        cont.innerHTML =
          "<p class=\"err\">" + esc(res.error || "No tienes un registro anterior.") + "</p>" +
          "<p>Si ya pagaste, se registrará como <strong>reserva nueva</strong>.</p>" +
          "<button type=\"button\" class=\"cas-btn cas-btn-primary\" id=\"ir-a-reservar\">Ir a reservar</button>";
        var btn = document.getElementById("ir-a-reservar");
        if (btn) btn.addEventListener("click", function () {
          activarTab("reservar");
        });
        return;
      }
      if (!res.ok) {
        var msgRen = res.error || "Error.";
        if (esFalloTransitorio(res))
          msgRen += " Tu renovación puede haberse enviado; recarga y verifica antes de reintentar.";
        cont.innerHTML = "<p class=\"err\">" + esc(msgRen) + "</p>";
        return;
      }
      cont.innerHTML = "<p>Tu renovación del casillero <strong>" + esc(res.casillero) +
                       "</strong> está <strong>en revisión</strong>. El gestor la aprobará al validar tu pago.</p>";
      refrescarEstado(true);
    }).catch(function (err) {
      mensajeRenovar("No se pudo enviar tu renovación. Verifica tu conexión y vuelve a intentar en unos minutos. [" + nombreError(err) + "]", true);
    });
  }

  function mensajeRenovar(texto, esError) {
    var cont = document.getElementById("renovar-resultado");
    cont.classList.remove("oculto");
    cont.innerHTML = "<p class=\"" + (esError ? "err" : "ok") + "\">" + esc(texto) + "</p>";
  }

  /** Cambia a la pestaña indicada (data-tab). */
  function activarTab(nombre) {
    document.querySelectorAll(".cas-tab").forEach(function (tab) {
      tab.classList.remove("active");
      document.getElementById("panel-" + tab.dataset.tab).classList.remove("active");
      if (tab.dataset.tab === nombre) tab.classList.add("active");
    });
    document.getElementById("panel-" + nombre).classList.add("active");
  }

  /* -------------------------------------------------------------------------
     Estado general del plano (contador + ocupación)
     - Caché local (sessionStorage) con TTL: recargas/regresos al instante.
     - Stale-while-revalidate: si hay snapshot fresco lo pinta primero y
       refresca en segundo plano para no mostrar datos viejos por mucho rato.
     ------------------------------------------------------------------------- */
  function refrescarEstado(fuerza) {
    if (!API_URL) {
      document.getElementById("libres-num").textContent = "—";
      mensaje("resp-reservar", "Falta configurar window.APPSCRIPT_URL.", true);
      return;
    }

    // Sin datos todavía: no pintar "0 disponibles" prematuro mientras carga.
    if (Object.keys(estadoPuertas).length === 0) {
      document.getElementById("libres-num").textContent = "…";
    }

    var cache = estadoDesdeCache();
    if (!fuerza && cache && (Date.now() - cache.ts) < ESTADO_TTL) {
      aplicarEstado(cache.datos);
      descargarEstado().then(function (res) {
        if (res && res.ok) {
          estadoGuardarCache(res.data);
          aplicarEstado(res.data);
        }
      }).catch(function () {});
      return;
    }
    cargarEstadoDesdeRed();
  }

  function cargarEstadoDesdeRed(intento) {
    intento = intento || 1;
    var stage = document.getElementById("stage");
    if (stage && !stage.dataset.cargado) stage.style.opacity = "0.4";
    mensaje("resp-reservar", "Consultando…", false);

    descargarEstado().then(function (res) {
      if (stage) { stage.style.opacity = ""; stage.dataset.cargado = "1"; }
      if (res && res.ok) {
        mensaje("resp-reservar", "", false);
        estadoGuardarCache(res.data);
        aplicarEstado(res.data);
      } else if (intento < MAX_INTENTOS && esFalloTransitorio(res)) {
        /* Respuesta HTML del echo (arranque en frío): reintentar. */
        setTimeout(function () {
          mensaje("resp-reservar", "Consultando… (reintento " + intento + " de " + MAX_INTENTOS + ")", false);
          cargarEstadoDesdeRed(intento + 1);
        }, 3000);
      } else {
        mostrarErrorEstado(res && res.error || "Error del servidor.");
      }
    }).catch(function (err) {
      if (stage) stage.style.opacity = "";
      if (intento < MAX_INTENTOS) {
        setTimeout(function () {
          mensaje("resp-reservar", "Consultando… (reintento " + intento + " de " + MAX_INTENTOS + ")", false);
          cargarEstadoDesdeRed(intento + 1);
        }, 3000);
        return;
      }
      mostrarErrorEstado("No se pudo consultar el estado. Revisa tu conexión o vuelve a intentar en unos minutos. [" + nombreError(err) + "]");
    });
  }

  function aplicarEstado(data) {
    estadoPuertas = {};
    data.puertas.forEach(function (p) { estadoPuertas[p.n] = p.estado; });
    document.getElementById("libres-num").textContent = data.libres;
    var sem = document.getElementById("semestre-cr");
    if (sem) {
      sem.textContent = data.semestre
        ? "Semestre lectivo: " + data.semestre
        : "Semestre no configurado";
    }
    pintarEstado();
  }

  function mostrarErrorEstado(msg) {
    document.getElementById("libres-num").textContent = "—";
    mensaje("resp-reservar", msg || "No se cargó el estado.", true);
  }

  function actualizarContador() {
    var libres = 0;
    Object.keys(estadoPuertas).forEach(function (k) {
      if (estadoPuertas[k] === "Disponible") libres++;
    });
    document.getElementById("libres-num").textContent = libres;
  }

  /* -------------------------------------------------------------------------
     Pestañas
     ------------------------------------------------------------------------- */
  function initTabs() {
    document.querySelectorAll(".cas-tab").forEach(function (tab) {
      tab.addEventListener("click", function () {
        document.querySelectorAll(".cas-tab").forEach(function (t) { t.classList.remove("active"); });
        document.querySelectorAll(".cas-panel").forEach(function (p) { p.classList.remove("active"); });
        tab.classList.add("active");
        document.getElementById("panel-" + tab.dataset.tab).classList.add("active");
      });
    });
  }

  /* -------------------------------------------------------------------------
     Escala del plano.
     - Pantallas amplias: reduce hasta caber dentro del contenedor real
       (no del window), para que nunca se recorte el primer módulo.
     - Pantallas angostas (celulares): NO encoge; las puertas quedan legibles
       y el plano se desplaza con scroll horizontal (estilo swipe).
     ------------------------------------------------------------------------- */
  function ajustarEscala() {
    var stage = document.getElementById("stage");
    var wrap  = document.querySelector(".cas-stage-wrap");

    if (window.innerWidth < 720) {
      stage.style.transform = "none";
      wrap.classList.add("scroll");
      wrap.style.overflowX = "auto";
      return;
    }

    wrap.classList.remove("scroll");
    var ancho = wrap.clientWidth || 800;
    var scale = Math.min(1, ancho / stage.scrollWidth);
    stage.style.transform = "scale(" + scale + ")";
    // Si queda recortado visualmente, no se usa scroll: sale centrado entero.
    wrap.style.overflowX = scale < 1 ? "hidden" : "auto";
  }

  /* -------------------------------------------------------------------------
     Utilidades misceláneas
     ------------------------------------------------------------------------- */
  function mensaje(id, texto, esError) {
    var el = document.getElementById(id);
    el.textContent = texto;
    el.className = "cas-respuesta " + (esError ? "err" : "ok");
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  /** Nombre corto del tipo de error recibido (para depurar). */
  function nombreError(err) {
    var n = (err && err.name) || "red";
    return String(n).slice(0, 40);
  }

  function initDrop() {
    var input = document.getElementById("f-vaucher");
    var drop = document.getElementById("drop");
    drop.addEventListener("click", function () { input.click(); });
    drop.addEventListener("dragover", function (e) {
      e.preventDefault();
      drop.classList.add("hover");
    });
    drop.addEventListener("dragleave", function () { drop.classList.remove("hover"); });
    drop.addEventListener("drop", function (e) {
      e.preventDefault();
      drop.classList.remove("hover");
      if (e.dataTransfer.files.length) input.files = e.dataTransfer.files;
      mostrarArchivo();
    });
    input.addEventListener("change", mostrarArchivo);

    function mostrarArchivo() {
      var f = input.files[0];
      drop.innerHTML = f ? "Adjuntado: " + f.name : "Arrastra o haz clic para subir el voucher";
      drop.appendChild(input);
    }
  }

  function initInputs() {
    ["f-codigo", "consultar-codigo", "renovar-codigo"].forEach(function (id) {
      document.getElementById(id).addEventListener("input", function () {
        this.value = this.value.replace(/\D/g, "").slice(0, 6);
      });
    });
    document.getElementById("f-celular").addEventListener("input", function () {
      this.value = this.value.replace(/\D/g, "").slice(0, 9);
    });

    // El correo universitario es el código @unsaac.edu.pe: se autocompleta.
    document.getElementById("f-codigo").addEventListener("input", function () {
      var correo = document.getElementById("f-correo");
      if (this.value.length === 6 && (!correo.value || /^\d{6}@unsaac\.edu\.pe$/.test(correo.value))) {
        correo.value = this.value + "@unsaac.edu.pe";
      }
    });
  }

  /* -------------------------------------------------------------------------
     Huevo de pascua: 5 toques en la tarjeta de disponibles = Ley Sam
     ------------------------------------------------------------------------- */
  function initLeySamuel() {
    var card = document.getElementById("libres-card");
    var toques = 0;
    card.addEventListener("click", function () {
      toques++;
      if (toques === 5) {
        toques = 0;
        mensaje("resp-reservar", "Solo puedes reservar UN casillero a la vez. — Ley Sam", false);
        setTimeout(function () { mensaje("resp-reservar", "", false); }, 6000);
      }
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    initTabs();
    initInputs();
    initDrop();
    initLeySamuel();

    document.getElementById("cancelBtn").addEventListener("click", cerrarModal);
    document.getElementById("form-inscripcion").addEventListener("submit", enviarInscripcion);
    document.getElementById("form-consultar").addEventListener("submit", consultar);
    document.getElementById("form-renovar").addEventListener("submit", renovar);

    // Delegación: un solo listener para todas las puertas del plano.
    document.getElementById("stage").addEventListener("click", function (ev) {
      var celda = ev.target.closest(".cas-cell.free");
      if (celda) toggleSeleccion(celda);
    });

    window.addEventListener("resize", ajustarEscala);

    construirPlano();
    refrescarEstado();
  });
})();