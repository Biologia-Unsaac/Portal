# Checklist del Portal Biología UNSAAC

Lista viva de ideas y pendientes. Marca lo que ya se hizo. (Nuevas ideas siempre son bienvenidas.)

## ✅ Hecho
- [x] Sistema de casilleros: front v7 + admin + **backend desplegado (Confirmado por el usuario: funciona)**
- [x] Sistema de comentarios/sugerencias (Sheet + modal "Página en construcción") con anti-spam
- [x] Botón (X) para cerrar el aviso del índice: funcionando + estilo cristal/transparente
- [x] Centros de investigación: presidentes/representantes + teléfonos + sitios web (CIBIOGEN, ICTIOS)
- [x] Centros en **2 columnas**, info ordenada (logo → título → desc → tags → director → redes) y layout móvil corregido
- [x] Centros y círculos unificados (sin botón toggle) con etiqueta de categoría: Centro de investigación / Círculo de estudio (SINAPSIS) / Centro juvenil (ICTIOS) / Laboratorio (LIMI)
- [x] Contador de visitas: backend `visitas_appscript` + `js/visitas.js` en las 9 páginas

## 🚨 PRINCIPAL → ✓ RESUELTO
- [x] **Casilleros backend en producción** — el usuario confirmó que funciona; no tocar

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