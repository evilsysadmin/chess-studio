import { Chess } from 'chess.js';

export function buildSchoolMovePlayback({ fen, line = [], lineIndex = 0, from, to } = {}) {
  const expected = line[lineIndex];
  if (!expected || expected.auto || expected.from !== from || expected.to !== to) {
    return { ok: false, reason: 'unexpected-move', frames: [], cursor: lineIndex };
  }

  let board;
  try {
    board = new Chess(fen);
  } catch {
    return { ok: false, reason: 'invalid-fen', frames: [], cursor: lineIndex };
  }

  const frames = [];
  let cursor = lineIndex;
  const apply = (step, auto) => {
    let move = null;
    try {
      move = board.move({ from: step.from, to: step.to, promotion: 'q' });
    } catch {
      move = null;
    }
    if (!move) return false;
    cursor += 1;
    frames.push(Object.freeze({
      fen: board.fen(),
      cursor,
      auto,
      note: step.note || null,
      animate: Object.freeze({
        from: step.from,
        to: step.to,
        capture: Boolean(move.captured),
      }),
    }));
    return true;
  };

  if (!apply(expected, false)) {
    return { ok: false, reason: 'illegal-human-move', frames: [], cursor: lineIndex };
  }

  while (cursor < line.length && line[cursor]?.auto) {
    if (!apply(line[cursor], true)) {
      return { ok: false, reason: 'illegal-auto-reply', frames, cursor };
    }
  }

  return Object.freeze({
    ok: true,
    reason: null,
    frames: Object.freeze(frames),
    cursor,
    complete: cursor >= line.length,
    autoReplies: frames.filter((frame) => frame.auto).length,
    finalFen: frames.at(-1)?.fen || fen,
  });
}

export function schoolPlaybackDelay({ reducedMotion = false, auto = false } = {}) {
  if (reducedMotion) return 0;
  return auto ? 300 : 250;
}
