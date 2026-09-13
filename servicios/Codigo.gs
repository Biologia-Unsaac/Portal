/**
 * ============================================================================
 *  SISTEMA DE CASILLEROS — BACKEND (Google Apps Script · SCRIPT SUELTO)
 *  Escuela Profesional de Biología · UNSAAC
 * ----------------------------------------------------------------------------
 *  CONFIGURACIÓN:
 *  1. Crear un proyecto APPS SCRIPT SUELTO (script.google.com -> Nuevo proyecto).
 *  2. Pegar este archivo completo en Code.gs (los archivos del GESTOR van como
 *     archivo HTML "admin" -> servicios/gestor/admin.html).
 *  3. Verificar SPREADSHEET_ID y CARPETA_VOUCHER_ID abajo.
 *  4. En el editor ejecutar UNA VEZ:
 *       - setupSheets()              -> crea las 3 hojas (REGISTRO 12 cols).
 *       - configurarSemestre("2026-II","2026-08-17","2026-12-20")
 *       - configurarAdmin("TU_CLAVE")-> contraseña del gestor.
 *     (Asegúrate de aceptar Drive en los permisos de la primera vez.)
 *  5. Implementar -> "Implementación nueva" -> Aplicación web:
 *         - Ejecutar como: "Yo"
 *         - Acceso: "Cualquier usuario"
 *  6. Copiar la URL (/exec) en servicios/casilleros.html -> window.APPSCRIPT_URL.
 *  7. El gestor se abre: URL/exec?pagina=admin  (admin.html dentro de Apps Script)
 *
 *  VIGENCIA: por semestre lectivo (ej. 2026-II). Un estudiante solo puede
 *  alquilar UN casillero a la vez (Ley Samuel).
 *
 *  HOJAS:
 *    REGISTRO   -> 1 fila por casillero (Codigo, Nombre, Ciclo, Correo,
 *                  Teléfono, Casillero, FechaInicio, FechaVencimiento, Estado,
 *                  Renovaciones, VoucherEnlace, Semestre).
 *    CASILLEROS -> inventario (N°, Estado Disponible/En Observación/Ocupado,
 *                  Código, Nombre, ÚltimaActualización) — 68 sembradas.
 *    HISTORIAL  -> bitácora cronológica.
 * ============================================================================
 */

/* ============================================================================
   CONFIGURACIÓN GLOBAL — la DB se selecciona por ID (script desacoplado)
   ============================================================================ */
var SPREADSHEET_ID = "1IV48EQmucbDkeB66wJl7ojcRH6qkfWeYm0NB0mEvchc";

/* Carpeta de Drive donde se guardan los vouchers de pago (subir como archivo). */
var CARPETA_VOUCHER_ID = "1f0oAG_GTbxTw2IBggaNdjxaEF2tncmXT";

var HOJA_REGISTRO  = "REGISTRO";   // alumnos
var HOJA_CASILLERO = "CASILLEROS"; // inventario
var HOJA_HISTORIAL = "HISTORIAL";  // bitácora

var PROPS = PropertiesService.getScriptProperties();

/* Vigencia de respaldo (días) si no hay semestre configurado con fecha fin. */
var DIAS_VIGENCIA = 180;

/* Datos de contacto para reclamos (Ley Samuel / gestor). */
var RECLAMO_NOMBRE = "Emerzon Zea";
var RECLAMO_TELEFONO = "925535748";

/* Layout físico del pabellón: 68 casilleros = 36 azules (A) + 32 celestes (C) */
var SERIES = [
  { prefijo: "A", cantidad: 36 },
  { prefijo: "C", cantidad: 32 }
];

/** Devuelve el libro de cálculo configurado. */
function libroConfigurado() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function hojaRegistro()  { return libroConfigurado().getSheetByName(HOJA_REGISTRO); }
function hojaCasillero() { return libroConfigurado().getSheetByName(HOJA_CASILLERO); }
function hojaHistorial() { return libroConfigurado().getSheetByName(HOJA_HISTORIAL); }

function carpetaVouchers() { return DriveApp.getFolderById(CARPETA_VOUCHER_ID); }

/* ---------------------------------------------------------------------------
   Cabeceras de cada hoja
   --------------------------------------------------------------------------- */
