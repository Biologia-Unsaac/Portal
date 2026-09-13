/**
 * ============================================================================
 *  SISTEMA DE CASILLEROS — BACKEND (Google Apps Script · SCRIPT SUELTO)
 *  Escuela Profesional de Biología · UNSAAC
 * ----------------------------------------------------------------------------
 *  CONFIGURACIÓN:
 *  1. Crear un proyecto APPS SCRIPT SUELTO (script.google.com -> Nuevo proyecto).
 *  2. Pegar este archivo completo en Code.gs.
 *  3. Poner abajo el ID del spreadsheet (SPREADSHEET_ID) y la carpeta de Drive
 *     donde se subirán los vouchers (CARPETA_VOUCHER_ID). Usando IDs el script
 *     queda desacoplado: funciona con cualquier hoja/carpeta cambiando variables.
 *  4. Ejecutar UNA VEZ `setupSheets()` para crear las 3 hojas.
 *     (En el editor, elegir setupSheets y pulsar Ejecutar. Aceptar permisos:
 *     pedirá acceso a Sheets y a Drive.)
 *  5. Implementar -> "Implementación nueva" -> Tipo: "Aplicación web":
 *         - Ejecutar como: "Yo"
 *         - Acceso: "Cualquier usuario"        (NO usar "con cuenta de Google")
 *  6. Copiar la URL de la implementación (termina en /exec) y pegarla en
 *     servicios/casilleros.html  ->  window.APPSCRIPT_URL = "TU_URL";
 *
 *  CASILLEROS (68): serie A (azul, A1-A36) + serie C (celeste, C1-C32).
 *
 *  HOJAS:
 *    REGISTRO   -> 1 fila por PUERTA asignada (Código, Nombre, Ciclo, Correo,
 *                  Teléfono, Casillero, FechaInicio, FechaVencimiento, Estado,
 *                  Renovaciones, VoucherEnlace). Un alumno puede tener 1 a N
 *                  puertas; cada una es su propia fila.
 *    CASILLEROS -> inventario (N°, Estado "Disponible/Ocupado", Código, Nombre,
 *                  ÚltimaActualización) — 68 filas sembradas por setupSheets().
 *    HISTORIAL  -> bitácora cronológica (nuevo / renovación / liberación).
 * ============================================================================
 */

/* ============================================================================
   CONFIGURACIÓN GLOBAL — la DB se selecciona por ID para reutilizar el script
   ============================================================================ */
var SPREADSHEET_ID = "1IV48EQmucbDkeB66wJl7ojcRH6qkfWeYm0NB0mEvchc";

/* Carpeta de Drive donde se guardan los vouchers de pago (subir como archivo). */
var CARPETA_VOUCHER_ID = "1f0oAG_GTbxTw2IBggaNdjxaEF2tncmXT";

var HOJA_REGISTRO  = "REGISTRO";   // alumnos
var HOJA_CASILLERO = "CASILLEROS"; // inventario
var HOJA_HISTORIAL = "HISTORIAL";  // bitácora

/* Vigencia de un semestre en días */
var DIAS_VIGENCIA = 180;

/* Layout físico del pabellón: 68 casilleros = 36 azules (A) + 32 celestes (C) */
var SERIES = [
  { prefijo: "A", cantidad: 36 },
  { prefijo: "C", cantidad: 32 }
];

/** Devuelve el libro de cálculo configurado. Usalo en lugar de
 *  SpreadsheetApp.getActive() para que este script funcione desacoplado. */
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
    INICIO: 6, VENCIMIENTO: 7, ESTADO: 8, RENOVACIONES: 9, VOUCHER: 10
  },
  casillero: {
    NUMERO: 0, ESTADO: 1, CODIGO: 2, NOMBRE: 3, ULTIMA: 4
  },
  historial: {
    FECHA: 0, CODIGO: 1, NOMBRE: 2, TIPO: 3, CASILLERO: 4, DETALLE: 5
  }
};

/* Número de columnas del REGISTRO (para leer rangos). */
var NCOLS_REGISTRO = 11;

