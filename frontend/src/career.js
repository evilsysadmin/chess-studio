import { STORAGE_LOCAL, getStorageItem } from './safeStorage.js';
import { setProfileStorageItem, removeProfileStorageItem } from './profileKeys.js';
import { hasAdminPreviewAccess } from './adminPreview.js';

const CAREER_KEY = 'chess-study-career';
const CONTRACT_KEY = 'chess-study-active-contract';
const RUN_KEY = 'chess-study-special-run';
const BOARD_THEME_KEY = 'chess-study-board-theme';

export const BOARD_THEMES = [
  { id: 'classic', label: 'Clásico', unlock: () => true },
  { id: 'midnight', label: 'Medianoche', unlock: (career) => Number(career?.records?.bestWinStreak || 0) >= 3 },
  { id: 'blood', label: 'Acta forense', unlock: (career) => Number(career?.contracts?.failed || 0) >= 3 || Number(career?.records?.highestDifficultyWin || 0) >= 40 },
  { id: 'royal', label: 'Real', unlock: (career) => Number(career?.records?.highestDifficultyWin || 0) >= 70 },
  { id: 'forensic', label: 'Laboratorio', unlock: (career) => Number(career?.records?.puzzleRushBest || 0) >= 8 },
  { id: 'obsidian', label: 'Obsidiana', unlock: (career) => Number(career?.records?.bestWinStreak || 0) >= 8 },
];


function normalizeLegacyMilestoneText(text) {
  const value = String(text || '');
  return value
    .replace(/^Contrato cumplido:\s*/i, 'Reto superado · ')
    .replace(/^Contrato fallido:\s*/i, 'Reto fallido · ')
    .replace(/^Reto cumplido:\s*/i, 'Reto superado · ')
    .replace(/^Reto cumplido\s*·\s*/i, 'Reto superado · ')
    .replace(/^Reto fallido:\s*/i, 'Reto fallido · ');
}

function normalizeMilestones(rows) {
  return Array.isArray(rows) ? rows.map((row) => row && typeof row === 'object' ? { ...row, text: normalizeLegacyMilestoneText(row.text) } : row) : [];
}