var COL = {
  registro: {
    CODIGO: 0, NOMBRE: 1, CICLO: 2, CORREO: 3, TELEFONO: 4, CASILLERO: 5,
    INICIO: 6, VENCIMIENTO: 7, ESTADO: 8, RENOVACIONES: 9, VOUCHER: 10, SEMESTRE: 11
  },
  casillero: {
    NUMERO: 0, ESTADO: 1, CODIGO: 2, NOMBRE: 3, ULTIMA: 4
  },
  historial: {
    FECHA: 0, CODIGO: 1, NOMBRE: 2, TIPO: 3, CASILLERO: 4, DETALLE: 5
  }
};

/* Número de columnas del REGISTRO (para leer rangos). */
var NCOLS_REGISTRO = 12;

/* ============================================================================
   CONFIGURACIÓN (ejecutar desde el editor, una vez)
   ============================================================================ */

/** Define el semestre lectivo actual y sus fechas límite.
 *  configurarSemestre("2026-II", "2026-08-17", "2026-12-20") */
function configurarSemestre(codigo, inicio, fin) {
  if (!codigo) throw new Error("Falta el código del semestre (ej: 2026-II).");
  PROPS.setProperty("SEMESTRE", String(codigo));
  if (inicio) PROPS.setProperty("SEMESTRE_INICIO", String(inicio));
  if (fin)    PROPS.setProperty("SEMESTRE_FIN", String(fin));
  return "Semestre actual: " + semestreActual() + " (fin: " + finSemestre() + ").";
}

function semestreActual() { return PROPS.getProperty("SEMESTRE") || ""; }
function finSemestre()    { return PROPS.getProperty("SEMESTRE_FIN") || ""; }

/** Fija la contraseña única del gestor (se guarda hasheada). */
function configurarAdmin(clave) {
  if (!clave) throw new Error("Falta la contraseña.");
  PROPS.setProperty("ADMIN_HASH", sha256(clave));
  return "Contraseña del gestor configurada.";
}

/** Crea las 3 hojas y siembra los 68 casilleros (borra CASILLEROS y rearma). */
function setupSheets() {
  var ss = libroConfigurado();

  var reg = ss.getSheetByName(HOJA_REGISTRO);
  if (!reg) reg = ss.insertSheet(HOJA_REGISTRO);
  reg.getRange(1, 1, 1, NCOLS_REGISTRO).setValues([["Codigo", "Nombre", "Ciclo", "Correo",
    "Telefono", "Casillero", "FechaInicio", "FechaVencimiento", "Estado", "Renovaciones",
    "VoucherEnlace", "Semestre"]]);
  reg.setFrozenRows(1);

  var cas = ss.getSheetByName(HOJA_CASILLERO);
  if (cas) ss.deleteSheet(cas);
  cas = ss.insertSheet(HOJA_CASILLERO);
  cas.getRange(1, 1, 1, 5).setValues([["Numero", "Estado", "Codigo", "Nombre", "UltimaActualizacion"]]);

  var total = 0;
  SERIES.forEach(function (serie) {
    for (var i = 1; i <= serie.cantidad; i++) {
      var num = serie.prefijo + i;
      cas.getRange(total + 2, 1).setValue(num);
      cas.getRange(total + 2, 2).setValue("Disponible");
      total++;
    }
  });
  cas.setFrozenRows(1);

  var hist = ss.getSheetByName(HOJA_HISTORIAL);
  if (!hist) hist = ss.insertSheet(HOJA_HISTORIAL);
  hist.getRange(1, 1, 1, 6).setValues([["Fecha", "Codigo", "Nombre", "Tipo", "Casillero", "Detalle"]]);
  hist.setFrozenRows(1);

  return "Hojas listas: " + HOJA_REGISTRO + " (12 cols), " +
         HOJA_CASILLERO + " (" + total + " casilleros A/C), " + HOJA_HISTORIAL + ".";
}

/* ============================================================================
   ENTRADAS DEL WEB APP
   ============================================================================ */

/** GET: consultas de solo lectura.
 *  ?accion=estado | disponibles | consultar&codigo=XXXX
 *  ?pagina=admin                    -> pantalla del gestor (html dentro de Apps Script) */
