export const WAR_ROOM_TUTORIAL_ID = 'war-room-basics';

export const WAR_ROOM_TUTORIAL_PHASE = Object.freeze({
  SELECT: 'select',
  BLOCKED: 'blocked',
  MOVE: 'move',
  COMPLETE: 'complete',
});

export function resolveWarRoomTutorialPhase({
  selectedSquare = '',
  legalTargetCount = 0,
  historyLength = 0,
  baselineHistoryLength = 0,
} = {}) {
  if (Number(historyLength) > Number(baselineHistoryLength)) {
    return WAR_ROOM_TUTORIAL_PHASE.COMPLETE;
  }
  if (!String(selectedSquare || '').trim()) {
    return WAR_ROOM_TUTORIAL_PHASE.SELECT;
  }
  if (Number(legalTargetCount) > 0) {
    return WAR_ROOM_TUTORIAL_PHASE.MOVE;
  }
  return WAR_ROOM_TUTORIAL_PHASE.BLOCKED;
}

export function warRoomTutorialCopy(phase) {
  switch (phase) {
    case WAR_ROOM_TUTORIAL_PHASE.BLOCKED:
      return 'Esa pieza no tiene una salida legal ahora mismo. Pruebe con otra. El tablero no negocia, por desgracia.';
    case WAR_ROOM_TUTORIAL_PHASE.MOVE:
      return 'Bien. Las casillas iluminadas son sus jugadas legales. Elija una y mueva antes de que me arrepienta de haberle dado instrucciones.';
    case WAR_ROOM_TUTORIAL_PHASE.COMPLETE:
      return 'Perfecto. Ya sabe mover. Ahora queda aprender a jugar. Ese problema, me temo, llevará algo más de tiempo.';
    case WAR_ROOM_TUTORIAL_PHASE.SELECT:
    default:
      return 'Bien. Antes de que haga una barbaridad, pulse una de sus piezas. Le enseñaré dónde puede moverla.';
  }
}
