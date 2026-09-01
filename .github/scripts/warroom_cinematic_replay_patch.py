from pathlib import Path


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f"missing marker: {label}")
    return text.replace(old, new, 1)


helper = """export function replayMoveAnimation(move, step, previousStep, movieMode = false) {
  if (!movieMode || !move || step <= 0 || step != previousStep + 1) return null;
  if (!move.from || !move.to) return null;
  return {
    from: move.from,
    to: move.to,
    seq: `movie-${step}`,
    capture: Boolean(move.captured),
    kind: 'move',
  };
}

export function replayMatthiasKingColor(humanColor) {
  return humanColor === 'b' ? 'w' : 'b';
}

export function replayCinematicCue(moveReport) {
  if (moveReport?.severity === 'blunder') return 'critical';
  if (moveReport?.severity === 'mistake') return 'dramatic';
  return 'normal';
}
"""
Path("frontend/src/replayCinematic.js").write_text(helper, encoding="utf-8")

helper_test = """import { describe, expect, it } from 'vitest';
import { replayCinematicCue, replayMatthiasKingColor, replayMoveAnimation } from './replayCinematic.js';

describe('replayCinematic', () => {
  it('animates only a forward movie step', () => {
    const move = { from: 'e2', to: 'e4', captured: null };
    expect(replayMoveAnimation(move, 4, 3, true)).toMatchObject({ from: 'e2', to: 'e4', seq: 'movie-4', capture: false });
    expect(replayMoveAnimation(move, 3, 4, true)).toBeNull();
    expect(replayMoveAnimation(move, 4, 3, false)).toBeNull();
  });

  it('preserves capture weight and puts Matthias on the CPU side', () => {
    expect(replayMoveAnimation({ from: 'd5', to: 'e4', captured: 'p' }, 9, 8, true)?.capture).toBe(true);
    expect(replayMatthiasKingColor('w')).toBe('b');
    expect(replayMatthiasKingColor('b')).toBe('w');
  });

  it('maps only post-game analysis severity to cinematic emphasis', () => {
    expect(replayCinematicCue({ severity: 'blunder' })).toBe('critical');
    expect(replayCinematicCue({ severity: 'mistake' })).toBe('dramatic');
    expect(replayCinematicCue({ severity: 'ok' })).toBe('normal');
  });
});
"""
Path("frontend/src/replayCinematic.test.js").write_text(helper_test, encoding="utf-8")

p = Path("frontend/src/components/ReplayScreen.jsx")
s = p.read_text(encoding="utf-8")
s = replace_once(s, "import { useEffect, useMemo, useState } from 'react';\n", "import { useEffect, useMemo, useRef, useState } from 'react';\n", "react useRef")
s = replace_once(s, "import Board from './Board.jsx';\n", "import Board from './Board.jsx';\nimport Board3D from './Board3D.jsx';\n", "Board3D import")
s = replace_once(s, "import { replayFenPositions } from '../chessRules.js';\n", "import { replayFenPositions } from '../chessRules.js';\nimport { checkedKingSquare } from '../boardState.js';\nimport { replayCinematicCue, replayMatthiasKingColor, replayMoveAnimation } from '../replayCinematic.js';\n", "cinematic imports")
s = replace_once(s,
"  const [moviePlaying, setMoviePlaying] = useState(false);\n  const [movieSpeed, setMovieSpeed] = useState(1);\n",
"  const [moviePlaying, setMoviePlaying] = useState(false);\n  const [movieSpeed, setMovieSpeed] = useState(1);\n  const previousMovieStepRef = useRef(initialStep ?? positions.length - 1);\n",
"movie step ref")

needle = "  const moveReportAtStep = moveIndexAtStep !== null ? reportByIndex.get(moveIndexAtStep) : null;\n"
insert = """  const moveReportAtStep = moveIndexAtStep !== null ? reportByIndex.get(moveIndexAtStep) : null;
  const previousMovieStep = previousMovieStepRef.current;
  const cinematicAnimation = replayMoveAnimation(moveAtStep, step, previousMovieStep, movieMode);
  const cinematicCue = replayCinematicCue(moveReportAtStep);
  const replayCheckSquare = movieMode ? checkedKingSquare(fen) : null;
  const replayGameOver = step === positions.length - 1 && Boolean(record.outcome);

  useEffect(() => {
    previousMovieStepRef.current = step;
  }, [step]);
"""
s = replace_once(s, needle, insert, "cinematic state")

