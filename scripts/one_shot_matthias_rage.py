from pathlib import Path


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f'Pattern not found in {path}: {old[:100]!r}')
    p.write_text(text.replace(old, new, 1))


Path('frontend/src/matthiasWarRoomRage.js').write_text("""const PIECE_VALUES = Object.freeze({ p: 1, n: 3, b: 3, r: 5, q: 9 });

export function capturedMaterialAgainstCpu(history = []) {
  return (Array.isArray(history) ? history : []).reduce((total, move) => {
    if (move?.by !== 'human' || !move?.captured) return total;
    return total + Number(PIECE_VALUES[move?.capturedPiece] || 0);
  }, 0);
}

export function matthiasRageLevel(history = []) {
  const captured = capturedMaterialAgainstCpu(history);
  if (captured >= 13) return 3;
  if (captured >= 7) return 2;
  if (captured >= 3) return 1;
  return 0;
}

export function matthiasRageLabel(level) {
  if (Number(level) >= 3) return 'furious';
  if (Number(level) >= 2) return 'angry';
  if (Number(level) >= 1) return 'annoyed';
  return 'stern';
}
""")

Path('frontend/src/matthiasWarRoomRage.test.js').write_text("""import { describe, expect, it } from 'vitest';
import { capturedMaterialAgainstCpu, matthiasRageLabel, matthiasRageLevel } from './matthiasWarRoomRage.js';

describe('Matthias War Room rage', () => {
  it('suma sólo material capturado por el humano', () => {
    const history = [
      { by: 'human', captured: true, capturedPiece: 'p' },
      { by: 'cpu', captured: true, capturedPiece: 'q' },
      { by: 'human', captured: false, capturedPiece: null },
      { by: 'human', captured: true, capturedPiece: 'r' },
    ];
    expect(capturedMaterialAgainstCpu(history)).toBe(6);
  });

  it('escala de severo a furioso según el daño real al ejército rival', () => {
    expect(matthiasRageLevel([])).toBe(0);
    expect(matthiasRageLevel([{ by:'human', captured:true, capturedPiece:'n' }])).toBe(1);
    expect(matthiasRageLevel([{ by:'human', captured:true, capturedPiece:'q' }])).toBe(2);
    expect(matthiasRageLevel([
      { by:'human', captured:true, capturedPiece:'q' },
      { by:'human', captured:true, capturedPiece:'r' },
    ])).toBe(3);
    expect(matthiasRageLabel(3)).toBe('furious');
  });
});
""")

replace_once(
    'frontend/src/components/GameBoardView.jsx',
    "import { getBoardRenderer, setBoardRenderer, USER_PREFERENCES_CHANGED_EVENT } from '../userPreferences.js';\n",
    "import { getBoardRenderer, setBoardRenderer, USER_PREFERENCES_CHANGED_EVENT } from '../userPreferences.js';\nimport { capturedMaterialAgainstCpu, matthiasRageLevel } from '../matthiasWarRoomRage.js';\n",
)
replace_once(
    'frontend/src/components/GameBoardView.jsx',
    "  const latestBoardBubble = [...(side.gameChat || [])]\n    .reverse()\n    .find((message) => message?.by === 'cpu' && message?.text && BOARD_BUBBLE_EVENTS.has(message?.event));\n",
    "  const latestBoardBubble = [...(side.gameChat || [])]\n    .reverse()\n    .find((message) => message?.by === 'cpu' && message?.text && BOARD_BUBBLE_EVENTS.has(message?.event));\n  const matthiasCapturedMaterial = capturedMaterialAgainstCpu(game.history);\n  const matthiasRage = matthiasRageLevel(game.history);\n",
)
replace_once(
    'frontend/src/components/GameBoardView.jsx',
    "                  speechText={latestMatthiasMessage?.text || ''}\n                />",
    "                  speechText={latestMatthiasMessage?.text || ''}\n                  rageLevel={matthiasRage}\n                  capturedMaterial={matthiasCapturedMaterial}\n                />",
)