function doGet(e) {
  var p = (e && e.parameter) || {};
  var accion = (p.accion || "").toLowerCase();

  if (!accion && (p.pagina || "").toLowerCase() === "admin")
    return HtmlService.createHtmlOutputFromFile("admin");

  try {
    if (accion === "estado")      return json({ ok: true, data: estadoCompleto() });
    if (accion === "disponibles") return json({ ok: true, disponibles: contarDisponibles() });
    if (accion === "consultar")   return json({ ok: true, data: consultarEstado(p.codigo) });
    return json({
      ok: true,
      mensaje: "API de casilleros. GET: accion=estado|disponibles|consultar | pagina=admin. POST: accion=registrar|renovar|admin."
    });
  } catch (error) {
    return json({ ok: false, error: String((error && error.message) || error) });
  }
}

/** POST: escrituras. Body: JSON plano (Content-Type: text/plain para evitar CORS).
 *    accion: "registrar" | "renovar" | "admin" (gestor) */
function doPost(e) {
  var cuerpo = {};
  try {
    cuerpo = JSON.parse((e && e.postData && e.postData.contents) || "{}");
  } catch (err) {
    return json({ ok: false, error: "JSON inválido en el cuerpo del POST." });
  }

  var accion = String(cuerpo.accion || "").toLowerCase();
  try {
    if (accion === "registrar") return json(registrarNuevo(cuerpo));
    if (accion === "renovar")   return json(renovarCasillero(cuerpo));
    if (accion === "admin")     return json(manejadorAdmin(cuerpo));
    return json({ ok: false, error: "Acción desconocida: " + accion });
  } catch (error) {
    return json({ ok: false, error: String((error && error.message) || error) });
  }
}

/* ============================================================================
   MAPA DE ESTADO — pinta el picker de puertas
   ============================================================================ */
function estadoCompleto() {
  var cas = hojaCasillero();
  var n = cas.getLastRow() - 1;
  var datos = (n > 0) ? cas.getRange(2, 1, n, 5).getValues() : [];

  var puertas = [];
  var libres = 0;
  var observados = 0;
  var ocupados = 0;

  datos.forEach(function (f) {
    var estado = String(f[COL.casillero.ESTADO]).trim();
    if (estado === "Disponible") libres++;
    else if (estado === "En Observación") observados++;
    else ocupados++;
    puertas.push({ n: String(f[COL.casillero.NUMERO]), estado: estado });
  });

  return {
    semestre: semestreActual(),
    total: puertas.length,
    libres: libres,
    enObservacion: observados,
    ocupados: ocupados,
    puertas: puertas
  };
}

/* ============================================================================
   NUEVO REGISTRO — va a revisión del gestor (En Observación)
   ============================================================================ */
function registrarNuevo(d) {
  var codigo   = String(d.codigo || "").trim();
  var nombre   = String(d.nombre || "").trim();
  var ciclo    = String(d.ciclo || "").trim();
  var correo   = String(d.correo || "").trim();
  var telefono = String(d.telefono || "").trim();

  var pedidos = d.casillero;
  if (!Array.isArray(pedidos)) pedidos = String(pedidos || "").split(",");
  pedidos = pedidos.map(function (x) { return String(x).trim().toUpperCase(); })
                   .filter(function (x) { return /^[AC]\d{1,2}$/.test(x); });

  if (!codigo) throw new Error("Falta el código universitario.");
  if (!/^\d{6}$/.test(codigo))
    throw new Error("El código universitario debe tener exactamente 6 dígitos.");
  if (!nombre) throw new Error("Falta el nombre completo.");
  if (!telefono || !/^9\d{8}$/.test(telefono))
    throw new Error("Ingresa un celular válido de 9 dígitos (empieza con 9).");
  if (pedidos.length === 0)
    throw new Error("Selecciona al menos un casillero libre en el plano.");

  /* Ley Samuel: solo UN casillero por estudiante. */
  if (pedidos.length > 1)
    throw new Error("Por la Ley Samuel, cada estudiante puede alquilar solo UN casillero.");
  if (existeReservaVigente(codigo))
    throw new Error("Ya tienes un casillero reservado o en revisión. Solo UNO a la vez (Ley Samuel).");

  /* Voucher: subir a Drive. */
  var voucherUrl = guardarVoucher(d);

  var lock = LockService.getScriptLock();
  lock.waitLock(15000);

  var ocupadas = pedidos.filter(function (num) { return !puertaDisponible(num); });
  if (ocupadas.length > 0)
    throw new Error("La puerta " + ocupadas.join(", ") + " ya no está disponible. Recarga el plano.");

  var reg = hojaRegistro();
  var hoy = new Date();
  var numero = pedidos[0];

  cambiarInventario(numero, "En Observación", codigo, nombre, hoy);

  reg.appendRow([codigo, nombre, ciclo, correo, telefono, numero,
                 "", "", "En Observación", 0, voucherUrl, ""]);

  anotar(codigo, nombre, "Reserva enviada a revisión", numero,
         "Voucher recibido; pendiente de aprobación del gestor (" + formatear(hoy) + ").");

  lock.releaseLock();

  return {
    ok: true,
    casillero: numero,
    enObservacion: true,
    mensaje: "Reserva en revisión. El gestor validará tu voucher.",
    vencimiento: ""
  };
}