old_board = """          <Board
            fen={fen}
            lastMove={lastMoveSquares}
            hintMove={hintMove}
            mistakeMove={mistakeMove}
            orientation={record.humanColor === 'b' ? 'black' : 'white'}
          />
"""
new_board = """          {movieMode ? (
            <Board3D
              fen={fen}
              lastMove={lastMoveSquares}
              hintMove={hintMove}
              orientation={record.humanColor === 'b' ? 'black' : 'white'}
              animate={cinematicAnimation}
              checkSquare={replayCheckSquare}
              gameOver={replayGameOver}
              matthiasKingColor={replayMatthiasKingColor(record.humanColor)}
              cinematicMode
              cinematicCue={cinematicCue}
            />
          ) : (
            <Board
              fen={fen}
              lastMove={lastMoveSquares}
              hintMove={hintMove}
              mistakeMove={mistakeMove}
              orientation={record.humanColor === 'b' ? 'black' : 'white'}
            />
          )}
"""
s = replace_once(s, old_board, new_board, "movie 3D board")
p.write_text(s, encoding="utf-8")

p = Path("frontend/src/components/Board3D.jsx")
s = p.read_text(encoding="utf-8")
s = replace_once(s,
"  gameOver = false,\n  showCoordinates = true,\n",
"  gameOver = false,\n  cinematicMode = false,\n  cinematicCue = 'normal',\n  showCoordinates = true,\n",
"cinematic props")
s = replace_once(s,
"  const inspectModeRef = useRef(false);\n  const cameraMotionRef = useRef({ x: 0, y: 0, targetX: 0, targetY: 0, yaw: 0, pitch: 0, dragging: false, lastX: 0, lastY: 0 });\n",
"  const inspectModeRef = useRef(false);\n  const cinematicResetTimeoutRef = useRef(null);\n  const cameraMotionRef = useRef({ x: 0, y: 0, targetX: 0, targetY: 0, yaw: 0, pitch: 0, dragging: false, lastX: 0, lastY: 0, cinematicZoom: 0, cinematicTargetZoom: 0, cinematicFocusX: 0, cinematicTargetFocusX: 0, cinematicFocusZ: 0, cinematicTargetFocusZ: 0 });\n",
"cinematic motion refs")

old_active = """      const activeMotion = motion.dragging || Math.abs(motion.x - motion.targetX) > 0.003 || Math.abs(motion.y - motion.targetY) > 0.003;
      const interval = activeMotion ? 16 : 33;
"""
new_active = """      const cinematicActive = Math.abs(motion.cinematicZoom - motion.cinematicTargetZoom) > 0.001
        || Math.abs(motion.cinematicFocusX - motion.cinematicTargetFocusX) > 0.004
        || Math.abs(motion.cinematicFocusZ - motion.cinematicTargetFocusZ) > 0.004;
      const activeMotion = motion.dragging || cinematicActive || Math.abs(motion.x - motion.targetX) > 0.003 || Math.abs(motion.y - motion.targetY) > 0.003;
      const interval = activeMotion ? 16 : 33;
"""
s = replace_once(s, old_active, new_active, "cinematic active loop")

old_smooth = """        motion.x += (motion.targetX - motion.x) * 0.075;
        motion.y += (motion.targetY - motion.y) * 0.075;
        const basePosition = camera.userData.basePosition;
"""
new_smooth = """        motion.x += (motion.targetX - motion.x) * 0.075;
        motion.y += (motion.targetY - motion.y) * 0.075;
        motion.cinematicZoom += (motion.cinematicTargetZoom - motion.cinematicZoom) * 0.12;
        motion.cinematicFocusX += (motion.cinematicTargetFocusX - motion.cinematicFocusX) * 0.11;
        motion.cinematicFocusZ += (motion.cinematicTargetFocusZ - motion.cinematicFocusZ) * 0.11;
        const basePosition = camera.userData.basePosition;
"""
s = replace_once(s, old_smooth, new_smooth, "cinematic smoothing")