Path('frontend/src/components/MatthiasWarRoomPortrait.jsx').write_text("""import { useEffect, useState } from 'react';
import { getEffectiveReducedMotion } from '../userPreferences.js';
import './MatthiasWarRoomPortrait.css';
import './WarRoomReferencePolish.css';

function speechDuration(text) {
  return Math.max(1500, Math.min(4200, String(text || '').length * 46));
}

export function nextWarRoomGesture(random = Math.random) {
  const roll = random();
  if (roll < 0.18) return 'coffee';
  if (roll < 0.42) return 'order';
  return 'glance';
}

export default function MatthiasWarRoomPortrait({ avatar, speechKey = '', speechText = '', rageLevel = 0, capturedMaterial = 0 }) {
  const [speaking, setSpeaking] = useState(false);
  const [gesture, setGesture] = useState('idle');
  const rage = Math.max(0, Math.min(3, Number(rageLevel) || 0));

  useEffect(() => {
    if (!speechKey || !speechText || getEffectiveReducedMotion()) return undefined;
    setSpeaking(true);
    const timer = window.setTimeout(() => setSpeaking(false), speechDuration(speechText));
    return () => window.clearTimeout(timer);
  }, [speechKey, speechText]);

  useEffect(() => {
    if (getEffectiveReducedMotion()) return undefined;
    let gestureTimer = 0;
    let resetTimer = 0;
    let cancelled = false;
    const schedule = () => {
      const delay = 15000 + Math.round(Math.random() * 21000);
      gestureTimer = window.setTimeout(() => {
        if (cancelled) return;
        const next = nextWarRoomGesture();
        setGesture(next);
        const duration = next === 'coffee' ? 4600 : next === 'order' ? 1800 : 2100;
        resetTimer = window.setTimeout(() => {
          if (cancelled) return;
          setGesture('idle');
          schedule();
        }, duration);
      }, delay);
    };
    schedule();
    return () => {
      cancelled = true;
      window.clearTimeout(gestureTimer);
      window.clearTimeout(resetTimer);
    };
  }, []);

  const ordering = speaking || gesture === 'order';
  const stateClass = [
    `rage-${rage}`,
    speaking ? 'is-speaking' : '',
    ordering ? 'is-ordering' : '',
    gesture === 'glance' ? 'is-glancing' : '',
    gesture === 'coffee' ? 'has-coffee' : '',
  ].filter(Boolean).join(' ');

  return (
    <div
      className={`game-3d-matthias-portrait-wrap ${stateClass}`}
      data-matthias-warroom-gesture={gesture}
      data-matthias-rage={rage}
      data-matthias-captured-material={Math.max(0, Number(capturedMaterial) || 0)}
    >
      <img src={avatar} alt="Matthias, peón militar" className="game-3d-matthias-portrait" />
      <span className="game-3d-matthias-rage-brows" aria-hidden="true"><i /><b /></span>
      <span className="game-3d-matthias-mouth" aria-hidden="true" />
      <span className="game-3d-matthias-rage-teeth" aria-hidden="true" />
      <span className="game-3d-matthias-coffee" aria-hidden="true"><i /><b /></span>
      <span className="game-3d-matthias-rank" aria-hidden="true">♟</span>
    </div>
  );
}
""")