/* ============================================================================
   SETUP — ejecutar UNA SOLA VEZ desde el editor
   ============================================================================ */
function setupSheets() {
  var ss = libroConfigurado(); // el spreadsheet definido por SPREADSHEET_ID

  var reg = ss.getSheetByName(HOJA_REGISTRO);
  if (!reg) reg = ss.insertSheet(HOJA_REGISTRO);
  reg.getRange(1, 1, 1, NCOLS_REGISTRO).setValues([["Codigo", "Nombre", "Ciclo", "Correo",
    "Telefono", "Casillero", "FechaInicio", "FechaVencimiento", "Estado", "Renovaciones",
    "VoucherEnlace"]]);
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

  return "Hojas listas: " + HOJA_REGISTRO + " (" + NCOLS_REGISTRO + " cols), " +
         HOJA_CASILLERO + " (" + total + " casilleros A/C), " + HOJA_HISTORIAL + ".";
}

/* ============================================================================
   ENTRADAS DEL WEB APP
   ============================================================================ */

/** GET: consultas de solo lectura.
 *  ?accion=estado        -> mapa completo de las 68 puertas + contadores
 *  ?accion=disponibles   -> solo el número de libres
 *  ?accion=consultar&codigo=XXXX -> puertas del alumno
 */
function doGet(e) {
  var p = (e && e.parameter) || {};
  var accion = (p.accion || "").toLowerCase();

  try {
    if (accion === "estado")      return json({ ok: true, data: estadoCompleto() });
    if (accion === "disponibles") return json({ ok: true, disponibles: contarDisponibles() });
    if (accion === "consultar")   return json({ ok: true, data: consultarEstado(p.codigo) });
    return json({
      ok: true, mensaje: "API de casilleros. GET: accion=estado|disponibles|consultar. POST: accion=registrar|renovar."
    });
  } catch (error) {
    return json({ ok: false, error: String((error && error.message) || error) });
  }
}

/** POST: escrituras. Body: JSON plano (Content-Type: text/plain para evitar
 *  preflight CORS).
 *    accion: "registrar" | "renovar"
 */
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
  var ocupados = 0;

  datos.forEach(function (f) {
    var estado = String(f[COL.casillero.ESTADO]).trim().toLowerCase() === "disponible" ? "Disponible" : "Ocupado";
    if (estado === "Disponible") libres++; else ocupados++;
    puertas.push({
      n: String(f[COL.casillero.NUMERO]),
      estado: estado,
      ocupante: estado === "Ocupado" ? String(f[COL.casillero.NOMBRE] || "") : ""
    });
  });

  return {
    total: puertas.length,
    libres: libres,
    ocupados: ocupados,
    puertas: puertas
  };
}

/* ============================================================================
   NUEVO REGISTRO (una o más puertas en un solo envío)
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
  if (!/^\d{6,20}$/.test(codigo.replace(/\s+/g, "")))
    throw new Error("El código universitario no parece válido.");
  if (!nombre) throw new Error("Falta el nombre completo.");
  if (!telefono || !/^9\d{8}$/.test(telefono))
    throw new Error("Ingresa un celular válido de 9 dígitos (empieza con 9).");
  if (pedidos.length === 0)
    throw new Error("Selecciona al menos un casillero libre en el plano.");

  /* Voucher: subir a Drive si viene un archivo adjunto. */
  var voucherUrl = guardarVoucher(d);

  var lock = LockService.getScriptLock();
  lock.waitLock(15000);

  var reg = hojaRegistro();
  var hoy = new Date();

  // Quita duplicados conservando el orden.
  pedidos = pedidos.filter(function (x, i) { return pedidos.indexOf(x) === i; });

  var asignados = [];
  pedidos.forEach(function (num) {
    var fila = ocuparCasillero(num, codigo, nombre, ciclo, correo, telefono, hoy, voucherUrl);
    if (!fila) throw new Error("El casillero " + num + " ya fue ocupado. Recarga el plano.");
    reg.appendRow(fila);
    asignados.push(num);
  });

  anotar(codigo, nombre, "Nuevo", asignados.join(", "),
         "Puertas asignadas por " + formatear(hoy) + " con vigencia de " + DIAS_VIGENCIA + " días.");

  lock.releaseLock();

  return {
    ok: true,
    casillero: asignados.join(", "),
    vencimiento: formatear(new Date(hoy.getTime() + DIAS_VIGENCIA * 86400000)),
    asignados: asignados
  };
}

