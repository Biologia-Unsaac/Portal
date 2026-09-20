(function () {
  document.addEventListener("click", function (ev) {
    var btn = ev.target && ev.target.closest ? ev.target.closest(".toggle-btn") : null;
    if (!btn || !btn.dataset || !btn.dataset.target) return;
    var target = btn.dataset.target;

    document.querySelectorAll(".toggle-btn").forEach(function (b) {
      b.classList.toggle("active", b === btn);
    });

    document.querySelectorAll(".asuntos-panel").forEach(function (panel) {
      panel.classList.toggle("active", panel.id === target);
    });
  });
})();
