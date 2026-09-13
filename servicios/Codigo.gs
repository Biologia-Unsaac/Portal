/**
 * ============================================================================
 *  SISTEMA DE CASILLEROS — BACKEND (Google Apps Script · SCRIPT SUELTO)
 *  Escuela Profesional de Biología · UNSAAC
 * ----------------------------------------------------------------------------
 *  CONFIGURACIÓN:
 *  1. Crear un proyecto APPS SCRIPT SUELTO (script.google.com -> Nuevo proyecto).
 *  2. Pegar este archivo completo en Code.gs.
 *  3. Poner abajo el ID del spreadsheet que quieras usar (SPREADSHEET_ID).
 *     NOTA: usando ID el script no está "amarrado" a un sheet: si mañana cambias
 *     de hoja, solo cambias esta variable y funciona igual con otros proyectos.
 *  4. Ejecutar UNA VEZ `setupSheets()` para crear las 3 hojas.
 *     (En el editor, elegir setupSheets y pulsar Ejecutar. Aceptar permisos.)
 *  5. Implementar -> "Implementación nueva" -> Tipo: "Aplicación web":
 *         - Ejecutar como: "Yo"
 *         - Acceso: "Cualquier usuario"        (NO usar "con cuenta de Google")
 *  6. Copiar la URL de la implementación (termina en /exec) y pegarla en
 *     servicios/casilleros.html  ->  window.APPSCRIPT_URL = "TU_URL";
 *
 *  HOJAS:
 *    REGISTRO   -> 1 fila por alumno ACTIVO (Código, Nombre, Ciclo, Correo,
 *                  Casillero, FechaInicio, FechaVencimiento, Estado, Renovaciones)
 *    CASILLEROS -> inventario (N°, Estado, Código, Nombre, ÚltimaActualización)
 *    HISTORIAL  -> registro cronológico de eventos (nuevo / renovación / baja)
 * ============================================================================
 */

/* ============================================================================
   CONFIGURACIÓN GLOBAL — el DB se selecciona por ID para reutilizar el script
   ============================================================================ */
var SPREADSHEET_ID = "1IV48EQmucbDkeB66wJl7ojcRH6qkfWeYm0NB0mEvchc";

var HOJA_REGISTRO  = "REGISTRO";   // alumnos
var HOJA_CASILLERO = "CASILLEROS"; // inventario
var HOJA_HISTORIAL = "HISTORIAL";  // bitácora

/* Vigencia de un semestre en días */
var DIAS_VIGENCIA = 180;

/* Total de casilleros físicos del pabellón (ajustar al real) */
var TOTAL_CASILLEROS = 120;

/** Devuelve el libro de cálculo configurado. Usalo en lugar de
 *  SpreadsheetApp.getActive() para que este script funcione desacoplado. */
function libroConfigurado() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function hojaRegistro()  { return libroConfigurado().getSheetByName(HOJA_REGISTRO); }
function hojaCasillero() { return libroConfigurado().getSheetByName(HOJA_CASILLERO); }
function hojaHistorial() { return libroConfigurado().getSheetByName(HOJA_HISTORIAL); }

/* ---------------------------------------------------------------------------
   Cabeceras de cada hoja
   --------------------------------------------------------------------------- */
var COL = {
  registro: {
    CODIGO: 0, NOMBRE: 1, CICLO: 2, CORREO: 3, CASILLERO: 4,
    INICIO: 5, VENCIMIENTO: 6, ESTADO: 7, RENOVACIONES: 8
  },
  casillero: {
    NUMERO: 0, ESTADO: 1, CODIGO: 2, NOMBRE: 3, ULTIMA: 4
  },
  historial: {
    FECHA: 0, CODIGO: 1, NOMBRE: 2, TIPO: 3, CASILLERO: 4, DETALLE: 5
  }
};

/* ============================================================================
   SETUP — ejecutar UNA SOLA VEZ desde el editor
   ============================================================================ */
