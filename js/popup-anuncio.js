(function () {
  var overlay = document.getElementById("promoOverlay");
  if (!overlay) return;

  var cerradoGuardado = false;
  try { cerradoGuardado = localStorage.getItem("promoAnuncioCerrado") === "1"; } catch (e) {}

  function ocultar() {
    overlay.classList.remove("is-visible");
    overlay.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
    try { localStorage.setItem("promoAnuncioCerrado", "1"); } catch (e) {}
  }

  function mostrar() {
    overlay.classList.add("is-visible");
    overlay.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
  }

  if (cerradoGuardado) { ocultar(); return; }
  mostrar();

  document.addEventListener("click", function (ev) {
    var t = ev.target;
    if (t && t.closest && t.closest("#promoClose")) { ocultar(); return; }
    if (t === overlay) { ocultar(); }
  });

  document.addEventListener("keydown", function (ev) {
    if (ev.key === "Escape" || ev.key === "Esc") ocultar();
  });
})();