/** ¿El estudiante ya tiene un casillero Activo o en revisión? (Ley Samuel). */
function existeReservaVigente(codigo) {
  var filas = buscarRegistros(codigo);
  return filas.some(function (f) {
    return f.estado === "Activo" || f.estado === "En Observación";
  });
}

/* ============================================================================
   RENOVACIÓN — requiere un registro anterior y pasa por revisión del gestor
   ============================================================================ */
function renovarCasillero(d) {
  var codigo = String(d.codigo || "").trim();
  if (!codigo) return { ok: false, error: "Falta el código universitario." };
  if (!d.voucherBase64)
    return { ok: false, error: "Adjunta el voucher de tu renovación." };

  /* Verifica el registro principal ANTES de subir el voucher (sin archivos huérfanos). */
  var filas = buscarRegistros(codigo);
  var principales = filas.filter(function (f) { return f.estado === "Activo" || f.estado === "Vencido"; });

  if (filas.length === 0 || principales.length === 0) {
    return {
      ok: false,
      error: "No existe un registro principal para este código. Tu pago se registrará como reserva nueva.",
      motivo: "sin_registro"
    };
  }

  var vigentes = principales.filter(function (f) {
    return f.estado === "Activo" && String(f.semestre || "").trim() === semestreActual();
  });
  if (vigentes.length > 0) {
    return {
      ok: false,
      error: "Ya tienes casillero vigente para el semestre " + semestreActual() + ".",
      motivo: "ya_vigente"
    };
  }

  var voucherUrl = guardarVoucher(d);

  var lock = LockService.getScriptLock();
  lock.waitLock(15000);

  var reg = hojaRegistro();
  var resultado = [];
  var ninguno = true;
  filas.forEach(function (fila) {
    if (fila.estado === "Activo" || fila.estado === "Vencido") {
      reg.getRange(fila.numFila, COL.registro.ESTADO + 1).setValue("En Observación");
      resultado.push({ casillero: fila.casillero, estado: "En Observación" });
      ninguno = false;
    }
  });

  if (ninguno) {
    lock.releaseLock();
    return { ok: false, error: "No existe un registro principal para este código.", motivo: "sin_registro" };
  }

  anotar(codigo, principales[0].nombre, "Renovacion en revision", resultado.join(", "),
         "Nuevo voucher recibido; pendiente de aprobación del gestor.");

  lock.releaseLock();

  return {
    ok: true,
    casillero: resultado.map(function (r) { return r.casillero; }).join(", "),
    puertas: resultado,
    motivo: "en_observacion",
    mensaje: "Tu renovación está en revisión; el gestor la aprobará."
  };
}

/* ============================================================================
   CONSULTA — puertas del alumno
   ============================================================================ */
