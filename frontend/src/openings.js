// openings.js — Nombre de la apertura que se está jugando, a partir de la
// secuencia de jugadas en SAN. Todas las secuencias de esta tabla se
// verificaron jugada por jugada con chess.js antes de darlas por buenas
// (no son de memoria sin chequear) — ver el historial de la sesión.
//
// No es un motor de reconocimiento completo (eso son las bases ECO, miles
// de líneas) — es un puñado de aperturas clásicas y conocidas, suficiente
// para que la app "hable" un poco de lo que se está jugando sin pretender
// cubrir cada variante posible.

export const OPENINGS = [
  { name: 'Apertura Española (Ruy López)', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5'] },
  { name: 'Defensa Siciliana', moves: ['e4', 'c5'] },
  { name: 'Defensa Siciliana, Variante Najdorf', moves: ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6'] },
  { name: 'Defensa Siciliana, Variante Dragón', moves: ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'g6'] },
  { name: 'Defensa Francesa', moves: ['e4', 'e6'] },
  { name: 'Defensa Caro-Kann', moves: ['e4', 'c6'] },
  { name: 'Gambito de Dama', moves: ['d4', 'd5', 'c4'] },
  { name: 'Gambito de Dama Aceptado', moves: ['d4', 'd5', 'c4', 'dxc4'] },
  { name: 'Gambito de Dama Rehusado', moves: ['d4', 'd5', 'c4', 'e6'] },
  { name: 'Defensa Eslava', moves: ['d4', 'd5', 'c4', 'c6'] },
  { name: 'Defensa Nimzoindia', moves: ['d4', 'Nf6', 'c4', 'e6', 'Nc3', 'Bb4'] },
  { name: 'Defensa India de Rey', moves: ['d4', 'Nf6', 'c4', 'g6'] },
  { name: 'Defensa Grünfeld', moves: ['d4', 'Nf6', 'c4', 'g6', 'Nc3', 'd5'] },
  { name: 'Apertura Inglesa', moves: ['c4'] },
  { name: 'Apertura Réti', moves: ['Nf3'] },
  { name: 'Gambito de Rey', moves: ['e4', 'e5', 'f4'] },
  { name: 'Defensa Escandinava', moves: ['e4', 'd5'] },
  { name: 'Apertura Italiana', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4'] },
  { name: 'Defensa Pirc', moves: ['e4', 'd6'] },
  { name: 'Defensa Alekhine', moves: ['e4', 'Nf6'] },
  { name: 'Apertura de los Cuatro Caballos', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Nc3', 'Nf6'] },
  { name: 'Gambito Evans', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'b4'] },
  { name: 'Apertura de Peón de Dama', moves: ['d4', 'd5'] },
  { name: 'Ataque Colle', moves: ['d4', 'd5', 'Nf3', 'Nf6', 'e3'] },
  { name: 'Apertura Bird', moves: ['f4'] },
  { name: 'Defensa Holandesa', moves: ['d4', 'f5'] },
];

// Busca, entre las jugadas ya hechas (lista de SAN, en orden), la apertura
// conocida más ESPECÍFICA que coincida — no la primera que matchee, la de
// secuencia más larga. Así "e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6" reconoce
// la Najdorf, no solo "Defensa Siciliana" (que también matchea, pero es
// menos específica).
export function identifyOpening(playedSans) {
  let best = null;
  for (const opening of OPENINGS) {
    if (opening.moves.length > playedSans.length) continue;
    const matches = opening.moves.every((m, i) => m === playedSans[i]);
    if (matches && (!best || opening.moves.length > best.moves.length)) {
      best = opening;
    }
  }
  return best ? best.name : null;
}