function setupSheets() {
  var ss = libroConfigurado(); // el spreadsheet definido por SPREADSHEET_ID

  var reg = ss.getSheetByName(HOJA_REGISTRO);
  if (!reg) reg = ss.insertSheet(HOJA_REGISTRO);
  reg.getRange(1, 1, 1, 9).setValues([["Codigo", "Nombre", "Ciclo", "Correo",
    "Casillero", "FechaInicio", "FechaVencimiento", "Estado", "Renovaciones"]]);
  reg.setFrozenRows(1);

  var cas = ss.getSheetByName(HOJA_CASILLERO);
  if (cas) ss.deleteSheet(cas);
  cas = ss.insertSheet(HOJA_CASILLERO);
  cas.getRange(1, 1, 1, 5).setValues([["Numero", "Estado", "Codigo", "Nombre", "UltimaActualizacion"]]);
  for (var i = 1; i <= TOTAL_CASILLEROS; i++) {
    cas.getRange(i + 1, 1).setValue(i);
    cas.getRange(i + 1, 2).setValue("Disponible");
  }
  cas.setFrozenRows(1);

  var hist = ss.getSheetByName(HOJA_HISTORIAL);
  if (!hist) hist = ss.insertSheet(HOJA_HISTORIAL);
  hist.getRange(1, 1, 1, 6).setValues([["Fecha", "Codigo", "Nombre", "Tipo", "Casillero", "Detalle"]]);
  hist.setFrozenRows(1);

  return "Hojas creadas: " + HOJA_REGISTRO + ", " + HOJA_CASILLERO + ", " + HOJA_HISTORIAL;
}

/* ============================================================================
   ENTRADAS DEL WEB APP
   ============================================================================ */

/** GET: consultas de solo lectura.
 *  ?accion=consultar&codigo=XXXX
 *  ?accion=disponibles
 *  ?accion=panel (sin usar; devuelve un JSON de ayuda)
 */
function doGet(e) {
  var p = (e && e.parameter) || {};
  var accion = (p.accion || "").toLowerCase();

  try {
    if (accion === "consultar") return json({ ok: true, data: consultarEstado(p.codigo) });
    if (accion === "disponibles") return json({ ok: true, disponibles: contarDisponibles() });
    return json({ ok: true, mensaje: "API de casilleros. Usa accion=registrar|renovar|consultar|disponibles." });
  } catch (error) {
    return json({ ok: false, error: String(error && error.message || error) });
  }
}

/** POST: escrituras.
 *  Body: JSON  { accion:"registrar", ... }  o  { accion:"renovar", codigo:"..." }
 */
function doPost(e) {
  var cuerpo = JSON.parse((e && e.postData && e.postData.contents) || "{}");
  var accion = (cuerpo.accion || "").toLowerCase();

  try {
    if (accion === "registrar") return json(registrarNuevo(cuerpo));
    if (accion === "renovar")   return json(renovarCasillero(cuerpo));
    return json({ ok: false, error: "Acción desconocida: " + accion });
  } catch (error) {
    return json({ ok: false, error: String(error && error.message || error) });
  }
}

/* ============================================================================
   NUEVO REGISTRO
   ============================================================================ */
