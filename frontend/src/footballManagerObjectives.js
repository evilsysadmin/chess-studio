// Pure, evidence-based club expectations. No fake board meetings, transfers
// or invisible rewards: every target uses real standings and match results.
import { FOOTBALL_MANAGER_CLUBS } from './footballManagerClubs.js';
import { footballStandings } from './footballManagerSeason.js';

const freeze = Object.freeze;
export const FOOTBALL_CLUB_TARGETS = freeze({
  'fc-matthias': freeze({ type: 'rank', limit: 1, title: 'Conquistar la liga', detail: 'Terminar primero entre los seis clubes' }),
  'real-enroque': freeze({ type: 'rank', limit: 2, title: 'Puestos de honor', detail: 'Acabar entre los dos primeros' }),
  'atletico-torreon': freeze({ type: 'rank', limit: 3, title: 'Mitad alta', detail: 'Terminar entre los tres primeros' }),
  'union-alfil': freeze({ type: 'points', limit: 12, title: 'Sumar cada punto', detail: 'Alcanzar 12 puntos en diez jornadas' }),
  'deportivo-gambito': freeze({ type: 'upset', limit: 1, title: 'Tumbar a un favorito', detail: 'Ganar al menos una vez contra un club de cuatro o cinco estrellas' }),
  'peones-del-norte': freeze({ type: 'points', limit: 9, title: 'Bases del proyecto', detail: 'Sumar al menos nueve puntos en diez jornadas' }),
});

export function footballClubObjectiveReport(season, clubId) {
  const club = FOOTBALL_MANAGER_CLUBS.find((c) => c.id === clubId);
  const target = FOOTBALL_CLUB_TARGETS[clubId];
  if (!season || !Array.isArray(season.results) || !Array.isArray(season.rounds)
    || !Number.isInteger(season.currentRound) || season.currentRound < 0
    || season.currentRound > season.rounds.length
    || !club || !target || !season.clubs?.some((entry) => entry.id === clubId)) {
    throw new Error('Invalid football objective state or club');
  }
  const standings = footballStandings(season);
  const position = standings.findIndex((entry) => entry.id === clubId) + 1;
  const row = standings[position - 1];
  let achieved;
  let progress;
  if (target.type === 'rank') {
    achieved = position <= target.limit;
    progress = `Posición provisional: ${position}.º · Meta: ${target.limit}.º o mejor`;
  } else if (target.type === 'points') {
    achieved = row.points >= target.limit;
    progress = `${row.points} de ${target.limit} puntos`;
  } else {
    const surpriseWins = season.results.filter((result) => {
      const home = result.homeId === clubId;
      const away = result.awayId === clubId;
      if (!home && !away) return false;
      const opponentId = home ? result.awayId : result.homeId;
      const opponent = season.clubs.find((entry) => entry.id === opponentId);
      return opponent?.level >= 4
        && (home ? result.homeGoals > result.awayGoals : result.awayGoals > result.homeGoals);
    }).length;
    achieved = surpriseWins >= target.limit;
    progress = `${surpriseWins} de ${target.limit} victorias ante favoritos`;
  }
  const finished = season.currentRound === season.rounds.length;
  return freeze({
    title: target.title,
    detail: target.detail,
    progress,
    position,
    status: finished ? (achieved ? 'met' : 'missed') : 'pending',
    statusLabel: finished ? (achieved ? 'Objetivo cumplido' : 'Objetivo no alcanzado') : 'En disputa',
  });
}