/** Ocupa una puerta en el inventario SI sigue disponible y devuelve la fila
 *  del REGISTRO lista para appendRow(). Devuelve null si ya no está libre. */
function ocuparCasillero(numero, codigo, nombre, ciclo, correo, telefono, hoy, voucherUrl) {
  var cas = hojaCasillero();
  var n = cas.getLastRow() - 1;
  var datos = cas.getRange(2, 1, n, 5).getValues();
  var idx = -1;

  for (var i = 0; i < datos.length; i++) {
    if (String(datos[i][COL.casillero.NUMERO]).trim().toUpperCase() === numero) { idx = i; break; }
  }
  if (idx === -1) throw new Error("La puerta " + numero + " no existe en el inventario.");

  if (String(datos[idx][COL.casillero.ESTADO]).trim().toLowerCase() !== "disponible") return null;

  var filaInv = idx + 2;
  cas.getRange(filaInv, 2).setValue("Ocupado");
  cas.getRange(filaInv, 3).setValue(codigo);
  cas.getRange(filaInv, 4).setValue(nombre);
  cas.getRange(filaInv, 5).setValue(formatear(hoy));

  var vencimiento = new Date(hoy.getTime() + DIAS_VIGENCIA * 86400000);
  return [codigo, nombre, ciclo, correo, telefono, numero,
          formatear(hoy), formatear(vencimiento), "Activo", 0, voucherUrl];
}

/* ============================================================================
   RENOVACIÓN — extiende TODAS las puertas activas del alumno
   ============================================================================ */
function renovarCasillero(d) {
  var codigo = String(d.codigo || "").trim();
  if (!codigo) throw new Error("Falta el código universitario.");

  var lock = LockService.getScriptLock();
  lock.waitLock(15000);

  var reg = hojaRegistro();
  var filas = buscarRegistros(codigo, "Activo");
  if (filas.length === 0)
    throw new Error("No se encontró ninguna puerta activa para ese código.");

  var hoy = new Date();
  var fecVen = formatear(new Date(hoy.getTime() + DIAS_VIGENCIA * 86400000));
  var resultado = [];

  filas.forEach(function (fila) {
    var renovaciones = (Number(fila.datos[COL.registro.RENOVACIONES]) || 0) + 1;
    reg.getRange(fila.numFila, COL.registro.VENCIMIENTO + 1).setValue(fecVen);
    reg.getRange(fila.numFila, COL.registro.RENOVACIONES + 1).setValue(renovaciones);
    marcarCasillero(fila.casillero, "Ocupado", codigo, fila.nombre);
    resultado.push({ casillero: fila.casillero, nuevo_vencimiento: fecVen, renovaciones: renovaciones });
  });

  anotar(codigo, filas[0].nombre, "Renovacion", resultado.map(function (x) { return x.casillero; }).join(", "),
         "Nueva vigencia de " + DIAS_VIGENCIA + " días (desde " + formatear(hoy) + ").");

  lock.releaseLock();
  return { ok: true, casillero: resultado.map(function (x) { return x.casillero; }).join(", "), puertas: resultado };
}