Path('frontend/src/components/MatthiasWarRoomPortrait.css').write_text(""".game-3d-matthias-portrait-wrap { isolation: isolate; }
.game-3d-matthias-portrait-wrap .game-3d-matthias-portrait { transform-origin: 50% 72%; transition: transform .55s cubic-bezier(.2,.75,.2,1), filter .35s ease; }
.game-3d-matthias-portrait-wrap.rage-1 .game-3d-matthias-portrait { filter: contrast(1.035) saturate(1.02); }
.game-3d-matthias-portrait-wrap.rage-2 .game-3d-matthias-portrait { filter: contrast(1.075) saturate(1.045); }
.game-3d-matthias-portrait-wrap.rage-3 .game-3d-matthias-portrait { filter: contrast(1.13) saturate(1.07); }
.game-3d-matthias-rage-brows { position:absolute; z-index:5; left:50%; top:43.7%; width:38%; height:10%; opacity:0; transform:translateX(-50%); pointer-events:none; transition:opacity .3s ease, transform .3s ease; }
.game-3d-matthias-rage-brows i, .game-3d-matthias-rage-brows b { position:absolute; top:39%; width:35%; height:3px; border-radius:999px; background:rgba(28,14,8,.88); box-shadow:0 1px 1px rgba(255,221,175,.1); }
.game-3d-matthias-rage-brows i { left:7%; transform:rotate(17deg); transform-origin:right center; }
.game-3d-matthias-rage-brows b { right:7%; transform:rotate(-17deg); transform-origin:left center; }
.game-3d-matthias-portrait-wrap.rage-1 .game-3d-matthias-rage-brows { opacity:.28; }
.game-3d-matthias-portrait-wrap.rage-2 .game-3d-matthias-rage-brows { opacity:.58; transform:translateX(-50%) translateY(1px) scaleX(1.03); }
.game-3d-matthias-portrait-wrap.rage-3 .game-3d-matthias-rage-brows { opacity:.9; transform:translateX(-50%) translateY(2px) scaleX(1.08); }
.game-3d-matthias-portrait-wrap.rage-2 .game-3d-matthias-rage-brows i, .game-3d-matthias-portrait-wrap.rage-2 .game-3d-matthias-rage-brows b { height:4px; }
.game-3d-matthias-portrait-wrap.rage-3 .game-3d-matthias-rage-brows i, .game-3d-matthias-portrait-wrap.rage-3 .game-3d-matthias-rage-brows b { height:5px; }
.game-3d-matthias-mouth { position:absolute; z-index:6; left:50%; top:57.5%; width:9.5%; height:2px; border-radius:999px; background:rgba(34,19,12,.78); box-shadow:0 1px 1px rgba(255,221,175,.18); opacity:0; transform:translateX(-50%) scaleX(.9) scaleY(.45); pointer-events:none; }
.game-3d-matthias-portrait-wrap.is-speaking .game-3d-matthias-mouth { opacity:.78; animation:matthias-warroom-mouth .22s steps(2,end) infinite; }
.game-3d-matthias-rage-teeth { position:absolute; z-index:6; left:50%; top:57.25%; width:11.5%; height:5px; border:1px solid rgba(39,20,12,.78); border-radius:2px; background:repeating-linear-gradient(90deg, rgba(236,220,184,.95) 0 4px, rgba(95,68,48,.78) 4px 5px); box-shadow:0 1px 2px rgba(0,0,0,.38); opacity:0; transform:translateX(-50%) scaleX(.86); pointer-events:none; transition:opacity .2s ease, transform .25s ease; }
.game-3d-matthias-portrait-wrap.rage-3:not(.is-speaking) .game-3d-matthias-rage-teeth { opacity:.88; transform:translateX(-50%) scaleX(1); }
.game-3d-matthias-portrait-wrap.is-speaking .game-3d-matthias-portrait { animation:matthias-warroom-address 1.15s ease-in-out infinite alternate; }
.game-3d-matthias-portrait-wrap.is-glancing .game-3d-matthias-portrait { transform:scale(1.018) translateX(1.3%) rotate(.35deg); filter:saturate(1.02) brightness(1.04) contrast(1.045) drop-shadow(0 12px 18px rgba(0,0,0,.32)); }
.game-3d-matthias-portrait-wrap.rage-3:not(.is-speaking):not(.is-ordering):not(.is-glancing) .game-3d-matthias-portrait { animation:matthias-rage-simmer 3.6s steps(2,end) infinite; }
.game-3d-matthias-coffee { position:absolute; z-index:5; right:8%; bottom:8%; width:30px; height:20px; border:2px solid rgba(213,174,92,.86); border-top-color:rgba(244,226,183,.9); border-radius:3px 3px 8px 8px; background:linear-gradient(180deg,#d8c39b,#9f8254 74%,#6c4b28); box-shadow:0 8px 12px rgba(0,0,0,.28),inset 0 2px rgba(255,255,255,.22); opacity:0; transform:translateY(10px) rotate(-5deg) scale(.88); transition:opacity .35s ease,transform .55s cubic-bezier(.2,.8,.2,1); pointer-events:none; }
.game-3d-matthias-coffee::after { content:''; position:absolute; right:-10px; top:4px; width:10px; height:10px; border:2px solid rgba(213,174,92,.82); border-left:0; border-radius:0 8px 8px 0; }
.game-3d-matthias-coffee i, .game-3d-matthias-coffee b { position:absolute; left:8px; bottom:22px; width:2px; height:13px; border-radius:50%; background:linear-gradient(180deg,transparent,rgba(238,231,215,.62)); opacity:.7; }
.game-3d-matthias-coffee b { left:17px; height:16px; opacity:.48; }
.game-3d-matthias-portrait-wrap.has-coffee .game-3d-matthias-coffee { opacity:1; transform:translateY(0) rotate(-2deg) scale(1); }
.game-3d-matthias-portrait-wrap.has-coffee .game-3d-matthias-coffee i { animation:matthias-coffee-steam 1.6s ease-in-out infinite; }
.game-3d-matthias-portrait-wrap.has-coffee .game-3d-matthias-coffee b { animation:matthias-coffee-steam 1.9s .35s ease-in-out infinite; }
@keyframes matthias-warroom-mouth { 0%,100%{transform:translateX(-50%) scaleX(.88) scaleY(.5)} 50%{transform:translateX(-50%) scaleX(1.05) scaleY(2.3)} }
@keyframes matthias-warroom-address { from{transform:scale(1) translateY(0)} to{transform:scale(1.008) translateY(-1px)} }
@keyframes matthias-rage-simmer { 0%,92%,100%{transform:translateX(0)} 94%{transform:translateX(-1px) rotate(-.15deg)} 96%{transform:translateX(1px) rotate(.15deg)} 98%{transform:translateX(-.5px)} }
@keyframes matthias-coffee-steam { 0%,100%{transform:translateY(3px) translateX(0) scaleY(.85);opacity:.25} 50%{transform:translateY(-3px) translateX(2px) scaleY(1.12);opacity:.72} }
@media (max-width:820px) { .game-3d-matthias-rage-brows{top:42.9%;width:42%} .game-3d-matthias-mouth{top:56%;width:11%} .game-3d-matthias-rage-teeth{top:55.8%;width:13%} .game-3d-matthias-coffee{right:5%;bottom:7%;transform:translateY(8px) rotate(-5deg) scale(.72)} .game-3d-matthias-portrait-wrap.has-coffee .game-3d-matthias-coffee{transform:translateY(0) rotate(-2deg) scale(.78)} }
@media (prefers-reduced-motion:reduce) { .game-3d-matthias-portrait-wrap .game-3d-matthias-portrait,.game-3d-matthias-rage-brows,.game-3d-matthias-rage-teeth,.game-3d-matthias-mouth,.game-3d-matthias-coffee,.game-3d-matthias-coffee i,.game-3d-matthias-coffee b{animation:none!important;transition:none!important} }
""")