function consultarEstado(codigo) {
  codigo = String(codigo || "").trim();
  if (!codigo) throw new Error("Falta el código universitario.");

  var filas = buscarRegistros(codigo);
  if (filas.length === 0) throw new Error("No se encontró ningún registro para ese código.");

  return filas.map(function (f) {
    return {
      codigo: f.datos[COL.registro.CODIGO],
      nombre: f.datos[COL.registro.NOMBRE],
      ciclo: f.datos[COL.registro.CICLO],
      correo: f.datos[COL.registro.CORREO],
      telefono: f.datos[COL.registro.TELEFONO],
      casillero: f.casillero,
      inicio: f.datos[COL.registro.INICIO] || "—",
      vencimiento: f.datos[COL.registro.VENCIMIENTO] || "—",
      estado: f.estado,
      renovaciones: Number(f.datos[COL.registro.RENOVACIONES]) || 0,
      voucher: f.datos[COL.registro.VOUCHER],
      semestre: String(f.datos[COL.registro.SEMESTRE] || "")
    };
  });
}

/* ============================================================================
   GESTOR (admin) — autenticación + operaciones
   ============================================================================ */
function manejadorAdmin(d) {
  var op = String(d.op || "").toLowerCase();

  if (op === "login") return loginGestor(d.clave);

  verificarToken(d.tok);

  switch (op) {
    case "sesion":    return { ok: true, semestre: semestreActual() };
    case "resumen":   return resumenGestor();
    case "listar":    return { ok: true, data: listarRegistros(d) };
    case "aprobar":   return aprobar(String(d.codigo || "").trim());
    case "liberar":   return liberarCasillero(String(d.codigo || "").trim());
    case "presencial": return registrarPresencial(d);
    default: throw new Error("Operación de gestor desconocida: " + op);
  }
}

function loginGestor(clave) {
  var hash = PROPS.getProperty("ADMIN_HASH");
  if (!hash) throw new Error("El gestor no está configurado (ejecuta configurarAdmin).");

  var bloqueo = Number(PROPS.getProperty("ADMIN_BLOQ") || 0);
  if (bloqueo > Date.now())
    throw new Error("Demasiados intentos fallidos. Espera unos minutos antes de reintentar.");

  if (sha256(String(clave || "")) !== hash) {
    var fallos = Number(PROPS.getProperty("ADMIN_FALLOS") || 0) + 1;
    if (fallos >= 5) {
      PROPS.setProperty("ADMIN_BLOQ", String(Date.now() + 10 * 60 * 1000));
      PROPS.deleteProperty("ADMIN_FALLOS");
    } else {
      PROPS.setProperty("ADMIN_FALLOS", String(fallos));
    }
    throw new Error("Contraseña incorrecta.");
  }

  PROPS.deleteProperty("ADMIN_FALLOS");
  PROPS.deleteProperty("ADMIN_BLOQ");
  return { ok: true, token: tokenDia(hash), semestre: semestreActual(), reclamo: reclamoContacto() };
}

function verificarToken(tok) {
  var hash = PROPS.getProperty("ADMIN_HASH");
  if (!hash) throw new Error("El gestor no está configurado (ejecuta configurarAdmin).");
  if (String(tok || "") !== tokenDia(hash))
    throw new Error("Sesión expirada o inválida. Vuelve a ingresar la contraseña.");
}

function tokenDia(hash) {
  return sha256(String(hash) + ":" + formatear(new Date()));
}

function sha256(s) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(s))
    .map(function (b) { return ("0" + (b & 255).toString(16)).slice(-2); })
    .join("");
}

function reclamoContacto() {
  return { nombre: RECLAMO_NOMBRE, telefono: RECLAMO_TELEFONO };
}

/** Contadores para el dashboard del gestor. */
function resumenGestor() {
  var reg = hojaRegistro();
  var n = reg.getLastRow() - 1;
  var conteo = { "En Observación": 0, "Activo": 0, "Vencido": 0, "Liberado": 0 };
  if (n > 0) {
    var datos = reg.getRange(2, 1, n, NCOLS_REGISTRO).getValues();
    datos.forEach(function (f) {
      var e = String(f[COL.registro.ESTADO]).trim();
      conteo[e] = (conteo[e] || 0) + 1;
    });
  }
  return {
    ok: true,
    semestre: semestreActual(),
    libres: contarDisponibles(),
    conteo: conteo,
    reclamo: reclamoContacto()
  };
}

