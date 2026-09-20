# Checklist del Portal Biología UNSAAC

Lista viva de ideas y pendientes. Marca lo que ya se hizo. (Nuevas ideas siempre son bienvenidas.)

## ✅ Hecho
- [x] Sistema de casilleros: front v7 + admin (reservas, config en línea)
- [x] Sistema de comentarios/sugerencias (Sheet + modal "Página en construcción") con anti-spam
- [x] Botón (X) para cerrar el aviso del índice (recuerda el cierre por visitante)
- [x] Centros de investigación: presidentes/representantes + teléfonos + sitios web (CIBIOGEN, ICTIOS)
- [x] Layout móvil de centros corregido (tarjetas apiladas a todo el ancho)
- [x] Toggle Centros/Círculos robusto (inmune a timing/caché, sin doble-tap lento)
- [x] Contador de visitas: backend `visitas_appscript` + `js/visitas.js` en las 9 páginas

## 🚨 Pendiente PRINCIPAL (bloquea funcionalidad real)
- [ ] **Casilleros backend en producción**: re-pegar `Code.gs`, `consulta.gs`, `admin.html` en
      Apps Script y crear **implementación v4** (el front ya está listo, la reserva real no funciona hasta esto)

## 🖥️ Funcionalidad
- [ ] Tienda: decidir vitrina o venta real. Si es venta: botón "Pedir por WhatsApp/Yape" por producto
- [ ] Asuntos: confirmar que los eventos del calendario sean datos reales del semestre
- [ ] Manual: conectar estadísticas/aprobación del curso a datos reales (Sheet)
- [ ] Comentarios: agregar notificación al correo del CF cuando llegue un comentario nuevo
- [ ] Visitas: un mini panel (opcional) en admin para ver el ranking sin abrir el Sheet

## 📱 Diseño / UX
- [ ] Probar en celulares reales (iPhone + Android) todas las páginas
- [ ] Favicon/metas OpenGraph (vista previa bonita al compartir en WhatsApp)
- [ ] Quitar el aviso "Página en construcción" cuando casilleros esté operativo (o convertirlo en "Novedades")
- [ ] Modo oscuro opcional

## 🔧 Mantenimiento
- [ ] Limpiar/descartar `index2.html` (backup viejo del amigo) cuando ya no se necesite
- [ ] Documentar en un solo lugar los Web Apps activos (casilleros, comentarios, visitas) y sus Sheets
- [ ] Revisar caché de JS tras cada cambio (cache-buster) para que los alumnos vean la versión nueva