Path('frontend/src/components/MatthiasWarRoomPortrait.test.jsx').write_text("""import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import MatthiasWarRoomPortrait, { nextWarRoomGesture } from './MatthiasWarRoomPortrait.jsx';

describe('MatthiasWarRoomPortrait', () => {
  it('mantiene el retrato canónico y prepara boca, rabia y café como capas discretas', () => {
    const html = renderToStaticMarkup(<MatthiasWarRoomPortrait avatar="/matthias.webp" speechKey="m1" speechText="Una observación." rageLevel={2} capturedMaterial={9} />);
    expect(html).toContain('game-3d-matthias-portrait');
    expect(html).toContain('game-3d-matthias-mouth');
    expect(html).toContain('game-3d-matthias-rage-brows');
    expect(html).toContain('game-3d-matthias-rage-teeth');
    expect(html).toContain('game-3d-matthias-coffee');
    expect(html).toContain('data-matthias-warroom-gesture="idle"');
    expect(html).toContain('data-matthias-rage="2"');
    expect(html).toContain('data-matthias-captured-material="9"');
  });
  it('limita la rabia visual a cuatro estados', () => {
    const html = renderToStaticMarkup(<MatthiasWarRoomPortrait avatar="/matthias.webp" rageLevel={99} capturedMaterial={14} />);
    expect(html).toContain('data-matthias-rage="3"');
    expect(html).toContain('rage-3');
  });
  it('mezcla café, órdenes y mirada sin convertirlo en un muñeco en bucle', () => {
    expect(nextWarRoomGesture(() => 0.1)).toBe('coffee');
    expect(nextWarRoomGesture(() => 0.3)).toBe('order');
    expect(nextWarRoomGesture(() => 0.8)).toBe('glance');
  });
});
""")