/** Listado completo del REGISTRO con filtros: estado | q (código o nombre) | semestre. */
function listarRegistros(d) {
  var reg = hojaRegistro();
  var n = reg.getLastRow() - 1;
  var salida = [];
  if (n <= 0) return salida;

  var datos = reg.getRange(2, 1, n, NCOLS_REGISTRO).getValues();
  var q = String(d.q || "").trim().toLowerCase();

  datos.forEach(function (f) {
    if (d.estado && String(f[COL.registro.ESTADO]).trim() !== d.estado) return;
    if (d.semestre && String(f[COL.registro.SEMESTRE] || "").trim() !== d.semestre) return;
    if (q) {
      var cod = String(f[COL.registro.CODIGO]).toLowerCase();
      var nom = String(f[COL.registro.NOMBRE]).toLowerCase();
      if (cod.indexOf(q) === -1 && nom.indexOf(q) === -1) return;
    }
    salida.push({
      codigo: String(f[COL.registro.CODIGO]),
      nombre: String(f[COL.registro.NOMBRE]),
      ciclo: String(f[COL.registro.CICLO]),
      correo: String(f[COL.registro.CORREO]),
      telefono: String(f[COL.registro.TELEFONO]),
      casillero: String(f[COL.registro.CASILLERO]),
      inicio: String(f[COL.registro.INICIO] || ""),
      vencimiento: String(f[COL.registro.VENCIMIENTO] || ""),
      estado: String(f[COL.registro.ESTADO]).trim(),
      renovaciones: Number(f[COL.registro.RENOVACIONES]) || 0,
      voucher: String(f[COL.registro.VOUCHER] || ""),
      semestre: String(f[COL.registro.SEMESTRE] || "")
    });
  });

  salida.sort(function (a, b) { return a.codigo.localeCompare(b.codigo); });
  return salida;
}

/** Aprobar: pasa a Activo los registros en revisión del estudiante.
 *  Nuevos: Semestre actual + fechas desde la aprobación.
 *  Renovaciones: suman Renovaciones y actualizan vigencia al semestre actual. */
function aprobar(codigo) {
  var filas = buscarRegistros(codigo, "En Observación");
  if (filas.length === 0) throw new Error("No hay registros en revisión para ese código.");

  var lock = LockService.getScriptLock();
  lock.waitLock(15000);

  var reg = hojaRegistro();
  var hoy = new Date();
  var sem = semestreActual();
  var fin = finSemestre() || formatear(new Date(hoy.getTime() + DIAS_VIGENCIA * 86400000));
  var aprobados = [];

  filas.forEach(function (fila) {
    var esRenovacion = String(fila.semestre || "").trim() !== "";
    var renov = Number(fila.datos[COL.registro.RENOVACIONES]) || 0;

    reg.getRange(fila.numFila, COL.registro.ESTADO + 1).setValue("Activo");
    reg.getRange(fila.numFila, COL.registro.SEMESTRE + 1).setValue(sem);
    reg.getRange(fila.numFila, COL.registro.INICIO + 1).setValue(formatear(hoy));
    reg.getRange(fila.numFila, COL.registro.VENCIMIENTO + 1).setValue(fin);
    if (esRenovacion)
      reg.getRange(fila.numFila, COL.registro.RENOVACIONES + 1).setValue(renov + 1);

    cambiarInventario(fila.casillero, "Ocupado", codigo, fila.nombre, hoy);
    aprobados.push(fila.casillero);
  });

  anotar(codigo, filas[0].nombre, "Aprobacion",
         aprobados.join(", "),
         "Voucher validado por el gestor. Semestre " + (sem || "—") + ", vigencia hasta " + fin + ".");

  lock.releaseLock();

  return { ok: true, casillero: aprobados.join(", "), semestre: sem, vencimiento: fin };
}

