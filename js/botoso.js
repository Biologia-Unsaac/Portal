document.addEventListener("DOMContentLoaded", () => {
    const messages = [
        "¡Click Aqui!",
        "¿Te interesa el Expobio?",
        "Es un evento que no te puedes perder.",
        "¡Vamos, anímate a participar!",
        "¡Inscríbete al Expobio!",
        "¡Click Aqui!"
    ];

    let currentIndex = 0;
    const messageElement = document.getElementById('expobio-message');

    // Verificamos que el elemento exista para evitar errores en consola
    if (messageElement) {
        function updateMessage() {
            currentIndex = (currentIndex + 1) % messages.length;
            messageElement.textContent = messages[currentIndex];
        }

        // Ejecutar la función cada 4000 milisegundos (4 segundos)
        setInterval(updateMessage, 2000);
    }
});
