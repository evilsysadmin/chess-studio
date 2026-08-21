// Glosario corto y práctico. `tooltip` es deliberadamente breve para la ayuda
// contextual; `definition` conserva la explicación completa del diccionario.
export const CHESS_GLOSSARY = Object.freeze([
  { term: 'Accuracy', aliases: ['precisión'], tooltip: 'Precisión estimada: cuánto se acercaron tus jugadas a las preferidas por el motor.', definition: 'Indicador de lo cerca que jugaron tus decisiones de las preferidas por el motor. En Chess Studio es una escala propia basada en la pérdida media; no copia la métrica de otra plataforma.' },
  { term: 'Blunder', aliases: ['grave error', '??'], tooltip: 'Error grave que empeora bruscamente la posición o pierde una ventaja decisiva.', definition: 'Error grande que empeora de forma brusca la posición: puede perder mucho material, una ventaja decisiva o incluso un mate.' },
  { term: 'CCT', aliases: ['checks captures threats', 'jaques capturas amenazas'], tooltip: 'Checks, Captures, Threats: revisa Jaques, Capturas y Amenazas antes de mover.', definition: 'Rutina táctica: antes de mover, revisa Jaques (Checks), Capturas (Captures) y Amenazas (Threats), primero tuyas y luego del rival.' },
  { term: 'cp', aliases: ['centipawn', 'centipawns', 'centipeón', 'centipeones'], tooltip: 'Centipeones: 100 cp ≈ el valor de un peón. Miden cambios de evaluación, no peones literalmente perdidos.', definition: 'Centipeones. 100 cp equivalen aproximadamente al valor de un peón. Una pérdida de 329 cp significa que la jugada empeoró la evaluación unas 3,29 unidades de peón respecto a la mejor alternativa; no implica que se hayan perdido literalmente 3,29 peones.' },
  { term: 'ELO', aliases: ['rating'], tooltip: 'Puntuación de fuerza relativa: ganar a rivales fuertes suele sumar más.', definition: 'Sistema de puntuación que estima fuerza relativa. Ganar a un rival fuerte suele valer más que ganar a uno débil; perder contra uno débil suele costar más.' },
  { term: 'Evaluación', aliases: ['eval'], tooltip: 'Estimación del motor sobre qué bando está mejor en una posición.', definition: 'Estimación del motor sobre quién está mejor. Valores positivos suelen favorecer a blancas y negativos a negras; el mate forzado se trata aparte de los centipeones.' },
  { term: 'FEN', aliases: ['forsyth-edwards notation'], tooltip: 'Texto compacto que describe una posición concreta del tablero y su estado.', definition: 'Texto que describe una posición concreta: piezas, turno, derechos de enroque, captura al paso y contadores. Sirve para guardar o reconstruir una posición sin toda la partida.' },
  { term: 'PGN', aliases: ['portable game notation'], tooltip: 'Formato de texto para guardar una partida completa y sus jugadas.', definition: 'Formato de texto para guardar una partida completa con jugadas y, opcionalmente, datos como jugadores, fecha, resultado y comentarios.' },
  { term: 'Mate forzado', aliases: ['forced mate'], tooltip: 'Secuencia que conduce inevitablemente a jaque mate si se juega correctamente.', definition: 'Existe una secuencia que lleva inevitablemente a jaque mate si el bando atacante juega correctamente. Si el motor anuncia mate, los cp dejan de ser la medida relevante.' },
  { term: 'Pieza colgada', aliases: ['hanging piece'], tooltip: 'Pieza que el rival puede capturar sin compensación suficiente.', definition: 'Pieza que puede ser capturada sin compensación suficiente o sin una respuesta táctica adecuada.' },
  { term: 'Tenedor', aliases: ['fork', 'doble ataque'], tooltip: 'Una pieza ataca dos o más objetivos al mismo tiempo.', definition: 'Una pieza ataca simultáneamente dos o más objetivos. Los caballos son especialmente famosos por esta indecencia.' },
  { term: 'Clavada', aliases: ['pin'], tooltip: 'Mover una pieza expondría otra más valiosa, a menudo el rey.', definition: 'Una pieza no puede moverse —o hacerlo sería muy costoso— porque detrás queda expuesta una pieza más valiosa, a menudo el rey.' },
  { term: 'Enfilada', aliases: ['skewer'], tooltip: 'Ataque en línea: al apartarse la pieza valiosa queda expuesta otra detrás.', definition: 'Ataque en línea contra una pieza valiosa que, al moverse, deja expuesta otra situada detrás.' },
  { term: 'Ataque descubierto', aliases: ['discovered attack'], tooltip: 'Mover una pieza abre la línea de ataque de otra que estaba detrás.', definition: 'Al mover una pieza se abre la línea de ataque de otra pieza que estaba detrás. Si además la pieza que se mueve amenaza algo, puede producir un doble ataque muy desagradable.' },
  { term: 'Tempo', aliases: ['tiempo'], tooltip: 'Una jugada útil como unidad práctica de tiempo; ganar un tempo fuerza al rival a responder.', definition: 'Una jugada útil o unidad práctica de tiempo. Ganar un tempo obliga al rival a responder mientras mejoras tu posición; perderlo puede significar gastar una jugada sin progreso.' },
  { term: 'Iniciativa', aliases: [], tooltip: 'Capacidad de crear amenazas que obligan al rival a responder.', definition: 'Capacidad de crear amenazas que fuerzan respuestas. Quien tiene la iniciativa suele dictar el ritmo aunque la ventaja material sea pequeña o nula.' },
  { term: 'Ahogado', aliases: ['stalemate'], tooltip: 'Tablas: toca mover, no estás en jaque y no existe ninguna jugada legal.', definition: 'Empate: el jugador al que le toca mover no está en jaque, pero no tiene ninguna jugada legal.' },
  { term: 'Jaque perpetuo', aliases: ['perpetual check'], tooltip: 'Cadena repetible de jaques que normalmente termina en tablas.', definition: 'Secuencia de jaques que puede repetirse indefinidamente y normalmente conduce a tablas por repetición.' },
  { term: 'Promoción', aliases: ['coronación'], tooltip: 'Un peón que llega a la última fila se transforma en otra pieza.', definition: 'Cuando un peón alcanza la última fila se transforma normalmente en dama, torre, alfil o caballo.' },
  { term: 'Zugzwang', aliases: [], tooltip: 'Posición donde tener que mover te perjudica: cualquier jugada empeora la situación.', definition: 'Posición —típica de finales— en la que tener que mover es una desventaja: cualquier jugada disponible empeora la posición.' },
]);

export function glossarySearch(query) {
  const needle = String(query || '').trim().toLocaleLowerCase('es');
  if (!needle) return CHESS_GLOSSARY;
  return CHESS_GLOSSARY.filter((entry) => [entry.term, ...entry.aliases, entry.tooltip, entry.definition]
    .join(' ')
    .toLocaleLowerCase('es')
    .includes(needle));
}

export function glossaryEntry(term) {
  const needle = String(term || '').trim().toLocaleLowerCase('es');
  return CHESS_GLOSSARY.find((entry) => entry.term.toLocaleLowerCase('es') === needle
    || entry.aliases.some((alias) => alias.toLocaleLowerCase('es') === needle)) || null;
}