function registrarNuevo(d) {
  var codigo  = String(d.codigo || "").trim();
  var nombre  = String(d.nombre || "").trim();
  var ciclo   = String(d.ciclo || "").trim();
  var correo  = String(d.correo || "").trim();
  var solicitado = String(d.casillero || "").trim();

  if (!codigo)   throw new Error("Falta el código universitario.");
  if (!/^\d{6,20}$/.test(codigo.replace(/\s+/g, "")))
    throw new Error("El código universitario no parece válido.");
  if (!nombre)   throw new Error("Falta el nombre completo.");
  if (!ciclo)    throw new Error("Selecciona tu ciclo.");

  var lock = LockService.getScriptLock();
  lock.waitLock(15000);

  var reg = hojaRegistro();

  /* Regla: el alumno no puede tener otro casillero activo. */
  var filaActiva = buscarRegistro(codigo, "Activo");
  if (filaActiva) throw new Error("Ya tienes un casillero N°" + filaActiva.casillero + " activo. Usa la opción 'Renovar'.");

  /* Asignar casillero (pedido o el primero disponible). */
  var haySolicitado = !!solicitado;
  var numero = asignarCasillero(solicitado);
  if (!numero && haySolicitado)
    throw new Error("El casillero N°" + solicitado + " no está disponible. Elige otro o déjalo en automático.");
  if (!numero) throw new Error("No hay casilleros disponibles en este momento.");

  var hoy = new Date();
  var vencimiento = new Date(hoy.getTime() + DIAS_VIGENCIA * 86400000);
  var fecIni  = formatear(hoy);
  var fecVen  = formatear(vencimiento);

  reg.appendRow([codigo, nombre, ciclo, correo, numero, fecIni, fecVen, "Activo", 0]);
  marcarCasillero(numero, "Ocupado", codigo, nombre);
  anotar(codigo, nombre, "Nuevo", numero, "Asignado desde " + fecIni + " hasta " + fecVen);

  lock.releaseLock();
  return { ok: true, casillero: numero, vencimiento: fecVen };
}

/* ============================================================================
   RENOVACIÓN
   ============================================================================ */
function renovarCasillero(d) {
  var codigo = String(d.codigo || "").trim();
  if (!codigo) throw new Error("Falta el código universitario.");

  var lock = LockService.getScriptLock();
  lock.waitLock(15000);

  var reg = hojaRegistro();
  var fila = buscarRegistro(codigo, "Activo");
  if (!fila) throw new Error("No se encontró un casillero activo para ese código.");

  var hoy = new Date();
  var vencimiento = new Date(hoy.getTime() + DIAS_VIGENCIA * 86400000);
  var fecVen = formatear(vencimiento);
  var renovaciones = (fila.renovaciones || 0) + 1;

  /* Actualizar fila del alumno. */
  reg.getRange(fila.numFila, COL.registro.VENCIMIENTO + 1).setValue(fecVen);
  reg.getRange(fila.numFila, COL.registro.RENOVACIONES + 1).setValue(renovaciones);

  /* Actualizar inventario. */
  marcarCasillero(fila.casillero, "Ocupado", codigo, fila.nombre);
  anotar(codigo, fila.nombre, "Renovacion", fila.casillero, "Nueva vigencia hasta " + fecVen + " (x" + renovaciones + ")");

  lock.releaseLock();
  return { ok: true, casillero: fila.casillero, nuevo_vencimiento: fecVen, renovaciones: renovaciones };
}

/* ============================================================================
   CONSULTA DE ESTADO
   ============================================================================ */
function consultarEstado(codigo) {
  codigo = String(codigo || "").trim();
  if (!codigo) throw new Error("Falta el código universitario.");

  var fila = buscarRegistro(codigo);
  if (!fila) throw new Error("No se encontró ningún registro para ese código.");

  return {
    codigo: fila.codigo,
    nombre: fila.nombre,
    ciclo: fila.ciclo,
    casillero: fila.casillero,
    inicio: fila.inicio,
    vencimiento: fila.vencimiento,
    estado: fila.estado,
    renovaciones: fila.renovaciones
  };
}

/* ============================================================================
   UTILITARIOS
   ============================================================================ */

/** Busca la última fila del REGISTRO que coincida con un código.
 *  estado opcional filtra por columna ESTADO. */
function buscarRegistro(codigo, estado) {
  var reg = hojaRegistro();
  var n = reg.getLastRow() - 1;
  if (n <= 0) return null;

  var datos = reg.getRange(2, 1, n, 9).getValues();
  for (var i = datos.length - 1; i >= 0; i--) {
    var fila = datos[i];
    var c = String(fila[COL.registro.CODIGO]).trim();
    if (c === codigo) {
      if (estado && String(fila[COL.registro.ESTADO]).trim().toLowerCase() !== estado.toLowerCase()) continue;
      return {
        numFila: i + 2,
        codigo: c,
        nombre: fila[COL.registro.NOMBRE],
        ciclo: fila[COL.registro.CICLO],
        correo: fila[COL.registro.CORREO],
        casillero: fila[COL.registro.CASILLERO],
        inicio: fila[COL.registro.INICIO],
        vencimiento: fila[COL.registro.VENCIMIENTO],
        estado: fila[COL.registro.ESTADO],
        renovaciones: Number(fila[COL.registro.RENOVACIONES]) || 0
      };
    }
  }
  return null;
}