old_camera = """          const offset = basePosition.clone().sub(baseTarget).applyEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
          camera.position.copy(baseTarget).add(offset);
          camera.lookAt(baseTarget.clone().add(new THREE.Vector3(motion.x * 0.035, -motion.y * 0.018, 0)));
"""
new_camera = """          const offset = basePosition.clone().sub(baseTarget)
            .multiplyScalar(1 - motion.cinematicZoom)
            .applyEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
          camera.position.copy(baseTarget).add(offset);
          camera.lookAt(baseTarget.clone().add(new THREE.Vector3(
            motion.x * 0.035 + motion.cinematicFocusX,
            -motion.y * 0.018,
            motion.cinematicFocusZ,
          )));
"""
s = replace_once(s, old_camera, new_camera, "cinematic camera")

cleanup_old = """      window.cancelAnimationFrame(ambientFrameRef.current);
      ambientFrameRef.current = 0;
      observer?.disconnect();
"""
cleanup_new = """      window.cancelAnimationFrame(ambientFrameRef.current);
      ambientFrameRef.current = 0;
      if (cinematicResetTimeoutRef.current) clearTimeout(cinematicResetTimeoutRef.current);
      cinematicResetTimeoutRef.current = null;
      observer?.disconnect();
"""
s = replace_once(s, cleanup_old, cleanup_new, "cinematic cleanup")

highlight_marker = """useEffect(() => {
  const state = sceneStateRef.current;
  if (!state) return;
  const lights = reactiveLightProfile({ check: Boolean(checkSquare), gameOver, coarsePointer: state.coarsePointer });
"""
cinematic_effect = """useEffect(() => {
  if (!cinematicMode || !animate?.seq || getEffectiveReducedMotion()) return undefined;
  const state = sceneStateRef.current;
  if (!state || state.coarsePointer) return undefined;
  const motion = cameraMotionRef.current;
  const target = squarePosition(animate.to);
  const cueZoom = cinematicCue === 'critical' ? 0.072 : cinematicCue === 'dramatic' ? 0.055 : animate.capture ? 0.048 : 0.032;
  motion.cinematicTargetZoom = cueZoom;
  motion.cinematicTargetFocusX = THREE.MathUtils.clamp(target.x * 0.018, -0.065, 0.065);
  motion.cinematicTargetFocusZ = THREE.MathUtils.clamp(target.z * 0.014, -0.05, 0.05);
  if (cinematicResetTimeoutRef.current) clearTimeout(cinematicResetTimeoutRef.current);
  cinematicResetTimeoutRef.current = setTimeout(() => {
    motion.cinematicTargetZoom = 0;
    motion.cinematicTargetFocusX = 0;
    motion.cinematicTargetFocusZ = 0;
    cinematicResetTimeoutRef.current = null;
  }, cinematicCue === 'critical' ? 1050 : cinematicCue === 'dramatic' ? 820 : 620);
  return () => {
    if (cinematicResetTimeoutRef.current) clearTimeout(cinematicResetTimeoutRef.current);
    cinematicResetTimeoutRef.current = null;
    motion.cinematicTargetZoom = 0;
    motion.cinematicTargetFocusX = 0;
    motion.cinematicTargetFocusZ = 0;
  };
}, [cinematicMode, cinematicCue, animate?.seq, animate?.to, animate?.capture]);

""" + highlight_marker
s = replace_once(s, highlight_marker, cinematic_effect, "cinematic cue effect")

s = replace_once(s,
"      data-board3d-inspect={inspectMode ? 'true' : 'false'}\n      data-matthias-rival-king={matthiasKingColor || 'off'}\n",
"      data-board3d-inspect={inspectMode ? 'true' : 'false'}\n      data-board3d-cinematic={cinematicMode ? cinematicCue : 'off'}\n      data-matthias-rival-king={matthiasKingColor || 'off'}\n",
"cinematic data attr")
s = replace_once(s,
"      <button type=\"button\" className=\"board3d-inspect secondary-btn\" aria-pressed={inspectMode} onClick={() => setInspectMode((value) => !value)}>{inspectMode ? 'Volver a jugar' : 'Inspeccionar'}</button>\n",
"      {!cinematicMode && <button type=\"button\" className=\"board3d-inspect secondary-btn\" aria-pressed={inspectMode} onClick={() => setInspectMode((value) => !value)}>{inspectMode ? 'Volver a jugar' : 'Inspeccionar'}</button>}\n",
"hide inspect in movie")
p.write_text(s, encoding="utf-8")
