const profesor = {
	nombre: "Nombre del profesor",
	dificultad: 80,
	cursos: ["Pollito", "No hay", "Su rico suri"],
	aprobacion: [45, 80, 62]
};

const ctx = document.getElementById("miGrafico").getContext("2d");

new Chart(ctx, {
	type: "bar",
	data: {
		labels: profesor.cursos,
		datasets: [{
			label: "Aprobados (%)",
			data: profesor.aprobacion,
			backgroundColor: [
				"rgba(12,113,32,0.85)",
				"rgba(194,200,31,0.85)",
				"rgba(12,113,32,0.65)"
			],
			borderColor: [
				"#0c7120",
				"#c2c81f",
				"#0c7120"
			],
			borderWidth: 2,
			borderRadius: 8,
			maxBarThickness: 65
		}]
	},
	options: {
		responsive: true,
		maintainAspectRatio: false,
		plugins: {
			legend: { display: false },
			tooltip: {
				callbacks: {
					label: function (context) {
						return ` ${context.raw}% aprobados`;
					}
				}
			}
		},
		scales: {
			y: {
				beginAtZero: true,
				max: 100,
				ticks: {
					callback: function (value) {
						return value + "%";
					}
				},
				grid: {
					color: "rgba(12,113,32,0.08)"
				}
			},
			x: {
				grid: { display: false }
			}
		}
	}
});

const buscador = document.getElementById("busquedaProfesor");
const tarjeta = document.getElementById("profesorCard");
const botonBuscar = document.getElementById("btnBuscar");

function buscarProfesor() {
	const texto = buscador.value.toLowerCase().trim();
	const nombreProfesor = profesor.nombre.toLowerCase();

	if (texto === "" || nombreProfesor.includes(texto)) {
		tarjeta.style.display = "block";
	} else {
		tarjeta.style.display = "none";
	}
}

buscador.addEventListener("input", buscarProfesor);

botonBuscar.addEventListener("click", buscarProfesor);

buscador.addEventListener("keydown", function (event) {
	if (event.key === "Enter") {
		buscarProfesor();
	}
});
