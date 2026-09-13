(function () {
  "use strict";

  var URL = (window.APPSCRIPT_URL || "").trim();

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
  function apiGet(params) {
    var qs = new URLSearchParams(params).toString();
    return fetch(URL + (qs ? "?" + qs : "")).then(function (r) { return r.json(); });
  }

  function apiPost(body) {
    return fetch(URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(body)
    }).then(function (r) { return r.json(); });
  }

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

    pintarEstado();
    ajustarEscala();
  }

  /** Aplica la ocupación real (viene del backend) sobre el plano. */
  function pintarEstado() {
    var celdas = document.querySelectorAll(".cas-cell");
    celdas.forEach(function (celda) {
      var estado = estadoPuertas[celda.dataset.num];
      if (estado === "Ocupado") {
        celda.classList.remove("free");
        celda.classList.add("alquilado");
      } else {
        celda.classList.remove("alquilado");
        celda.classList.add("free");
        celda.addEventListener("click", toggleSeleccion);
      }
    });
  }

  /* -------------------------------------------------------------------------
     Selección de puertas y modal
     ------------------------------------------------------------------------- */
  function toggleSeleccion() {
    if (enviando) return;
    var celda = this;

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
    if (!celular)  return mensaje("resp-modal", "Escribe tu celular (9 dígitos).", true);
    if (!/^9\d{8}$/.test(celular))
      return mensaje("resp-modal", "El celular debe tener 9 dígitos y empezar con 9.", true);
    if (!voucher)  return mensaje("resp-modal", "Adjunta el voucher de pago.", true);
    if (voucher.size > 5 * 1024 * 1024)
      return mensaje("resp-modal", "El voucher no debe superar los 5 MB.", true);
    if (!URL || URL.indexOf("script.google.com") === -1)
      return mensaje("resp-modal", "Falta configurar window.APPSCRIPT_URL.", true);

    enviando = true;
    var btn = document.getElementById("confirmBtn");
    btn.disabled = true;
    btn.textContent = "Registrando…";

    var numLista = seleccion.map(function (c) { return c.dataset.num; });

    archivoABase64(voucher).then(function (b64) {
      return apiPost({
        accion: "registrar",
        codigo: codigo,
        nombre: nombre,
        ciclo: ciclo,
        correo: correo,
        telefono: celular,
        casillero: numLista,
        voucherNombre: voucher.name,
        voucherBase64: b64
      });
    }).then(function (res) {
      enviando = false;
      btn.disabled = false;
      btn.textContent = "Confirmar";

      if (!res.ok) return mensaje("resp-modal", res.error || "Error del servidor.", true);

      // Las puertas quedaron ocupadas.
      seleccion.forEach(function (c) {
        c.classList.remove("selected", "free");
        c.classList.add("alquilado");
        estadoPuertas[c.dataset.num] = "Ocupado";
      });
      actualizarContador();
      mensaje("resp-reservar",
        "Puertas asignadas: " + (res.asignados || []).join(", ") +
        ". Vigencia hasta " + res.vencimiento + ".", false);
      cerrarModal();
    }).catch(function (err) {
      enviando = false;
      btn.disabled = false;
      btn.textContent = "Confirmar";
      mensaje("resp-modal", "No se pudo conectar con el servidor. Revisa que el Web App esté publicado y accesible.", true);
    });
  }

  /* -------------------------------------------------------------------------
     Consultar / Renovar
     ------------------------------------------------------------------------- */
  function consultar(ev) {
    ev.preventDefault();
    var codigo = document.getElementById("consultar-codigo").value.trim();
    if (!codigo) return;
    mensaje("consultar-resultado", "Consultando…", false);

    apiGet({ accion: "consultar", codigo: codigo }).then(function (res) {
      var cont = document.getElementById("consultar-resultado");
      cont.classList.remove("oculto");

      if (!res.ok) {
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
        html += "<div class=\"cas-dato\"><span>Vence</span><strong>" + esc(fila.vencimiento) + "</strong></div>";
        html += "<div class=\"cas-dato\"><span>Estado</span><strong><span class=\"estado-badge " + esc(fila.estado) + "\">" + esc(fila.estado) + "</span></strong></div>";
      });
      cont.innerHTML = html + "</div>";
    }).catch(function () {
      cont.innerHTML = "<p class=\"err\">No se pudo conectar con el servidor.</p>";
    });
  }

  function renovar(ev) {
    ev.preventDefault();
    var codigo = document.getElementById("renovar-codigo").value.trim();
    if (!codigo) return;

    var cont = document.getElementById("renovar-resultado");
    cont.classList.remove("oculto");
    cont.innerHTML = "<p>Renovando…</p>";

    apiPost({ accion: "renovar", codigo: codigo }).then(function (res) {
      if (!res.ok) {
        cont.innerHTML = "<p class=\"err\">" + esc(res.error || "Error.") + "</p>";
        return;
      }
      cont.innerHTML = "<p>Casillero(s) <strong>" + esc(res.casillero) + "</strong> renovado(s) " +
                       "hasta <strong>" + esc(res.puertas[0].nuevo_vencimiento) + "</strong>.</p>";
      refrescarEstado();
    }).catch(function () {
      cont.innerHTML = "<p class=\"err\">No se pudo conectar con el servidor.</p>";
    });
  }

  /* -------------------------------------------------------------------------
     Estado general del plano (contador + ocupación)
     ------------------------------------------------------------------------- */
  function refrescarEstado() {
    if (!URL) {
      document.getElementById("libres-num").textContent = "—";
      mensaje("resp-reservar", "Falta configurar window.APPSCRIPT_URL.", true);
      return;
    }
    apiGet({ accion: "estado" }).then(function (res) {
      if (!res.ok) throw new Error(res.error || "Error");
      // Reconstruye estadoPuertas y repinta el plano.
      estadoPuertas = {};
      res.data.puertas.forEach(function (p) { estadoPuertas[p.n] = p.estado; });
      document.getElementById("libres-num").textContent = res.data.libres;
      pintarEstado();
    }).catch(function () {
      document.getElementById("libres-num").textContent = "—";
      mensaje("resp-reservar",
        "No se pudo cargar el estado. Verifica que el Web App esté publicado con acceso a 'Cualquier usuario'.", true);
    });
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
     Escala del plano (se adapta al ancho de la ventana)
     ------------------------------------------------------------------------- */
  function ajustarEscala() {
    var stage = document.getElementById("stage");
    var avail = Math.min(window.innerWidth, window.innerHeight * 2) - 60;
    var scale = Math.min(1, avail / stage.scrollWidth);
    stage.style.transform = "scale(" + scale + ")";
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
        this.value = this.value.replace(/\D/g, "").slice(0, 20);
      });
    });
    document.getElementById("f-celular").addEventListener("input", function () {
      this.value = this.value.replace(/\D/g, "").slice(0, 9);
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    initTabs();
    initInputs();
    initDrop();

    document.getElementById("cancelBtn").addEventListener("click", cerrarModal);
    document.getElementById("form-inscripcion").addEventListener("submit", enviarInscripcion);
    document.getElementById("form-consultar").addEventListener("submit", consultar);
    document.getElementById("form-renovar").addEventListener("submit", renovar);

    window.addEventListener("resize", ajustarEscala);

    construirPlano();
    refrescarEstado();
  });
})();