replace_once('frontend/src/components/MatthiasKing3D.js', "  group.userData.faceStyle = 'permanent-scowl-v2';", "  group.userData.faceStyle = 'permanent-scowl-v3';")
replace_once(
    'frontend/src/components/MatthiasKing3D.js',
    "  add(group, new THREE.SphereGeometry(0.036, 14, 9), eyeWhite, [-0.078, 1.002, faceZ], [0, 0, 0], [1.22, 0.7, 0.42], 'matthias-eye-white-left');\n  add(group, new THREE.SphereGeometry(0.036, 14, 9), eyeWhite, [0.078, 1.002, faceZ], [0, 0, 0], [1.22, 0.7, 0.42], 'matthias-eye-white-right');\n  add(group, new THREE.SphereGeometry(0.021, 12, 8), ink, [-0.071, 0.999, front * 0.239], [0, 0, 0], [1, 0.94, 0.62], 'matthias-eye-left');\n  add(group, new THREE.SphereGeometry(0.021, 12, 8), ink, [0.071, 0.999, front * 0.239], [0, 0, 0], [1, 0.94, 0.62], 'matthias-eye-right');\n\n  add(group, new THREE.BoxGeometry(0.12, 0.027, 0.022), ink, [-0.072, 1.054, front * 0.224], [0, 0, -0.39 * front], null, 'matthias-brow-left');\n  add(group, new THREE.BoxGeometry(0.12, 0.027, 0.022), ink, [0.072, 1.049, front * 0.224], [0, 0, 0.33 * front], null, 'matthias-brow-right');",
    "  add(group, new THREE.SphereGeometry(0.036, 14, 9), eyeWhite, [-0.078, 1.002, faceZ], [0, 0, 0], [1.22, 0.52, 0.42], 'matthias-eye-white-left');\n  add(group, new THREE.SphereGeometry(0.036, 14, 9), eyeWhite, [0.078, 1.002, faceZ], [0, 0, 0], [1.22, 0.52, 0.42], 'matthias-eye-white-right');\n  add(group, new THREE.SphereGeometry(0.021, 12, 8), ink, [-0.071, 0.998, front * 0.239], [0, 0, 0], [1, 0.78, 0.62], 'matthias-eye-left');\n  add(group, new THREE.SphereGeometry(0.021, 12, 8), ink, [0.071, 0.998, front * 0.239], [0, 0, 0], [1, 0.78, 0.62], 'matthias-eye-right');\n\n  add(group, new THREE.BoxGeometry(0.12, 0.031, 0.022), ink, [-0.072, 1.043, front * 0.224], [0, 0, -0.52 * front], null, 'matthias-brow-left');\n  add(group, new THREE.BoxGeometry(0.12, 0.031, 0.022), ink, [0.072, 1.043, front * 0.224], [0, 0, 0.48 * front], null, 'matthias-brow-right');",
)
replace_once(
    'frontend/src/components/MatthiasKing3D.js',
    "  add(group, new THREE.BoxGeometry(0.082, 0.018, 0.02), ink, [-0.035, 0.9, front * 0.226], [0, 0, 0.22 * front], null, 'matthias-mouth-left');\n  add(group, new THREE.BoxGeometry(0.082, 0.018, 0.02), ink, [0.035, 0.898, front * 0.226], [0, 0, -0.12 * front], null, 'matthias-mouth-right');\n  add(group, new THREE.BoxGeometry(0.062, 0.011, 0.017), faceShadow, [0.045, 0.876, front * 0.218], [0, 0, -0.18 * front], null, 'matthias-lower-lip-crease');",
    "  add(group, new THREE.BoxGeometry(0.082, 0.019, 0.02), ink, [-0.035, 0.899, front * 0.226], [0, 0, 0.035 * front], null, 'matthias-mouth-left');\n  add(group, new THREE.BoxGeometry(0.082, 0.019, 0.02), ink, [0.035, 0.899, front * 0.226], [0, 0, -0.035 * front], null, 'matthias-mouth-right');\n  add(group, new THREE.BoxGeometry(0.062, 0.012, 0.017), faceShadow, [0.045, 0.879, front * 0.218], [0, 0, -0.06 * front], null, 'matthias-lower-lip-crease');",
)
replace_once('frontend/src/components/MatthiasKing3D.test.js', "    expect(group.userData.faceStyle).toBe('permanent-scowl-v2');", "    expect(group.userData.faceStyle).toBe('permanent-scowl-v3');")
replace_once(
    'frontend/src/components/MatthiasKing3D.test.js',
    "    expect(group.getObjectByName('matthias-brow-left')).toBeTruthy();\n    expect(group.getObjectByName('matthias-brow-crease-left')).toBeTruthy();",
    "    expect(group.getObjectByName('matthias-brow-left')).toBeTruthy();\n    expect(group.getObjectByName('matthias-brow-left').rotation.z).toBeLessThan(-0.45);\n    expect(group.getObjectByName('matthias-brow-right').rotation.z).toBeGreaterThan(0.4);\n    expect(group.getObjectByName('matthias-eye-white-left').scale.y).toBeLessThan(0.6);\n    expect(Math.abs(group.getObjectByName('matthias-mouth-left').rotation.z)).toBeLessThan(0.08);\n    expect(group.getObjectByName('matthias-brow-crease-left')).toBeTruthy();",
)

