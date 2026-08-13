const messages = [
    "¡Bienvenido al Portal!",
    "La ciencia es genial.",
    "¿Ya tomaste tu café?",
    "Nunca dejes de aprender.",
    "¡Vamos a programar!"
];

// Esta función genera un índice aleatorio
// y devuelve un mensaje del array
function getRandomMessage() {
    const message = messages[Math.floor(Math.random() * messages.length)];
    return message;
}

//Verificador malcriado para el DOM
//AJSAJSJAJSJAJ ME FALLE PONIENDO EL DIRECTORIO DE JS, PERO YA LO ARREGLÉ
document.addEventListener("DOMContentLoaded", () => {
    const elementoMensaje = document.getElementById("mensaje-random");
    
    if (elementoMensaje) {
        elementoMensaje.textContent = getRandomMessage();
    } else {
        console.error("No se encontró el elemento con id 'mensaje-random'");
    }
});