/* ============================================================================
   CONSULTA DE ESTADO — todas las puertas de un alumno
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
      inicio: f.datos[COL.registro.INICIO],
      vencimiento: f.datos[COL.registro.VENCIMIENTO],
      estado: f.datos[COL.registro.ESTADO],
      renovaciones: Number(f.datos[COL.registro.RENOVACIONES]) || 0,
      voucher: f.datos[COL.registro.VOUCHER]
    };
  });
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
    if (String(datos[i][COL.registro.CODIGO]).trim() !== codigo) continue;
    if (estado && String(datos[i][COL.registro.ESTADO]).trim().toLowerCase() !== estado.toLowerCase()) continue;
    salida.push({
      numFila: i + 2,
      datos: datos[i],
      codigo: codigo,
      nombre: datos[i][COL.registro.NOMBRE],
      casillero: String(datos[i][COL.registro.CASILLERO]).trim()
    });
  }
  return salida;
}

/** Actualiza el estado de una puerta en el inventario (por nombre A1/C3...). */
function marcarCasillero(numero, estado, codigo, nombre) {
  var cas = hojaCasillero();
  var n = cas.getLastRow() - 1;
  var datos = cas.getRange(2, 1, n, 5).getValues();

  for (var i = 0; i < datos.length; i++) {
    if (String(datos[i][COL.casillero.NUMERO]).trim().toUpperCase() === String(numero).trim().toUpperCase()) {
      var fila = i + 2;
      cas.getRange(fila, 2).setValue(estado);
      cas.getRange(fila, 3).setValue(estado === "Ocupado" ? codigo : "");
      cas.getRange(fila, 4).setValue(estado === "Ocupado" ? nombre : "");
      cas.getRange(fila, 5).setValue(formatear(new Date()));
      return;
    }
  }
}

/** Cuenta cuántas puertas quedan libres. */
function contarDisponibles() {
  var cas = hojaCasillero();
  var n = cas.getLastRow() - 1;
  var datos = (n > 0) ? cas.getRange(2, 1, n, 2).getValues() : [];
  var libres = 0;
  datos.forEach(function (f) {
    if (String(f[COL.casillero.ESTADO]).trim().toLowerCase() === "disponible") libres++;
  });
  return libres;
}

/** Agrega una línea a la bitácora HISTORIAL. */
function anotar(codigo, nombre, tipo, casillero, detalle) {
  var hist = hojaHistorial();
  hist.appendRow([formatear(new Date()), codigo, nombre, tipo, casillero, detalle]);
}

/** Sube el voucher a la carpeta configurada y devuelve su enlace,
 *  o "" si no viene archivo. Bloquea archivos grandes para proteger la API. */
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

   liberarCasillero("17123415") -> deja libres todas sus puertas (renuncia)
   vencerVencidos()              -> marca como Vencido los que pasaron fecha
   ============================================================================ */

/** Renuncia / liberación manual de un alumno y todas sus puertas. */
function liberarCasillero(codigo) {
  var filas = buscarRegistros(String(codigo || "").trim(), "Activo");
  if (filas.length === 0) throw new Error("No hay registro activo para " + codigo);

  var reg = hojaRegistro();
  filas.forEach(function (fila) {
    reg.getRange(fila.numFila, COL.registro.ESTADO + 1).setValue("Liberado");
    marcarCasillero(fila.casillero, "Disponible", "", "");
  });

  anotar(codigo, filas[0].nombre, "Liberacion",
         filas.map(function (f) { return f.casillero; }).join(", "),
         "Puertas liberadas por el alumno/administración.");
  return "Puertas liberadas: " + filas.map(function (f) { return f.casillero; }).join(", ");
}

/** Marca como "Vencido" todo registro activo cuya fecha ya pasó.
 *  NO libera las puertas automáticamente; eso lo decide el admin. */
function vencerVencidos() {
  var reg = hojaRegistro();
  var n = reg.getLastRow() - 1;
  if (n <= 0) return "Sin registros.";

  var datos = reg.getRange(2, 1, n, NCOLS_REGISTRO).getValues();
  var hoy = new Date();
  var marcados = 0;

  for (var i = 0; i < datos.length; i++) {
    var estado = String(datos[i][COL.registro.ESTADO]).trim().toLowerCase();
    if (estado !== "activo") continue;
    var venc = new Date(datos[i][COL.registro.VENCIMIENTO]);
    if (venc < hoy) {
      reg.getRange(i + 2, COL.registro.ESTADO + 1).setValue("Vencido");
      marcados++;
    }
  }
  return "Registros marcados como vencidos: " + marcados;
}