function monthId(date = new Date()) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`; }
function blank() {
  return {
    version: 2,
    season: { id: monthId(), games: 0, wins: 0, draws: 0, losses: 0, startedAt: new Date().toISOString() },
    records: {
      fastestWinPlies: null, longestGamePlies: 0, highestDifficultyWin: 0,
      bestWinStreak: 0, currentWinStreak: 0, bestBossStage: 0, bestStreakRun: 0,
      puzzleRushBest: 0, bestCupScore: 0, suddenDeathWins: 0,
    },
    contracts: { offered: 0, completed: 0, failed: 0 },
    byTimeControl: {},
    pressure: { moves: 0, incidents: 0 },
    milestones: [],
    runHistory: [],
  };
}
export function loadCareer() {
  try {
    const parsed = JSON.parse(getStorageItem(STORAGE_LOCAL, CAREER_KEY) || '{}');
    return {
      ...blank(), ...parsed,
      records: { ...blank().records, ...(parsed?.records || {}) },
      contracts: { ...blank().contracts, ...(parsed?.contracts || {}) },
      pressure: { ...blank().pressure, ...(parsed?.pressure || {}) },
      byTimeControl: { ...(parsed?.byTimeControl || {}) },
      milestones: normalizeMilestones(parsed?.milestones),
      runHistory: Array.isArray(parsed?.runHistory) ? parsed.runHistory : [],
    };
  } catch { return blank(); }
}
function saveCareer(state) { setProfileStorageItem(CAREER_KEY, JSON.stringify(state)); return state; }
function milestone(state, text, type='record', meta={}) {
  return { ...state, milestones: [{ id:`${Date.now()}-${Math.random().toString(36).slice(2,6)}`, date:new Date().toISOString(), type, text, ...meta }, ...(state.milestones||[])].slice(0,120) };
}

export const CONTRACTS = [
  { id:'win', label:'Haz el trabajo', text:'Gana la partida.', test:({outcome})=>outcome==='win' },
  { id:'no-hints', label:'Sin ruedines', text:'Termina sin usar una sola pista.', test:({hintsUsed})=>Number(hintsUsed||0)===0 },
  { id:'survive20', label:'Mantén el pulso', text:'Llega al movimiento 20.', test:({plies})=>Number(plies||0)>=39 },
  { id:'fastwin', label:'Ejecución sumaria', text:'Gana antes del movimiento 30.', test:({outcome,plies})=>outcome==='win'&&Number(plies||0)<=59 },
  { id:'blackwin', label:'Con negras, además', text:'Gana jugando con negras.', test:({outcome,humanColor})=>outcome==='win'&&humanColor==='b' },
  { id:'castle', label:'Techo antes de la tormenta', text:'Enrócate antes de tu movimiento 13.', test:({record}) => {
    const human = record?.humanColor || 'w';
    return (record?.moves || []).some((m,i) => (i % 2 === 0 ? 'w':'b') === human && i < 25 && String(m?.san||'').startsWith('O-O'));
  }},
  { id:'queen-home', label:'La dama no está de turismo', text:'No muevas la dama en tus primeros 6 turnos.', test:({record}) => {
    const human = record?.humanColor || 'w'; let turns=0;
    for (let i=0;i<(record?.moves||[]).length;i+=1) {
      if ((i%2===0?'w':'b')!==human) continue; turns+=1;
      if (turns<=6 && record.moves[i]?.piece==='q') return false;
    }
    return true;
  }},
  { id:'no-pressure-crime', label:'Pulso estable', text:'No cometas un incidente grave con menos de 40 segundos.', test:({pressureIncidents})=>Number(pressureIncidents||0)===0 },
  { id:'sudden-survivor', label:'Tres vidas, una dignidad', text:'Gana una partida Sudden Death.', test:({outcome,suddenDeath})=>outcome==='win'&&!!suddenDeath },
];

export function chooseContract({ gameCount = 0, incidents = {} } = {}) {
  const discipline = Object.values(incidents || {}).reduce((s,n)=>s+Number(n||0),0) > 4;
  const pool = discipline ? CONTRACTS.filter(c=>c.id!=='win') : CONTRACTS;
  return { ...pool[gameCount % pool.length], offeredAt: new Date().toISOString() };
}
export function saveActiveContract(c) { if (c) setProfileStorageItem(CONTRACT_KEY, JSON.stringify(c)); }
export function loadActiveContract() { try { return JSON.parse(getStorageItem(STORAGE_LOCAL, CONTRACT_KEY) || 'null'); } catch { return null; } }
export function clearActiveContract() { removeProfileStorageItem(CONTRACT_KEY); }

function contractResult(contract, record, meta={}) {
  if (!contract) return null;
  const source = CONTRACTS.find(c=>c.id===contract.id) || contract;
  const ctx={ outcome:record.outcome, humanColor:record.humanColor, plies:record.moves?.length||0, hintsUsed:meta.hintsUsed||0, pressureIncidents:meta.pressureIncidents||0, suddenDeath:!!meta.suddenDeath, record };
  return { id:source.id, label:source.label, success:!!source.test?.(ctx) };
}

export function recordCareerGame(record, meta={}) {
  let state=loadCareer(); const sid=monthId();
  if (state.season?.id!==sid) {
    state=milestone(state,`Temporada ${state.season?.id} cerrada: ${state.season?.wins||0}V/${state.season?.draws||0}T/${state.season?.losses||0}D.`,'season');
    state.season={id:sid,games:0,wins:0,draws:0,losses:0,startedAt:new Date().toISOString()};
  }
  const s={...state.season}; s.games++; if(record.outcome==='win')s.wins++; else if(record.outcome==='loss')s.losses++; else s.draws++; state.season=s;
  const rec={...state.records}; const plies=record.moves?.length||0;
  rec.currentWinStreak=record.outcome==='win'?(rec.currentWinStreak||0)+1:0; rec.bestWinStreak=Math.max(rec.bestWinStreak||0,rec.currentWinStreak);
  if(record.outcome==='win'&&(!rec.fastestWinPlies||plies<rec.fastestWinPlies)){rec.fastestWinPlies=plies;state=milestone(state,`Nueva victoria más rápida: ${Math.ceil(plies/2)} movimientos.`);}
  if(plies>(rec.longestGamePlies||0)){rec.longestGamePlies=plies;state=milestone(state,`Nueva partida más larga: ${Math.ceil(plies/2)} movimientos.`);}
  if(record.outcome==='win'&&Number(record.difficulty||0)>Number(rec.highestDifficultyWin||0)){rec.highestDifficultyWin=Number(record.difficulty||0);state=milestone(state,`Nueva dificultad máxima vencida: nivel ${record.difficulty}.`);}
  if (record.outcome==='win' && meta.suddenDeath) rec.suddenDeathWins = Number(rec.suddenDeathWins||0)+1;
  state.records=rec;
  const rhythm=record.timeControl?.id||'none'; const by={...(state.byTimeControl||{})}; const row={games:0,wins:0,draws:0,losses:0,...(by[rhythm]||{})}; row.games++; row[record.outcome==='win'?'wins':record.outcome==='loss'?'losses':'draws']++; by[rhythm]=row; state.byTimeControl=by;
  state.pressure = { moves: Number(state.pressure?.moves||0)+Number(meta.pressureMoves||0), incidents: Number(state.pressure?.incidents||0)+Number(meta.pressureIncidents||0) };
  const cr=contractResult(meta.contract,record,meta);
  if(cr){state.contracts={...state.contracts,offered:(state.contracts?.offered||0)+1,completed:(state.contracts?.completed||0)+(cr.success?1:0),failed:(state.contracts?.failed||0)+(cr.success?0:1)};state=milestone(state,`${cr.success?'Reto superado':'Reto fallido'} · ${cr.label}.`,cr.success?'contract-win':'contract-loss');}
  return saveCareer(state);
}


// Backfill seguro para usuarios que ya tenían partidas antes de que existiera
// Centro de Operaciones. El Historial es la fuente de verdad para estadísticas
// básicas demostrables; no reconstruimos contratos, presión ni logros que no se
// medían en aquellas versiones.
export function reconcileCareerHistory(history = []) {
  const rows = (Array.isArray(history) ? history : [])
    .filter((r) => ['win', 'draw', 'loss'].includes(r?.outcome))
    .sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));
  let state = loadCareer();
  if (!rows.length) return state;

  const sid = monthId();
  const currentMonth = rows.filter((r) => {
    const d = new Date(r.date || 0);
    return Number.isFinite(d.getTime()) && monthId(d) === sid;
  });
  const trackedGames = Object.values(state.byTimeControl || {}).reduce((sum, row) => sum + Number(row?.games || 0), 0);
  let changed = false;

  if (state.season?.id !== sid || currentMonth.length > Number(state.season?.games || 0)) {
    const season = { id: sid, games: currentMonth.length, wins: 0, draws: 0, losses: 0, startedAt: currentMonth[0]?.date || new Date().toISOString() };
    for (const row of currentMonth) season[row.outcome === 'win' ? 'wins' : row.outcome === 'loss' ? 'losses' : 'draws'] += 1;
    state = { ...state, season };
    changed = true;
  }

  if (rows.length > trackedGames) {
    const byTimeControl = {};
    let fastestWinPlies = null;
    let longestGamePlies = 0;
    let highestDifficultyWin = 0;
    let bestWinStreak = 0;
    let currentWinStreak = 0;

    for (const row of rows) {
      const plies = row.moves?.length || 0;
      longestGamePlies = Math.max(longestGamePlies, plies);
      if (row.outcome === 'win') {
        currentWinStreak += 1;
        bestWinStreak = Math.max(bestWinStreak, currentWinStreak);
        if (!fastestWinPlies || (plies > 0 && plies < fastestWinPlies)) fastestWinPlies = plies || fastestWinPlies;
        highestDifficultyWin = Math.max(highestDifficultyWin, Number(row.difficulty || 0));
      } else {
        currentWinStreak = 0;
      }
      const rhythm = row.timeControl?.id || 'none';
      const bucket = { games: 0, wins: 0, draws: 0, losses: 0, ...(byTimeControl[rhythm] || {}) };
      bucket.games += 1;
      bucket[row.outcome === 'win' ? 'wins' : row.outcome === 'loss' ? 'losses' : 'draws'] += 1;
      byTimeControl[rhythm] = bucket;
    }

    state = {
      ...state,
      byTimeControl,
      records: {
        ...state.records,
        fastestWinPlies: fastestWinPlies ?? state.records?.fastestWinPlies ?? null,
        longestGamePlies: Math.max(Number(state.records?.longestGamePlies || 0), longestGamePlies),
        highestDifficultyWin: Math.max(Number(state.records?.highestDifficultyWin || 0), highestDifficultyWin),
        bestWinStreak: Math.max(Number(state.records?.bestWinStreak || 0), bestWinStreak),
        currentWinStreak,
      },
    };
    changed = true;
  }

  return changed ? saveCareer(state) : state;
}

export function startSpecialRun(mode='streak') {
  const baseRun = {id:`${mode}-${Date.now()}`,mode,active:true,stage:0,completedStages:0,wins:0,draws:0,losses:0,points:0,startedAt:new Date().toISOString()};
  const run = mode==='boss'
    ? {...baseRun,difficulty:35}
    : mode==='cup'
      ? {...baseRun,difficulty:55,totalGames:8}
      : {...baseRun,difficulty:30};
  return saveSpecialRun(run);
}
export function loadSpecialRun(){try{return JSON.parse(getStorageItem(STORAGE_LOCAL, RUN_KEY)||'null');}catch{return null;}}
export function saveSpecialRun(run){ if(run) setProfileStorageItem(RUN_KEY,JSON.stringify(run)); return run; }
export function clearSpecialRun(){ removeProfileStorageItem(RUN_KEY); return null; }
function persistRun(run){ if(run?.active)saveSpecialRun(run); else clearSpecialRun(); return run; }
export function recordSpecialRunResult(run,outcome){
  if(!run?.active)return run;
  if (run.mode === 'cup') {
    const wins=(run.wins||0)+(outcome==='win'?1:0), draws=(run.draws||0)+(outcome==='draw'?1:0), losses=(run.losses||0)+(outcome==='loss'?1:0);
    const completed=(run.completedStages||0)+1; const points=wins+draws*.5;
    let next={...run,wins,draws,losses,points,completedStages:completed,stage:completed};
    if(completed>=Number(run.totalGames||8)){
      next={...next,active:false,outcome:points>=4.5?'win':points===4?'draw':'loss',endedAt:new Date().toISOString()};
      let s=loadCareer(); s.records={...s.records,bestCupScore:Math.max(Number(s.records?.bestCupScore||0),points)};
      s=milestone(s,`Copa de 8 cerrada: ${wins}V/${draws}T/${losses}D · ${points} puntos.`,'cup'); s.runHistory=[next,...(s.runHistory||[])].slice(0,40); saveCareer(s); return persistRun(next);
    }
    return persistRun(next);
  }
  if(outcome!=='win'){
    const ended={...run,active:false,outcome,endedAt:new Date().toISOString()}; persistRun(ended); let s=loadCareer(); s.runHistory=[ended,...(s.runHistory||[])].slice(0,40); saveCareer(s); return ended;
  }
  const wins=(run.wins||0)+1, completed=(run.completedStages||0)+1;
  let next={...run,wins,completedStages:completed,stage:(run.stage||0)+1};
  if(run.mode==='boss'){
    if(completed>=6){next={...next,active:false,outcome:'win',endedAt:new Date().toISOString()};let s=loadCareer();s.records={...s.records,bestBossStage:Math.max(s.records?.bestBossStage||0,6)};s=milestone(s,'Boss Run completado. Seis fases. Ningún testigo creíble.');s.runHistory=[next,...(s.runHistory||[])].slice(0,40);saveCareer(s);return persistRun(next);}
    next.difficulty=Math.min(100,35+completed*12);
  }else{
    next.difficulty=Math.min(100,Number(run.difficulty||30)+7);
    let s=loadCareer();s.records={...s.records,bestStreakRun:Math.max(s.records?.bestStreakRun||0,wins)};saveCareer(s);
  }
  return persistRun(next);
}

export function recordPuzzleRush(score){let s=loadCareer();const prev=s.records?.puzzleRushBest||0;if(score>prev){s.records={...s.records,puzzleRushBest:score};s=milestone(s,`Nuevo récord de Puzzle Rush: ${score} resueltos.`);}return saveCareer(s);}

export function unlockedBoardThemes(career=loadCareer()) { return hasAdminPreviewAccess() ? BOARD_THEMES : BOARD_THEMES.filter((t)=>t.unlock(career)); }
export function loadBoardTheme() {
  const id=getStorageItem(STORAGE_LOCAL, BOARD_THEME_KEY)||'classic';
  const allowed=new Set(unlockedBoardThemes().map((t)=>t.id));
  return allowed.has(id)?id:'classic';
}
export function saveBoardTheme(id) {
  const allowed=new Set(unlockedBoardThemes().map((t)=>t.id));
  setProfileStorageItem(BOARD_THEME_KEY,allowed.has(id)?id:'classic');
  return loadBoardTheme();
}