replace_once(
    'frontend/src/cpuCommentary.js',
    "  if (played.captured === 'r' && played.piece === 'p') {\n    return { type: 'PAWN_TAKES_ROOK', priority: 62, san: played.san };\n  }\n\n  return null;",
    "  if (played.captured === 'r' && played.piece === 'p') {\n    return { type: 'PAWN_TAKES_ROOK', priority: 62, san: played.san };\n  }\n\n  if (played.captured) {\n    return { type: 'CAPTURE', priority: 60, san: played.san, captured: played.captured, piece: played.piece };\n  }\n\n  return null;",
)
replace_once('frontend/src/cpuCommentary.js', "    PAWN_TAKES_QUEEN: [\n      'Un peón se ha comido mi dama.", "    PAWN_TAKES_QUEEN: [\n      'NEIN! Meine Dame! Grrr.',\n      'Un peón se ha comido mi dama.")
replace_once('frontend/src/cpuCommentary.js', "    QUEEN_CAPTURE: [\n      'Te llevas mi dama.", "    QUEEN_CAPTURE: [\n      'Nein. Mi dama. Grrr.',\n      'Te llevas mi dama.")
replace_once(
    'frontend/src/cpuCommentary.js',
    "    PAWN_TAKES_ROOK: [\n      'Peón por torre. Uno contra cinco. Eso no es rentabilidad: es saqueo con contabilidad creativa.',\n      'Tu peón acaba de desmontar una torre. La austeridad, bien aplicada, es terrorífica.',\n      'Una torre menos por el módico precio de un peón. Oferta válida hasta fin de existencias.',\n    ],\n  },",
    "    PAWN_TAKES_ROOK: [\n      'Peón por torre. Uno contra cinco. Eso no es rentabilidad: es saqueo con contabilidad creativa.',\n      'Tu peón acaba de desmontar una torre. La austeridad, bien aplicada, es terrorífica.',\n      'Una torre menos por el módico precio de un peón. Oferta válida hasta fin de existencias.',\n    ],\n    CAPTURE: ['Grrr.', 'Nein.', 'Ach. Grrr.', 'Hmpf.'],\n  },",
)
replace_once(
    'frontend/src/cpuCommentary.js',
    "export function noteworthyComment(beforeFen, move, actor = 'human') {\n  const event = detectNoteworthyMove(beforeFen, move);\n  if (!event) return null;\n  return { event, text: commentForEvent(event, actor) };\n}",
    "export function noteworthyComment(beforeFen, move, actor = 'human') {\n  const event = detectNoteworthyMove(beforeFen, move);\n  if (!event || (event.type === 'CAPTURE' && actor !== 'human')) return null;\n  const text = commentForEvent(event, actor);\n  return text ? { event, text } : null;\n}",
)
replace_once('frontend/src/cpuCommentary.test.js', "import { commentForEvent, detectNoteworthyMove } from './cpuCommentary.js';", "import { commentForEvent, detectNoteworthyMove, noteworthyComment } from './cpuCommentary.js';")
replace_once(
    'frontend/src/cpuCommentary.test.js',
    "  it('usa siempre el repertorio sarcástico fijo', () => {",
    "  it('detecta una captura corriente y Matthias sólo la usa cuando el humano le come material', () => {\n    const fen = '4k3/8/8/8/3p4/4P3/8/4K3 w - - 0 1';\n    const move = { from: 'e3', to: 'd4' };\n    const event = detectNoteworthyMove(fen, move);\n    expect(event?.type).toBe('CAPTURE');\n    expect(['Grrr.', 'Nein.', 'Ach. Grrr.', 'Hmpf.']).toContain(commentForEvent(event, 'human'));\n    expect(noteworthyComment(fen, move, 'cpu')).toBeNull();\n  });\n\n  it('usa siempre el repertorio sarcástico fijo', () => {",
)

