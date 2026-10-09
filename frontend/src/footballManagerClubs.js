// The manager's initial choice is a local product catalog, not a career save
// or a fabricated standings/economy model. IDs are stable across future slices.
export const FOOTBALL_MANAGER_CLUBS = Object.freeze([
  Object.freeze({ id: 'fc-matthias', name: 'FC Matthias', shortName: 'MAT', initials: 'FM', level: 4, style: 'Equilibrado', objective: 'Pelear por el título' }),
  Object.freeze({ id: 'real-enroque', name: 'Real Enroque', shortName: 'REN', initials: 'RE', level: 4, style: 'Posesión', objective: 'Acabar entre los dos primeros' }),
  Object.freeze({ id: 'atletico-torreon', name: 'Atlético Torreón', shortName: 'TOR', initials: 'AT', level: 3, style: 'Defensa férrea', objective: 'Clasificarse en la mitad alta' }),
  Object.freeze({ id: 'union-alfil', name: 'Unión Alfil', shortName: 'ALF', initials: 'UA', level: 3, style: 'Bandas y centros', objective: 'Competir por cada punto' }),
  Object.freeze({ id: 'deportivo-gambito', name: 'Deportivo Gambito', shortName: 'GAM', initials: 'DG', level: 2, style: 'Ataque arriesgado', objective: 'Sorprender a los favoritos' }),
  Object.freeze({ id: 'peones-del-norte', name: 'Peones del Norte', shortName: 'PDN', initials: 'PN', level: 2, style: 'Contraataque', objective: 'Construir un proyecto sólido' }),
]);

export function getFootballManagerClub(id) {
  return FOOTBALL_MANAGER_CLUBS.find((club) => club.id === id) || null;
}