/** Registrar presencial desde el gestor: queda Activo al instante (pago en persona). */
function registrarPresencial(d) {
  var codigo   = String(d.codigo || "").trim();
  var nombre   = String(d.nombre || "").trim();
  var ciclo    = String(d.ciclo || "").trim();
  var correo   = String(d.correo || "").trim();
  var telefono = String(d.telefono || "").trim();
  var numero   = String(d.casillero || "").trim().toUpperCase();

  if (!codigo) throw new Error("Falta el código universitario.");
  if (!/^\d{6}$/.test(codigo)) throw new Error("El código debe tener 6 dígitos.");
  if (!nombre) throw new Error("Falta el nombre completo.");
  if (!telefono || !/^9\d{8}$/.test(telefono))
    throw new Error("Ingresa un celular válido de 9 dígitos (empieza con 9).");
  if (!/^[AC]\d{1,2}$/.test(numero)) throw new Error("Elige un casillero válido (A/C + número).");
  if (existeReservaVigente(codigo))
    throw new Error("Ese estudiante ya tiene un casillero reservado o en revisión (Ley Samuel).");

  var lock = LockService.getScriptLock();
  lock.waitLock(15000);

  if (!puertaDisponible(numero)) {
    lock.releaseLock();
    throw new Error("La puerta " + numero + " ya no está disponible.");
  }

  var hoy = new Date();
  var sem = semestreActual();
  var fin = finSemestre() || formatear(new Date(hoy.getTime() + DIAS_VIGENCIA * 86400000));

  cambiarInventario(numero, "Ocupado", codigo, nombre, hoy);
  hojaRegistro().appendRow([codigo, nombre, ciclo, correo, telefono, numero,
                            formatear(hoy), fin, "Activo", 0, "", sem]);
  anotar(codigo, nombre, "Registro presencial", numero,
         "Pago verificado en persona por el gestor. Semestre " + (sem || "—") + ".");

  lock.releaseLock();

  return { ok: true, casillero: numero, semestre: sem, vencimiento: fin };
}

/* ============================================================================
   UTILITARIOS
   ============================================================================ */

/** Devuelve TODAS las filas del REGISTRO que coinciden con un código.
 *  estado opcional filtra por columna ESTADO. */
function buscarRegistros(codigo, estado) {
  var reg = hojaRegistro();
  var n = reg.getLastRow() - 1;
  var salida = [];
  if (n <= 0) return salida;

  var datos = reg.getRange(2, 1, n, NCOLS_REGISTRO).getValues();
  for (var i = 0; i < datos.length; i++) {
    var est = String(datos[i][COL.registro.ESTADO]).trim();
    if (String(datos[i][COL.registro.CODIGO]).trim() !== codigo) continue;
    if (estado && est.toLowerCase() !== estado.toLowerCase()) continue;
    salida.push({
      numFila: i + 2,
      datos: datos[i],
      codigo: codigo,
      nombre: datos[i][COL.registro.NOMBRE],
      casillero: String(datos[i][COL.registro.CASILLERO]).trim(),
      estado: est,
      semestre: String(datos[i][COL.registro.SEMESTRE] || "").trim()
    });
  }
  return salida;
}

/** ¿Está libre la puerta ahora mismo? (solo lectura). */
function puertaDisponible(numero) {
  var cas = hojaCasillero();
  var n = cas.getLastRow() - 1;
  var datos = (n > 0) ? cas.getRange(2, 1, n, 2).getValues() : [];
  for (var i = 0; i < datos.length; i++) {
    if (String(datos[i][COL.casillero.NUMERO]).trim().toUpperCase() === numero)
      return String(datos[i][COL.casillero.ESTADO]).trim() === "Disponible";
  }
  throw new Error("La puerta " + numero + " no existe en el inventario.");
}

/** Actualiza el estado de una puerta en el inventario (Ocupado/En Observación/Disponible). */
function cambiarInventario(numero, estado, codigo, nombre, hoy) {
  var cas = hojaCasillero();
  var n = cas.getLastRow() - 1;
  var datos = cas.getRange(2, 1, n, 5).getValues();

  for (var i = 0; i < datos.length; i++) {
    if (String(datos[i][COL.casillero.NUMERO]).trim().toUpperCase() === numero) {
      var fila = i + 2;
      cas.getRange(fila, 2).setValue(estado);
      cas.getRange(fila, 3).setValue(estado === "Disponible" ? "" : codigo);
      cas.getRange(fila, 4).setValue(estado === "Disponible" ? "" : nombre);
      cas.getRange(fila, 5).setValue(formatear(hoy || new Date()));
      return;
    }
  }
  throw new Error("La puerta " + numero + " no existe en el inventario.");
}

