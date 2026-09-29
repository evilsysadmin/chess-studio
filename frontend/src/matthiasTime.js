function normalizedHour(hour) {
  const numeric = Number(hour);
  if (!Number.isFinite(numeric)) return 12;
  const wrapped = Math.trunc(numeric) % 24;
  return wrapped < 0 ? wrapped + 24 : wrapped;
}

function scene(key, label, greeting, loginText) {
  return Object.freeze({ key, label, greeting, loginText });
}

// Una jornada de Matthias se cuenta por pequeñas escenas, no por bloques de
// tres horas con el mismo bocata. La hora local del navegador decide la escena
// y no altera ninguna métrica ni regla del juego.
const HOURLY_SCENES = Object.freeze([
  scene('late-sleep', 'Sobando', 'Guten… was?', 'Medianoche. Yo ya estaba durmiendo. Si ha venido a liarla, procure al menos que sea una buena partida.'), // 00
  scene('late-sleep', 'Sobando', 'Guten… was?', '¿Qué hace usted jugando a estas horas? Ha despertado al alto mando. Ya que estamos, mueva bien.'),
  scene('late-sleep', 'Sobando', 'Guten… was?', 'Las dos de la mañana. Yo estaba durmiendo y usted aparentemente estaba buscando problemas.'),
  scene('late-sleep', 'Sobando', 'Guten… was?', 'Las tres. No pienso preguntar por qué. Sólo intente que la partida justifique el crimen horario.'),
  scene('late-sleep', 'Sobando', 'Guten… was?', 'Las cuatro. Esto ya no es turno nocturno; es una investigación.'),
  scene('late-sleep', 'Sobando', 'Guten… was?', 'Cinco de la mañana. Técnicamente sigo sobando. Moralmente ya le estoy juzgando.'),
  scene('morning-coffee', 'Primer café', 'Guten Morgen', 'Guten Morgen. Café fuerte, mente clara. A ver si hoy no regala nada.'),
  scene('breakfast-news', 'Desayuno y prensa', 'Guten Morgen', 'Guten Morgen. Croissant, café y Chess Weekly. Procure no convertirse en la noticia táctica del día.'),
  scene('strategy-book', 'Estudio matinal', 'Guten Morgen', 'Guten Morgen. Desayuno terminado. Estoy repasando estrategia; usted puede empezar por mirar antes de mover.'),
  scene('chess-inception', 'Ajedrez dentro del ajedrez', 'Guten Morgen', 'Guten Morgen. Sí, estoy jugando al ajedrez mientras espero que usted juegue al ajedrez. No lo complique.'),
  scene('dossier', 'Revisión de expedientes', 'Guten Morgen', 'Guten Morgen. Estoy con los expedientes. El suyo tiene demasiados post-it.'),
  scene('chess-weekly', 'Chess Weekly', 'Guten Morgen', 'Guten Morgen. Prensa ajedrecística. Estrategia, estructura y gente que mira antes de mover.'),
  scene('lunch-bocata', 'Comida táctica', 'Guten Tag', 'Guten Tag. Hora de comer. Un bocata y seguimos; una hora, no una legislatura.'),
  scene('late-sleep', 'Siesta táctica', 'Guten Tag', 'Guten Tag. Trece horas. Diez minutos de siesta táctica. Si rompe algo mientras duermo, deje un informe.'),
  scene('strategy-book', 'Manual de campaña', 'Guten Tag', 'Guten Tag. Estoy estudiando. Es una costumbre útil; algún día podría probarla.'),
  scene('chess-inception', 'Partida privada', 'Guten Tag', 'Guten Tag. Estoy en mitad de otra partida. Sí, también me juzgo a mí mismo.'),
  scene('afternoon-ops', 'En plena operación', 'Guten Tag', 'Guten Tag. En plena operación. Mantenga la presión y procure no financiar al rival.'),
  scene('dossier', 'Auditoría táctica', 'Guten Tag', 'Guten Tag. Hora de revisar expedientes. Sus blunders no se archivan solos.'),
  scene('chess-weekly', 'Lectura de tarde', 'Guten Tag', 'Guten Tag. Chess Weekly. Nada de picar entre horas: café, lectura y disciplina.'),
  scene('beer-break', 'Cervezota reglamentaria', 'Guten Abend', 'Guten Abend. He declarado una pausa con cerveza. No interprete eso como permiso para jugar borracho.'),
  // Dinner owns a distinct visual/composition while keeping the lunch family
  // prefix so the existing layered-art motion contract uses both arms (`bite`).
  scene('lunch-campaign-dinner', 'Cena de campaña', 'Guten Abend', 'Guten Abend. Cena rápida y vuelta al tablero. Hasta yo respeto unos horarios razonables.'),
  scene('night-coffee', 'Turno nocturno', 'Guten Abend', 'Guten Abend. Cena terminada. Café, guardia nocturna y menos excusas.'),
  scene('chess-inception', 'Partida nocturna', 'Guten Abend', 'Guten Abend. Estoy jugando una partida. Inception ajedrecístico, pero con menos presupuesto.'),
  scene('strategy-book', 'Último estudio', 'Guten Abend', 'Guten Abend. Últimas páginas del día. Después de esto, a dormir como una persona razonable.'),
]);

export function matthiasTimeScene(hour = new Date().getHours()) {
  return HOURLY_SCENES[normalizedHour(hour)] || HOURLY_SCENES[12];
}

export { normalizedHour as normalizeMatthiasHour };
