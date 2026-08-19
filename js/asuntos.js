document.addEventListener('DOMContentLoaded', () => {
    const toggleBtns = document.querySelectorAll('.toggle-btn');
    const panels = document.querySelectorAll('.asuntos-panel');

    toggleBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.dataset.target;

            toggleBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            panels.forEach(panel => {
                panel.classList.remove('active');
                if (panel.id === target) {
                    panel.classList.add('active');
                }
            });
        });
    });
});