/** Asigna el casillero solicitado si está disponible; si viene vacío,
 *  toma el primer número "Disponible". Devuelve "" si no hay cupo. */
function asignarCasillero(solicitado) {
  var cas = hojaCasillero();
  var n = cas.getLastRow() - 1;

  var datos = cas.getRange(2, 1, n, 5).getValues();
  if (solicitado) {
    var num = Number(solicitado);
    for (var i = 0; i < datos.length; i++) {
      if (Number(datos[i][COL.casillero.NUMERO]) === num) {
        if (String(datos[i][COL.casillero.ESTADO]).trim().toLowerCase() === "disponible") return num;
        return ""; // ocupado o inexistente
      }
    }
    return "";
  }

  for (var j = 0; j < datos.length; j++) {
    if (String(datos[j][COL.casillero.ESTADO]).trim().toLowerCase() === "disponible") {
      return Number(datos[j][COL.casillero.NUMERO]);
    }
  }
  return "";
}

/** Actualiza el estado de un casillero en el inventario. */
function marcarCasillero(numero, estado, codigo, nombre) {
  var cas = hojaCasillero();
  var n = cas.getLastRow() - 1;
  var datos = cas.getRange(2, 1, n, 5).getValues();

  for (var i = 0; i < datos.length; i++) {
    if (Number(datos[i][COL.casillero.NUMERO]) === Number(numero)) {
      var fila = i + 2;
      cas.getRange(fila, 2).setValue(estado);
      cas.getRange(fila, 3).setValue(estado === "Ocupado" ? codigo : "");
      cas.getRange(fila, 4).setValue(estado === "Ocupado" ? nombre : "");
      cas.getRange(fila, 5).setValue(formatear(new Date()));
      return;
    }
  }
}

/** Cuenta cuántos casilleros quedan libres. */
function contarDisponibles() {
  var cas = hojaCasillero();
  var n = cas.getLastRow() - 1;
  var datos = cas.getRange(2, 1, n, 2).getValues();
  var libres = 0;
  for (var i = 0; i < datos.length; i++) {
    if (String(datos[i][COL.casillero.ESTADO]).trim().toLowerCase() === "disponible") libres++;
  }
  return libres;
}

/** Agrega una línea a la bitácora HISTORIAL. */
function anotar(codigo, nombre, tipo, casillero, detalle) {
  var hist = hojaHistorial();
  hist.appendRow([formatear(new Date()), codigo, nombre, tipo, casillero, detalle]);
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

   liberarCasillero("17123415")  -> deja el casillero libre (renuncia)
   vencerVencidos()              -> marca como Vencido a los que pasaron fecha
   ============================================================================ */

/** Renuncia / liberación manual de un alumno y su casillero. */
function liberarCasillero(codigo) {
  var fila = buscarRegistro(codigo, "Activo");
  if (!fila) throw new Error("No hay registro activo para " + codigo);

  var reg = hojaRegistro();
  reg.getRange(fila.numFila, COL.registro.ESTADO + 1).setValue("Liberado");

  marcarCasillero(fila.casillero, "Disponible", "", "");
  anotar(codigo, fila.nombre, "Liberacion", fila.casillero, "Casillero liberado por el alumno/administración");
  return "Casillero N°" + fila.casillero + " liberado.";
}

/** Marca como "Vencido" todo registro activo cuya fecha ya pasó.
 *  NO libera el casillero automáticamente; eso lo decide el admin. */
function vencerVencidos() {
  var reg = hojaRegistro();
  var n = reg.getLastRow() - 1;
  if (n <= 0) return "Sin registros.";

  var datos = reg.getRange(2, 1, n, 9).getValues();
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