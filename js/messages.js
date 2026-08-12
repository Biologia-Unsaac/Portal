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

console.log(getRandomMessage());
