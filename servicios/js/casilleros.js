(() => {
  /* ------------------------------------------------------------------
     CASILLEROS — Frontend
     Conecta el portal con el Web App de Google Apps Script (Codigo.gs).
     URL configurable en casilleros.html (window.APPSCRIPT_URL).
     ------------------------------------------------------------------ */

  const URL_BASE = window.APPSCRIPT_URL || "";

  const $ = (id) => document.getElementById(id);

  const tabs = document.querySelectorAll(".cas-tab");
  const paneles = document.querySelectorAll(".cas-panel");

  /* ---------- Pestañas ---------- */
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      paneles.forEach((p) => p.classList.remove("active"));
      $("panel-" + tab.dataset.tab).classList.add("active");
    });
  });

  /* ---------- Utilidades de red ---------- */
  function verificarConfig() {
    if (!URL_BASE || URL_BASE.startsWith("PEGA_AQUI")) {
      return "Pendiente: pega la URL del Web App en window.APPSCRIPT_URL de casilleros.html";
    }
    return "";
  }

  // Apps Script no acepta Content-Type: application/json (provoca preflight).
  // Se envía el cuerpo como texto plano y se parsea del lado del servidor.
  async function llamarPost(accion, datos) {
    const res = await fetch(`${URL_BASE}?accion=${encodeURIComponent(accion)}`, {
      method: "POST",
      redirect: "follow",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(datos),
    });
    return res.json();
  }

  async function llamarGet(accion, params) {
    const qs = new URLSearchParams(params);
    const res = await fetch(`${URL_BASE}?accion=${encodeURIComponent(accion)}&${qs}`, {
      redirect: "follow",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  function estadoSpinner(btn, activo) {
    btn.disabled = activo;
    btn.innerHTML = activo
      ? '<span class="cas-cargando"><span class="cas-spinner"></span> Procesando...</span>'
      : btn.dataset.original;
  }

  function marcar(btn) {
    if (!btn.dataset.original) btn.dataset.original = btn.textContent;
  }

  /* ---------- Contadores de disponibilidad ---------- */
  async function actualizarDisponibles() {
    if (verificarConfig()) return;
    try {
      const datos = await llamarGet("disponibles", {});
      const n = $("libres-nuevo");
      if (n) n.textContent = (datos.ok && datos.disponibles != null) ? datos.disponibles : "–";
    } catch (_) {
      /* sin backend: se deja el guion */
    }
  }

  /* ---------- Panel: NUEVO REGISTRO ---------- */
  const formNuevo = $("form-nuevo");
  if (formNuevo) {
    marcar(formNuevo.querySelector("button[type=submit]"));
    formNuevo.addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = formNuevo.querySelector("button[type=submit]");
      const resp = $("resp-nuevo");
      resp.className = "cas-respuesta";
      resp.textContent = "";

      const fallo = verificarConfig();
      if (fallo) {
        resp.classList.add("err");
        resp.textContent = fallo;
        return;
      }

      estadoSpinner(btn, true);
      try {
        const datos = {
          codigo: $("nuevo-codigo").value.trim(),
          nombre: $("nuevo-nombre").value.trim(),
          ciclo: $("nuevo-ciclo").value,
          casillero: $("nuevo-casillero").value || "",
          correo: $("nuevo-correo").value.trim() || "",
        };
        const res = await llamarPost("registrar", datos);
        resp.classList.add(res.ok ? "ok" : "err");
        resp.textContent = res.ok
          ? `¡Listo! Tu casillero N°${res.casillero} es válido hasta el ${res.vencimiento}.`
          : res.error || "No se pudo completar el registro.";
        actualizarDisponibles();
        if (res.ok) formNuevo.reset();
      } catch (err) {
        resp.classList.add("err");
        resp.textContent = "Error de conexión con el servidor.";
      } finally {
        estadoSpinner(btn, false);
      }
    });
  }

  /* ---------- Panel: RENOVACIÓN ---------- */
  const formRenovar = $("form-renovar");
  if (formRenovar) {
    marcar(formRenovar.querySelector("button[type=submit]"));
    formRenovar.addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = formRenovar.querySelector("button[type=submit]");
      const caja = $("renovar-resultado");
      caja.className = "cas-resultado oculto";

      const fallo = verificarConfig();
      if (fallo) {
        pintarResultado(caja, false, fallo);
        return;
      }

      estadoSpinner(btn, true);
      try {
        const datos = { codigo: $("renovar-codigo").value.trim() };
        const res = await llamarPost("renovar", datos);
        pintarResultado(caja, res.ok, res.ok
          ? `Renovación exitosa. Tu casillero N°${res.casillero} ahora vence el ${res.nuevo_vencimiento}. Renovaciones: ${res.renovaciones}.`
          : (res.error || "No se pudo renovar."));
      } catch (err) {
        pintarResultado(caja, false, "Error de conexión con el servidor.");
      } finally {
        estadoSpinner(btn, false);
      }
    });
  }

  /* ---------- Panel: CONSULTA ---------- */
  const formConsultar = $("form-consultar");
  if (formConsultar) {
    marcar(formConsultar.querySelector("button[type=submit]"));
    formConsultar.addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = formConsultar.querySelector("button[type=submit]");
      const caja = $("consultar-resultado");
      caja.className = "cas-resultado oculto";

      const fallo = verificarConfig();
      if (fallo) {
        pintarResultado(caja, false, fallo);
        return;
      }

      estadoSpinner(btn, true);
      try {
        const codigo = $("consultar-codigo").value.trim();
        const res = await llamarGet("consultar", { codigo });
        if (!res.ok) {
          pintarResultado(caja, false, res.error || "Sin resultados.");
        } else {
          caja.className = "cas-resultado";
          caja.innerHTML = `
            <strong>${escapeHtml(res.nombre)}</strong>
            <div class="cas-tarjeta-estado">
              <div class="cas-dato"><span>Casillero</span><strong>N°${res.casillero}</strong></div>
              <div class="cas-dato"><span>Vigencia</span><strong>${res.vencimiento}</strong></div>
              <div class="cas-dato"><span>Renovaciones</span><strong>${res.renovaciones}</strong></div>
              <div class="cas-dato"><span>Estado</span><strong><span class="estado-badge ${res.estado}">${res.estado}</span></strong></div>
            </div>`;
        }
      } catch (err) {
        pintarResultado(caja, false, "Error de conexión con el servidor.");
      } finally {
        estadoSpinner(btn, false);
      }
    });
  }

  function pintarResultado(caja, ok, mensaje) {
    caja.className = "cas-resultado" + (ok ? "" : " cas-resultado-err");
    caja.style.color = ok ? "#0c7120" : "#b91c1c";
    caja.style.fontWeight = "600";
    caja.textContent = mensaje;
  }

  function escapeHtml(texto) {
    const d = document.createElement("div");
    d.textContent = texto;
    return d.innerHTML;
  }

  /* ---------- Carga inicial ---------- */
  actualizarDisponibles();
})();