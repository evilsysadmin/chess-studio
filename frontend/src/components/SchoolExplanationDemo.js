import { Chess } from 'chess.js';

export function buildSchoolExplanationDemo({ fen, line = [] } = {}) {
  let board;
  try { board = new Chess(fen); } catch { return { ok: false, reason: 'invalid-fen', frames: [] }; }

  const frames = [Object.freeze({
    fen: board.fen(),
    index: 0,
    auto: false,
    note: 'Posición inicial',
    animate: null,
  })];

  for (let index = 0; index < line.length; index += 1) {
    const step = line[index];
    let move = null;
    try { move = board.move({ from: step.from, to: step.to, promotion: 'q' }); } catch { move = null; }
    if (!move) {
      return { ok: false, reason: 'illegal-demo-line', brokenIndex: index, frames: Object.freeze(frames) };
    }
    frames.push(Object.freeze({
      fen: board.fen(),
      index: index + 1,
      auto: Boolean(step.auto),
      note: step.note || null,
      animate: Object.freeze({ from: step.from, to: step.to, capture: Boolean(move.captured) }),
    }));
  }

  return Object.freeze({ ok: true, reason: null, frames: Object.freeze(frames), finalIndex: frames.length - 1 });
}

export function schoolExplanationFrameLabel(frame) {
  if (!frame || frame.index === 0) return 'Posición inicial';
  return frame.auto ? 'Respuesta rival' : 'Jugada clave';
}