/** Cuenta cuántas puertas quedan libres. */
function contarDisponibles() {
  var cas = hojaCasillero();
  var n = cas.getLastRow() - 1;
  var datos = (n > 0) ? cas.getRange(2, 1, n, 2).getValues() : [];
  var libres = 0;
  datos.forEach(function (f) {
    if (String(f[COL.casillero.ESTADO]).trim() === "Disponible") libres++;
  });
  return libres;
}

/** Agrega una línea a la bitácora HISTORIAL. */
function anotar(codigo, nombre, tipo, casillero, detalle) {
  hojaHistorial().appendRow([formatear(new Date()), codigo, nombre, tipo, casillero, detalle]);
}

/** Sube el voucher a la carpeta configurada y devuelve su enlace, o "" si no
 *  viene archivo. Bloquea archivos grandes para proteger la API. */
function guardarVoucher(d) {
  var b64 = String(d.voucherBase64 || "").trim();
  if (!b64) return "";

  var nombre = String(d.voucherNombre || "voucher.jpg").trim();
  nombre = nombre.replace(/[\\/:*?"<>|]/g, "_").slice(-60);

  if (b64.length > 7000000) throw new Error("El voucher pesa demasiado (máx. ~5 MB).");

  var mime = mimeDe(nombre);
  var blob = Utilities.newBlob(Utilities.base64Decode(b64), mime, nombre);
  var archivo = carpetaVouchers().createFile(blob);
  return archivo.getUrl();
}

function mimeDe(nombre) {
  var ext = (nombre.split(".").pop() || "").toLowerCase();
  var mapa = {
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif",
    webp: "image/webp", bmp: "image/bmp", heic: "image/heic", pdf: "application/pdf"
  };
  return mapa[ext] || "application/octet-stream";
}

/* ---------- Pequeños helpers ---------- */

function formatear(fecha) {
  var d = (fecha instanceof Date) ? fecha : new Date(fecha);
  var y = d.getFullYear();
  var m = ("0" + (d.getMonth() + 1)).slice(-2);
  var dia = ("0" + d.getDate()).slice(-2);
  return y + "-" + m + "-" + dia;
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ============================================================================
   TAREAS PARA EL ADMINISTRADOR (ejecutar a mano desde el editor)

   liberarCasillero("045213") -> deja libres todas sus puertas (en cualquier estado)
   vencerVencidos()           -> marca como Vencido los que pasaron la fecha
   ============================================================================ */

/** Renuncia / liberación manual de un alumno y todas sus puertas. */
function liberarCasillero(codigo) {
  var filas = buscarRegistros(String(codigo || "").trim());
  filas = filas.filter(function (f) { return f.estado !== "Liberado"; });
  if (filas.length === 0) throw new Error("No hay registros por liberar para " + codigo);

  var lock = LockService.getScriptLock();
  lock.waitLock(15000);

  var reg = hojaRegistro();
  var hoy = new Date();
  filas.forEach(function (fila) {
    reg.getRange(fila.numFila, COL.registro.ESTADO + 1).setValue("Liberado");
    cambiarInventario(fila.casillero, "Disponible", "", "", hoy);
  });

  anotar(codigo, filas[0].nombre, "Liberacion",
         filas.map(function (f) { return f.casillero; }).join(", "),
         "Casillero(s) liberado(s) por el gestor.");

  lock.releaseLock();
  return { ok: true, casillero: filas.map(function (f) { return f.casillero; }).join(", ") };
}

/** Marca como "Vencido" todo registro Activo cuya fecha ya pasó.
 *  NO libera las puertas automáticamente; eso lo decide el gestor. */
function vencerVencidos() {
  var reg = hojaRegistro();
  var n = reg.getLastRow() - 1;
  if (n <= 0) return "Sin registros.";

  var datos = reg.getRange(2, 1, n, NCOLS_REGISTRO).getValues();
  var hoy = new Date();
  var marcados = 0;

  for (var i = 0; i < datos.length; i++) {
    var estado = String(datos[i][COL.registro.ESTADO]).trim();
    if (estado !== "Activo") continue;
    var venc = datos[i][COL.registro.VENCIMIENTO];
    if (venc && venc !== "" && new Date(venc) < hoy) {
      reg.getRange(i + 2, COL.registro.ESTADO + 1).setValue("Vencido");
      marcados++;
    }
  }
  return "Registros marcados como vencidos: " + marcados;
}