replace_once('frontend/src/spectatorReactions.js', "const GENERIC = ['El público murmura.', 'Varias miradas se clavan en el tablero.', 'Eso sí ha despertado a la grada.'];", "const GENERIC = ['El público murmura.', 'Varias miradas se clavan en el tablero.', 'Eso sí ha despertado a la grada.'];\nconst SPECIAL_HUMAN_CAPTURES = new Set(['PAWN_TAKES_QUEEN', 'QUEEN_CAPTURE', 'PAWN_TAKES_ROOK']);")
replace_once(
    'frontend/src/spectatorReactions.js',
    "  const priority = Number(event.priority || 0);\n  const roll = hash(`${event.type}|${actor}|${ply}`) % 100;\n\n  let mode;",
    "  const priority = Number(event.priority || 0);\n  const roll = hash(`${event.type}|${actor}|${ply}`) % 100;\n\n  if (event.type === 'CAPTURE') {\n    if (actor !== 'human' || roll >= 24) return { mode: 'silence', cpu: false, audience: false, matthiasSilence: false, text: null };\n    return { mode: 'cpu', cpu: true, audience: false, matthiasSilence: false, text: null };\n  }\n\n  if (actor === 'human' && SPECIAL_HUMAN_CAPTURES.has(event.type)) {\n    const mode = roll < 70 ? 'cpu' : roll < 88 ? 'both' : 'audience';\n    return { mode, cpu: mode === 'cpu' || mode === 'both', audience: mode === 'audience' || mode === 'both', matthiasSilence: false, text: mode === 'audience' || mode === 'both' ? choose(REACTIONS[event.type], `${event.type}|${actor}|${ply}|line`) : null };\n  }\n\n  let mode;",
)
replace_once(
    'frontend/src/spectatorReactions.test.js',
    "  it('mantiene silencios reales para evitar verbena', () => {",
    "  it('hace que Matthias gruña sólo a veces por capturas corrientes', () => {\n    let cpu = 0;\n    let silence = 0;\n    for (let ply = 0; ply < 200; ply += 1) {\n      const row = noteworthyPresentation({ type:'CAPTURE', priority:60 }, 'human', ply);\n      if (row.cpu) cpu += 1;\n      if (row.mode === 'silence') silence += 1;\n      expect(row.audience).toBe(false);\n    }\n    expect(cpu).toBeGreaterThan(25);\n    expect(cpu).toBeLessThan(75);\n    expect(silence).toBeGreaterThan(120);\n  });\n\n  it('prioriza la reacción de Matthias cuando la captura es especialmente humillante', () => {\n    let cpu = 0;\n    for (let ply = 0; ply < 200; ply += 1) if (noteworthyPresentation({ type:'PAWN_TAKES_QUEEN', priority:85 }, 'human', ply).cpu) cpu += 1;\n    expect(cpu).toBeGreaterThan(150);\n  });\n\n  it('mantiene silencios reales para evitar verbena', () => {",
)

replace_once(
    '.github/workflows/cicd.yml',
    "jobs:\n  preflight:",
    "jobs:\n  changes:\n    name: Detect · expensive security inputs\n    runs-on: ubuntu-latest\n    outputs:\n      security: ${{ steps.filter.outputs.security }}\n    steps:\n      - uses: actions/checkout@v7\n      - name: Detect Docker/dependency changes\n        uses: dorny/paths-filter@v3\n        id: filter\n        with:\n          filters: |\n            security:\n              - 'Dockerfile'\n              - '**/Dockerfile'\n              - 'docker-compose*.yml'\n              - 'docker-compose*.yaml'\n              - 'frontend/package.json'\n              - 'frontend/package-lock.json'\n              - 'backend-python/requirements*.txt'\n              - 'backend-python/pyproject.toml'\n              - 'backend-python/poetry.lock'\n              - 'render.yaml'\n              - 'Makefile'\n              - 'scripts/compose_smoke.py'\n              - 'scripts/npm_audit_gate.py'\n              - 'scripts/pip_audit_gate.py'\n              - '.github/workflows/cicd.yml'\n\n  preflight:",
)
replace_once(
    '.github/workflows/cicd.yml',
    "  security:\n    name: Security · Trivy + Docker\n    needs: preflight\n    runs-on: ubuntu-latest",
    "  security:\n    name: Security · Trivy + Docker\n    needs: [preflight, changes]\n    if: ${{ github.event_name == 'workflow_dispatch' || needs.changes.outputs.security == 'true' }}\n    runs-on: ubuntu-latest",
)
