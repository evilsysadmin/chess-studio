from __future__ import annotations

import re
from pathlib import Path
from textwrap import dedent

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding='utf-8')


def write(path: str, text: str) -> None:
    (ROOT / path).write_text(text, encoding='utf-8')


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected exactly one match, found {count}')
    return text.replace(old, new, 1)


def regex_once(text: str, pattern: str, replacement: str, label: str, flags: int = 0) -> str:
    updated, count = re.subn(pattern, replacement, text, count=1, flags=flags)
    if count != 1:
        raise RuntimeError(f'{label}: expected exactly one regex match, found {count}')
    return updated


# ---------------------------------------------------------------------------
# 1) Persistent optional War Room scenery (off by default) + future Combat map
# ---------------------------------------------------------------------------
scenery_module = dedent('''\
import * as THREE from 'three';

export const WAR_ROOM_SCENERY_MODES = Object.freeze(['off', 'forest', 'city', 'soldiers']);

export function normalizeWarRoomScenery(value) {
  return WAR_ROOM_SCENERY_MODES.includes(value) ? value : 'off';
}

export function terrainToWarRoomScenery(terrain) {
  const value = String(terrain || '').trim().toLowerCase();
  if (!value) return 'soldiers';
  if (/(forest|woods?|bosque|jungle|selva|taiga|grove)/.test(value)) return 'forest';
  if (/(city|urban|ciudad|castle|fort|ruin|ruina|village|pueblo)/.test(value)) return 'city';
  return 'soldiers';
}

function material(color, options = {}) {
  return new THREE.MeshPhysicalMaterial({
    color,
    metalness: options.metalness ?? 0.03,
    roughness: options.roughness ?? 0.82,
    clearcoat: options.clearcoat ?? 0.04,
    clearcoatRoughness: options.clearcoatRoughness ?? 0.5,
    emissive: options.emissive ?? 0x000000,
    emissiveIntensity: options.emissiveIntensity ?? 0,
    transparent: options.opacity != null && options.opacity < 1,
    opacity: options.opacity ?? 1,
    depthWrite: options.depthWrite ?? true,
  });
}

function add(group, geometry, mat, position, rotation = [0, 0, 0], scale = null, name = '') {
  const mesh = new THREE.Mesh(geometry, mat);
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  if (scale) mesh.scale.set(...scale);
  if (name) mesh.name = name;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  group.add(mesh);
  return mesh;
}

function buildForest(group, x, z, towardBoard, coarsePointer) {
  const trunk = material(0x24160e, { roughness: 0.95 });
  const foliage = material(0x162b22, { roughness: 0.92 });
  const distant = material(0x223b31, { roughness: 0.95, opacity: 0.88, depthWrite: false });
  const count = coarsePointer ? 7 : 12;
  for (let index = 0; index < count; index += 1) {
    const lane = (index % 6) - 2.5;
    const depth = Math.floor(index / 6);
    const px = x + lane * 0.55 + (depth ? 0.22 : 0);
    const py = 2.05 + (index % 3) * 0.08;
    const pz = z + towardBoard * (0.06 + depth * 0.08);
    const scale = 0.72 + (index % 4) * 0.12;
    add(group, new THREE.CylinderGeometry(0.045, 0.07, 0.7 * scale, 8), trunk, [px, py, pz]);
    add(group, new THREE.ConeGeometry(0.28 * scale, 0.9 * scale, coarsePointer ? 8 : 12), depth ? distant : foliage, [px, py + 0.62 * scale, pz]);
    add(group, new THREE.ConeGeometry(0.22 * scale, 0.72 * scale, coarsePointer ? 8 : 12), depth ? distant : foliage, [px, py + 0.92 * scale, pz]);
  }
}

function buildCity(group, x, z, towardBoard, coarsePointer) {
  const stone = material(0x283039, { roughness: 0.88 });
  const darkStone = material(0x151b21, { roughness: 0.94 });
  const window = material(0xd69a4e, { roughness: 0.65, emissive: 0x6a3512, emissiveIntensity: 0.38 });
  const widths = coarsePointer ? [0.42, 0.58, 0.48, 0.7, 0.46] : [0.42, 0.58, 0.48, 0.7, 0.46, 0.56, 0.4];
  widths.forEach((width, index) => {
    const px = x + (index - (widths.length - 1) / 2) * 0.58;
    const height = 0.75 + ((index * 7) % 4) * 0.28;
    add(group, new THREE.BoxGeometry(width, height, 0.18), index % 2 ? darkStone : stone, [px, 2.05 + height / 2, z + towardBoard * 0.08]);
    if (!coarsePointer && index % 2 === 0) {
      add(group, new THREE.BoxGeometry(0.08, 0.12, 0.02), window, [px, 2.14 + height * 0.42, z + towardBoard * 0.19]);
    }
  });
  add(group, new THREE.ConeGeometry(0.34, 0.58, 4), darkStone, [x + 0.62, 3.56, z + towardBoard * 0.08], [0, Math.PI / 4, 0]);
}

function buildSoldiers(group, x, z, towardBoard, coarsePointer) {
  const uniform = material(0x20262b, { roughness: 0.84 });
  const brass = material(0x8f6b2e, { metalness: 0.58, roughness: 0.42 });
  const count = coarsePointer ? 6 : 10;
  for (let index = 0; index < count; index += 1) {
    const row = Math.floor(index / 5);
    const col = index % 5;
    const soldier = new THREE.Group();
    soldier.name = 'war-room-background-soldier';
    const px = x + (col - 2) * 0.52 + row * 0.18;
    const pz = z + towardBoard * (0.08 + row * 0.09);
    add(soldier, new THREE.CylinderGeometry(0.11, 0.15, 0.38, coarsePointer ? 8 : 12), uniform, [0, 0.24, 0]);
    add(soldier, new THREE.SphereGeometry(0.105, coarsePointer ? 10 : 14, 8), uniform, [0, 0.52, 0]);
    add(soldier, new THREE.CylinderGeometry(0.12, 0.14, 0.055, coarsePointer ? 10 : 16), brass, [0, 0.61, 0]);
    soldier.position.set(px, 2.02, pz);
    soldier.scale.setScalar(0.74 + row * 0.06);
    group.add(soldier);
  }
}

export function buildWarRoomScenery(mode, { whiteSide = true, coarsePointer = false } = {}) {
  const normalized = normalizeWarRoomScenery(mode);
  const group = new THREE.Group();
  group.name = `war-room-scenery-${normalized}`;
  group.userData.warRoomScenery = normalized;
  if (normalized === 'off') return group;

  const far = whiteSide ? -1 : 1;
  const towardBoard = -far;
  const wallZ = far * 7.6;
  const vistaX = whiteSide ? 4.25 : -4.25;
  const vistaZ = wallZ + towardBoard * 0.52;

  const dusk = add(
    group,
    new THREE.PlaneGeometry(4.08, 2.86),
    material(0x182738, { roughness: 0.95, emissive: 0x0d1b2b, emissiveIntensity: 0.32 }),
    [vistaX, 3.28, vistaZ],
    [0, whiteSide ? 0 : Math.PI, 0],
    null,
    'war-room-scenery-vista',
  );
  dusk.userData.decorative = true;

  if (normalized === 'forest') buildForest(group, vistaX, vistaZ + towardBoard * 0.04, towardBoard, coarsePointer);
  else if (normalized === 'city') buildCity(group, vistaX, vistaZ + towardBoard * 0.04, towardBoard, coarsePointer);
  else buildSoldiers(group, vistaX, vistaZ + towardBoard * 0.04, towardBoard, coarsePointer);

  return group;
}
''')
write('frontend/src/components/WarRoom3DScenery.js', scenery_module)

scenery_test = dedent('''\
import { describe, expect, it } from 'vitest';
import { buildWarRoomScenery, normalizeWarRoomScenery, terrainToWarRoomScenery } from './WarRoom3DScenery.js';

function dispose(group) {
  const geometries = new Set();
  const materials = new Set();
  group.traverse((node) => {
    if (node.geometry && !geometries.has(node.geometry)) { geometries.add(node.geometry); node.geometry.dispose(); }
    const list = Array.isArray(node.material) ? node.material : [node.material];
    list.forEach((material) => {
      if (material && !materials.has(material)) { materials.add(material); material.dispose(); }
    });
  });
}

describe('War Room 3D scenery', () => {
  it('permanece apagado por defecto y normaliza basura a off', () => {
    expect(normalizeWarRoomScenery(undefined)).toBe('off');
    expect(normalizeWarRoomScenery('holograma')).toBe('off');
    const group = buildWarRoomScenery('off');
    expect(group.userData.warRoomScenery).toBe('off');
    expect(group.children).toHaveLength(0);
  });

  it('construye los tres fondos opcionales sin tocar las reglas del tablero', () => {
    for (const mode of ['forest', 'city', 'soldiers']) {
      const group = buildWarRoomScenery(mode, { whiteSide: true, coarsePointer: true });
      expect(group.userData.warRoomScenery).toBe(mode);
      expect(group.children.length).toBeGreaterThan(1);
      dispose(group);
    }
  });

  it('deja preparado el mapeo de terreno para Combat Chess', () => {
    expect(terrainToWarRoomScenery('bosque negro')).toBe('forest');
    expect(terrainToWarRoomScenery('ruinas urbanas')).toBe('city');
    expect(terrainToWarRoomScenery('trincheras')).toBe('soldiers');
  });
});
''')
write('frontend/src/components/WarRoom3DScenery.test.js', scenery_test)

# ---------------------------------------------------------------------------
# 2) User preference: scenery is explicitly OFF by default
# ---------------------------------------------------------------------------
path = 'frontend/src/userPreferences.js'
text = read(path)
text = replace_once(
    text,
    "export const BOARD_RENDERER_KEY = 'chess-study-board-renderer';\n",
    "export const BOARD_RENDERER_KEY = 'chess-study-board-renderer';\nexport const WAR_ROOM_SCENERY_KEY = 'chess-study-war-room-scenery';\n",
    'userPreferences scenery key',
)
text = replace_once(
    text,
    "export const BOARD_RENDERERS = [\n  { id: '2d', label: '2D' },\n  { id: '3d', label: '3D' },\n];\n",
    "export const BOARD_RENDERERS = [\n  { id: '2d', label: '2D' },\n  { id: '3d', label: '3D' },\n];\nexport const WAR_ROOM_SCENERIES = [\n  { id: 'off', label: 'Sin fondo' },\n  { id: 'forest', label: 'Bosque' },\n  { id: 'city', label: 'Ciudad' },\n  { id: 'soldiers', label: 'Tropas' },\n];\n",
    'userPreferences scenery catalog',
)
text += dedent('''\

export function getWarRoomScenery() {
  const stored = getStorageItem(STORAGE_LOCAL, WAR_ROOM_SCENERY_KEY);
  return WAR_ROOM_SCENERIES.some((row) => row.id === stored) ? stored : 'off';
}

export function setWarRoomScenery(value) {
  const normalized = WAR_ROOM_SCENERIES.some((row) => row.id === value) ? value : 'off';
  setProfileStorageItem(WAR_ROOM_SCENERY_KEY, normalized);
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(USER_PREFERENCES_CHANGED_EVENT));
  return normalized;
}
''')
write(path, text)

path = 'frontend/src/userPreferences.test.js'
text = read(path)
text = replace_once(text, "  getUiLanguage,\n", "  getUiLanguage,\n  getWarRoomScenery,\n", 'preferences test import getter')
text = replace_once(text, "  setUiLanguage,\n", "  setUiLanguage,\n  setWarRoomScenery,\n", 'preferences test import setter')
text = replace_once(
    text,
    "  it('propone 3D en staging sólo mientras el usuario no haya elegido renderer', () => {",
    "  it('mantiene el decorado 3D apagado por defecto y sólo acepta fondos conocidos', () => {\n    expect(getWarRoomScenery()).toBe('off');\n    expect(setWarRoomScenery('forest')).toBe('forest');\n    expect(getWarRoomScenery()).toBe('forest');\n    expect(setWarRoomScenery('castillo-de-gominola')).toBe('off');\n    expect(getWarRoomScenery()).toBe('off');\n  });\n\n  it('propone 3D en staging sólo mientras el usuario no haya elegido renderer', () => {",
    'preferences scenery test',
)
write(path, text)

# ---------------------------------------------------------------------------
# 3) Matthias king: canonical pawn-general face + proper peaked officer cap
# ---------------------------------------------------------------------------
path = 'frontend/src/components/MatthiasKing3D.js'
text = read(path)
text = replace_once(
    text,
    "  const face = mat(0xc39361, { metalness: 0, roughness: 0.8, clearcoat: 0.02, clearcoatRoughness: 0.8, envMapIntensity: 0.16, specularIntensity: 0.14 });",
    "  const face = mat(0xd7b47d, { metalness: 0, roughness: 0.82, clearcoat: 0.018, clearcoatRoughness: 0.82, envMapIntensity: 0.15, specularIntensity: 0.12 });",
    'Matthias canonical face tone',
)
cap_pattern = r"  // Gorra de plato sobredimensionada a propósito: es la firma visual de Matthias\.\n.*?\n\n  group\.scale\.setScalar\(1\.11\);"
cap_replacement = dedent('''\
  // Gorra de plato de oficial, no gorra plana: banda roja visible, copa que se
  // abre hacia arriba, plato ancho y visera proyectada. Es la firma visual del
  // avatar canónico de Matthias y debe leerse incluso en Android.
  add(group, new THREE.CylinderGeometry(0.245, 0.255, 0.085, segments), cap, [0, 0.986, 0], [0, 0, 0], [1.04, 1, 0.94], 'matthias-cap');
  add(group, new THREE.CylinderGeometry(0.255, 0.255, 0.062, segments), piping, [0, 1.016, 0], [0, 0, 0], [1.04, 1, 0.94], 'matthias-cap-red-band');
  add(group, new THREE.TorusGeometry(0.255, 0.016, 8, segments), brass, [0, 1.043, 0], [Math.PI / 2, 0, 0], [1.04, 0.94, 1], 'matthias-cap-band');

  const capCrownProfile = [
    [0.225, 1.045], [0.235, 1.075], [0.275, 1.12], [0.295, 1.155],
  ];
  lathe(group, capCrownProfile, cap, segments, 'matthias-cap-crown');
  add(group, new THREE.CylinderGeometry(0.305, 0.295, 0.045, segments), cap, [0, 1.177, 0], [0, 0, 0], [1.08, 1, 0.94], 'matthias-cap-top');
  add(group, new THREE.TorusGeometry(0.302, 0.014, 8, segments), brass, [0, 1.193, 0], [Math.PI / 2, 0, 0], [1.08, 0.94, 1], 'matthias-cap-top-piping');

  const visor = add(group, new THREE.BoxGeometry(0.43, 0.035, 0.22), cap, [0, 0.989, front * 0.238], [-0.13 * front, 0, 0], [1.08, 1, 1], 'matthias-visor');
  visor.geometry.translate(0, 0, front * 0.035);
  add(group, new THREE.SphereGeometry(0.057, 14, 9), brass, [0, 1.087, front * 0.252], [0, 0, 0], [1, 1.05, 0.52], 'matthias-cap-badge');
  add(group, new THREE.BoxGeometry(0.022, 0.088, 0.016), black, [0, 1.087, front * 0.286], [0, 0, 0], null, 'matthias-cap-badge-vertical');
  add(group, new THREE.BoxGeometry(0.08, 0.022, 0.016), black, [0, 1.087, front * 0.286], [0, 0, 0], null, 'matthias-cap-badge-horizontal');

  group.scale.setScalar(1.11);''')
text = regex_once(text, cap_pattern, cap_replacement, 'Matthias peaked cap', re.S)
write(path, text)

path = 'frontend/src/components/MatthiasKing3D.test.js'
text = read(path)
text = replace_once(
    text,
    "    expect(group.getObjectByName('matthias-cap-band')).toBeTruthy();\n    expect(group.getObjectByName('matthias-visor')).toBeTruthy();",
    "    expect(group.getObjectByName('matthias-cap-band')).toBeTruthy();\n    expect(group.getObjectByName('matthias-cap-red-band')).toBeTruthy();\n    expect(group.getObjectByName('matthias-cap-crown')).toBeTruthy();\n    expect(group.getObjectByName('matthias-cap-top')).toBeTruthy();\n    expect(group.getObjectByName('matthias-visor')).toBeTruthy();",
    'Matthias cap test detail',
)
text = replace_once(
    text,
    "    expect(group.getObjectByName('matthias-cap-badge')).toBeTruthy();\n\n    disposeGroup(group);",
    "    expect(group.getObjectByName('matthias-cap-badge')).toBeTruthy();\n    expect(group.getObjectByName('matthias-cap-crown')).toBeTruthy();\n    expect(group.getObjectByName('matthias-cap-red-band')).toBeTruthy();\n    expect(group.getObjectByName('matthias-mustache')).toBeFalsy();\n\n    disposeGroup(group);",
    'Matthias mobile cap test',
)
write(path, text)

# ---------------------------------------------------------------------------
# 4) Matthias complains on check and always concedes mate explicitly
# ---------------------------------------------------------------------------
path = 'frontend/src/cpuCommentary.js'
text = read(path)
text = regex_once(
    text,
    r"    MATE_FOUND: \[\n.*?\n    \],\n    MISSED_MATE:",
    dedent('''\
    MATE_FOUND: [
      'Ja. Ganaste. Jaque mate. Limpio, desagradable y perfectamente válido. Disfrútalo mientras dure.',
      'Ja. Ganaste. Mate. No pienso aplaudir, pero tampoco voy a insultar las matemáticas.',
      'Ja. Ganaste. Se acabó. Anótalo bien: no pienso regalarte una admisión tan elegante dos veces.',
      'Ja. Ganaste. Mein König está muerto y mi orgullo solicita cinco minutos de silencio.',
      'Ja. Ganaste. Jaque mate. Esta vez cierro la boca porque cualquier sarcasmo sería puro despecho.',
    ],
    MISSED_MATE:'''),
    'human mate concession lines',
    re.S,
)
text = replace_once(
    text,
    "    PAWN_TAKES_ROOK: [\n      'Peón por torre. Uno contra cinco. Eso no es rentabilidad: es saqueo con contabilidad creativa.',\n      'Tu peón acaba de desmontar una torre. La austeridad, bien aplicada, es terrorífica.',\n      'Una torre menos por el módico precio de un peón. Oferta válida hasta fin de existencias.',\n    ],\n  },\n  cpu: {",
    "    PAWN_TAKES_ROOK: [\n      'Peón por torre. Uno contra cinco. Eso no es rentabilidad: es saqueo con contabilidad creativa.',\n      'Tu peón acaba de desmontar una torre. La austeridad, bien aplicada, es terrorífica.',\n      'Una torre menos por el módico precio de un peón. Oferta válida hasta fin de existencias.',\n    ],\n    CHECK: [\n      'Ach. Jaque. Sehr unschön. Ya lo he visto; no hace falta que pongas cara de héroe.',\n      'Achtung. Mi rey está en jaque. Disfruta del momento, pero no lo conviertas en una religión.',\n      'Verdammt. Jaque. Esto queda anotado en tu expediente y, desgraciadamente, también en el mío.',\n      'Ja, ja. Jaque. Muy bonito. Ahora aparta esa sonrisa antes de que encuentre una réplica.',\n    ],\n  },\n  cpu: {",
    'human check lines',
)
# Add CPU CHECK lines just before the closing of the cpu repertoire using the last PAWN_TAKES_ROOK block.
cpu_anchor = "    PAWN_TAKES_ROOK: [\n      'Mi peón se ha llevado tu torre. Uno contra cinco. La infantería acaba de presentar resultados trimestrales excelentes.',\n      'Peón por torre. Tu fortificación acaba de ser embargada por un trabajador temporal.',\n      'Una torre menos por un peón. El departamento de compras está eufórico.',\n    ],\n  },\n};"
if cpu_anchor in text:
    text = text.replace(cpu_anchor, cpu_anchor.replace("    ],\n  },\n};", "    ],\n    CHECK: [\n      'Schach. Sí: jaque. No es una amenaza, es un parte meteorológico.',\n      'Achtung. Jaque. Mueva al rey con dignidad; el pánico queda fatal bajo iluminación cálida.',\n      'Jaque. Bitte, no lo dramatice: todavía quedan muchas formas de empeorar la posición.',\n    ],\n  },\n};"), 1)
else:
    # Repertories evolve often; insert CHECK immediately before the cpu table closes,
    # identified by the final `  },\n};` before commentForEvent.
    marker = "  },\n};\n\nexport function commentForEvent"
    if marker not in text:
        raise RuntimeError('cpu CHECK lines: repertoire closing marker not found')
    text = text.replace(marker, "    CHECK: [\n      'Schach. Sí: jaque. No es una amenaza, es un parte meteorológico.',\n      'Achtung. Jaque. Mueva al rey con dignidad; el pánico queda fatal bajo iluminación cálida.',\n      'Jaque. Bitte, no lo dramatice: todavía quedan muchas formas de empeorar la posición.',\n    ],\n  },\n};\n\nexport function commentForEvent", 1)
text = replace_once(
    text,
    "  if (played.captured === 'r' && played.piece === 'p') {\n    return { type: 'PAWN_TAKES_ROOK', priority: 62, san: played.san };\n  }\n\n  return null;",
    "  if (played.captured === 'r' && played.piece === 'p') {\n    return { type: 'PAWN_TAKES_ROOK', priority: 62, san: played.san };\n  }\n\n  // Un jaque corriente también merece una reacción breve de Matthias. Las\n  // tácticas más interesantes de arriba conservan prioridad y no se duplican.\n  if (after.isCheck()) return { type: 'CHECK', priority: 58, san: played.san };\n\n  return null;",
    'generic check event',
)
write(path, text)

path = 'frontend/src/cpuCommentary.test.js'
text = read(path)
text = replace_once(
    text,
    "  it('detecta un peón que captura una dama', () => {",
    "  it('reacciona también a un jaque normal contra Matthias', () => {\n    const event = detectNoteworthyMove(\n      '4k3/8/8/8/8/8/4R3/4K3 w - - 0 1',\n      { from: 'e2', to: 'e7' },\n    );\n    expect(event?.type).toBe('CHECK');\n    expect(commentForEvent(event, 'human')).toMatch(/Jaque|jaque/i);\n  });\n\n  it('la concesión de mate de Matthias dice explícitamente que ganaste', () => {\n    expect(commentForEvent({ type: 'MATE_FOUND' }, 'human')).toMatch(/Ja\\. Ganaste\\./);\n  });\n\n  it('detecta un peón que captura una dama', () => {",
    'cpu commentary check tests',
)
write(path, text)

# ---------------------------------------------------------------------------
# 5) Premium room: one central pawn crest only + intentional side plaque
# ---------------------------------------------------------------------------
path = 'frontend/src/components/Board3D.jsx'
text = read(path)
# The old base room used to paint a second banner/pawn/trophies underneath the
# premium set. Keep only architecture/window there; the premium layer owns decor.
text = regex_once(
    text,
    r"\nfunction buildTrophy\(group, x, y, z, goldMaterial\) \{.*?\n\}\n\nfunction buildWarRoom",
    "\nfunction buildWarRoom",
    'remove obsolete base-room trophy helper',
    re.S,
)
text = regex_once(
    text,
    r"\n  const bannerX = whiteSide \? -0\.6 : 0\.6;.*?\n  const ambientPanel =",
    "\n  // El decorado ceremonial (cortinas, único blasón de peón, estantes y luces)\n  // pertenece a PremiumWarRoomScene. Aquí dejamos sólo la arquitectura base\n  // para evitar el antiguo doble emblema superpuesto.\n\n  const ambientPanel =",
    'remove duplicate base-room decor',
    re.S,
)
write(path, text)

path = 'frontend/src/components/PremiumWarRoomScene.js'
text = read(path)
text = regex_once(
    text,
    r"function addWarTablePapers\(group, coarsePointer = false\) \{.*?\n\}\n\nfunction addCommandChronometer",
    dedent('''\
function addWarTableCommandPlaque(group, coarsePointer = false) {
  const walnut = material(COLORS.walnutDark, { metalness: 0.02, roughness: 0.62, clearcoat: 0.2 });
  const plate = material(0x15191d, { metalness: 0.18, roughness: 0.48, clearcoat: 0.22 });
  const brass = material(COLORS.brass, { metalness: 0.86, roughness: 0.28, clearcoat: 0.32 });
  const accent = material(COLORS.emerald, { metalness: 0.08, roughness: 0.54, clearcoat: 0.18 });

  const plaque = new THREE.Group();
  plaque.name = 'war-table-command-plaque';
  plaque.userData.intentionalSideDecor = true;
  plaque.position.set(-4.64, 0.12, -3.92);
  plaque.rotation.y = 0.22;
  addMesh(plaque, new THREE.BoxGeometry(1.16, 0.055, 0.74), walnut, [0, 0, 0]);
  addMesh(plaque, new THREE.BoxGeometry(0.98, 0.025, 0.57), plate, [0, 0.045, 0]);
  addMesh(plaque, new THREE.TorusGeometry(0.19, 0.018, 8, coarsePointer ? 18 : 30), brass, [0, 0.068, 0], [Math.PI / 2, 0, 0]);
  addMesh(plaque, new THREE.CylinderGeometry(0.085, 0.115, 0.15, coarsePointer ? 12 : 20), brass, [0, 0.09, 0]);
  addMesh(plaque, new THREE.SphereGeometry(0.085, coarsePointer ? 12 : 20, 10), brass, [0, 0.125, -0.08]);
  if (!coarsePointer) {
    addMesh(plaque, new THREE.BoxGeometry(0.32, 0.012, 0.025), accent, [0, 0.072, 0.22]);
    addMesh(plaque, new THREE.BoxGeometry(0.22, 0.012, 0.025), accent, [0, 0.073, 0.29]);
  }
  group.add(plaque);

  const pencil = new THREE.Group();
  pencil.name = 'war-table-map-pencil';
  addMesh(pencil, new THREE.CylinderGeometry(0.022, 0.022, 1.12, 12), material(0x7a4b27, { roughness: 0.76, clearcoat: 0.05 }), [4.73, 0.16, -2.3], [Math.PI / 2, 0, 0.08]);
  addMesh(pencil, new THREE.ConeGeometry(0.028, 0.12, 12), material(0x25201c, { roughness: 0.9, clearcoat: 0 }), [4.73, 0.16, -2.88], [Math.PI / 2, 0, 0]);
  group.add(pencil);
}

function addCommandChronometer'''),
    'replace ambiguous field folio with command plaque',
    re.S,
)
text = replace_once(text, '  addWarTablePapers(group, coarsePointer);', '  addWarTableCommandPlaque(group, coarsePointer);', 'premium table plaque call')
write(path, text)

# ---------------------------------------------------------------------------
# 6) Board 3D interaction: first tap selects; legal rings unmistakably visible;
#    hover/click tooltips; optional scenery button.
# ---------------------------------------------------------------------------
path = 'frontend/src/components/Board3D.jsx'
text = read(path)
text = replace_once(
    text,
    "import { USER_PREFERENCES_CHANGED_EVENT, getEffectiveReducedMotion } from '../userPreferences.js';",
    "import {\n  USER_PREFERENCES_CHANGED_EVENT,\n  WAR_ROOM_SCENERIES,\n  getEffectiveReducedMotion,\n  getWarRoomScenery,\n  setWarRoomScenery,\n} from '../userPreferences.js';\nimport { buildWarRoomScenery, normalizeWarRoomScenery } from './WarRoom3DScenery.js';",
    'Board3D scenery imports',
)
text = replace_once(
    text,
    "const DISPLAY_RANKS = ['8', '7', '6', '5', '4', '3', '2', '1'];\n",
    "const DISPLAY_RANKS = ['8', '7', '6', '5', '4', '3', '2', '1'];\nconst PIECE_NAMES_3D = Object.freeze({ p: 'Peón', n: 'Caballo', b: 'Alfil', r: 'Torre', q: 'Dama', k: 'Rey' });\n\nfunction pieceTooltipLabel(piece) {\n  if (!piece) return '';\n  if (piece.matthiasKing) return 'Rey · Matthias';\n  return PIECE_NAMES_3D[piece.type] || 'Pieza';\n}\n\nfunction nextSceneryMode(current) {\n  const ids = WAR_ROOM_SCENERIES.map((row) => row.id);\n  const index = Math.max(0, ids.indexOf(current));\n  return ids[(index + 1) % ids.length] || 'off';\n}\n",
    'Board3D piece labels',
)
text = replace_once(
    text,
    "  onCustomize,\n  onRendererFailure,\n}) {",
    "  onCustomize,\n  onRendererFailure,\n  sceneryMode = null,\n  sceneryLocked = false,\n}) {",
    'Board3D scenery props',
)
text = replace_once(
    text,
    "  const [inspectMode, setInspectMode] = useState(false);\n\n  latestPropsRef.current = { onSquareClick, onRendererFailure };",
    "  const [inspectMode, setInspectMode] = useState(false);\n  const [preferredScenery, setPreferredScenery] = useState(() => getWarRoomScenery());\n  const [pieceTooltip, setPieceTooltip] = useState(null);\n  const tooltipTimeoutRef = useRef(0);\n  const effectiveScenery = normalizeWarRoomScenery(sceneryMode ?? preferredScenery);\n\n  latestPropsRef.current = { onSquareClick, onRendererFailure, selectedSquare };",
    'Board3D interaction state',
)
text = replace_once(
    text,
    "    const refreshPreferences = () => setBoardTheme(loadBoardTheme());\n    window.addEventListener('chess-piece-skin-change', refreshSkin);\n    window.addEventListener(USER_PREFERENCES_CHANGED_EVENT, refreshPreferences);\n    return () => {\n      window.removeEventListener('chess-piece-skin-change', refreshSkin);\n      window.removeEventListener(USER_PREFERENCES_CHANGED_EVENT, refreshPreferences);\n    };\n  }, []);",
    "    const refreshPreferences = () => {\n      setBoardTheme(loadBoardTheme());\n      if (sceneryMode == null) setPreferredScenery(getWarRoomScenery());\n    };\n    window.addEventListener('chess-piece-skin-change', refreshSkin);\n    window.addEventListener(USER_PREFERENCES_CHANGED_EVENT, refreshPreferences);\n    return () => {\n      window.removeEventListener('chess-piece-skin-change', refreshSkin);\n      window.removeEventListener(USER_PREFERENCES_CHANGED_EVENT, refreshPreferences);\n    };\n  }, [sceneryMode]);",
    'Board3D preference refresh',
)
text = replace_once(
    text,
    "    scene.add(warRoom);\n    scene.add(buildPremiumWarRoomLayer(theme, whiteSide, coarsePointer));",
    "    scene.add(warRoom);\n    scene.add(buildPremiumWarRoomLayer(theme, whiteSide, coarsePointer));\n    scene.add(buildWarRoomScenery(effectiveScenery, { whiteSide, coarsePointer }));",
    'Board3D scenery scene layer',
)
text = replace_once(
    text,
    "          new THREE.RingGeometry(0.29, 0.43, 32),\n          new THREE.MeshBasicMaterial({ color: 0xc9a227, transparent: true, opacity: 0.86, side: THREE.DoubleSide, depthWrite: false }),",
    "          new THREE.RingGeometry(0.22, 0.43, 36),\n          new THREE.MeshBasicMaterial({\n            color: 0xc9a227, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false,\n            polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, toneMapped: false,\n          }),",
    'Board3D stronger legal marker',
)
text = replace_once(text, "        marker.position.set(x, 0.102, z);", "        // La tapa de la casilla llega ~0.105. El antiguo 0.102 enterraba el\n        // anillo dentro de la madera: parecía que el primer toque movía la pieza\n        // porque las jugadas legales no se veían.\n        marker.position.set(x, 0.132, z);", 'Board3D marker height')
text = replace_once(text, "        marker.renderOrder = 4;", "        marker.renderOrder = 9;", 'Board3D marker render order')

pointer_pattern = r"    function squareFromPointer\(event\) \{.*?\n    function onContextLost\(event\) \{"
pointer_replacement = dedent('''\
    function boardHitFromPointer(event) {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, camera);
      const intersections = raycaster.intersectObjects([...pieceGroup.children, ...squareMeshes.values()], true);
      for (const hit of intersections) {
        let object = hit.object;
        let cursor = hit.object;
        let pieceHit = false;
        while (cursor) {
          if (cursor.parent === pieceGroup) { pieceHit = true; break; }
          cursor = cursor.parent;
        }
        while (object && !object.userData?.square) object = object.parent;
        if (object?.userData?.square) return { square: object.userData.square, pieceHit };
      }
      return null;
    }

    function tooltipForSquare(square, event, source) {
      const piece = pieceMeshes.get(square);
      if (!piece) return null;
      const rect = renderer.domElement.getBoundingClientRect();
      const x = THREE.MathUtils.clamp(Number(event.clientX) - rect.left, 72, Math.max(72, rect.width - 72));
      const y = THREE.MathUtils.clamp(Number(event.clientY) - rect.top, 54, Math.max(54, rect.height - 18));
      return {
        square,
        type: piece.userData.type,
        color: piece.userData.color,
        matthiasKing: Boolean(piece.userData.matthiasKing),
        label: pieceTooltipLabel(piece.userData),
        x,
        y,
        source,
      };
    }

    function showClickedPieceTooltip(square, event) {
      const tooltip = tooltipForSquare(square, event, 'click');
      if (!tooltip) return;
      window.clearTimeout(tooltipTimeoutRef.current);
      setPieceTooltip(tooltip);
      tooltipTimeoutRef.current = window.setTimeout(() => {
        setPieceTooltip((current) => current?.source === 'click' ? null : current);
      }, 1800);
    }

    function onPointerDown(event) {
      pointerStartRef.current = { x: event.clientX, y: event.clientY, id: event.pointerId, pointerType: event.pointerType };
      if (inspectModeRef.current) {
        const motion = cameraMotionRef.current;
        motion.dragging = true;
        motion.lastX = event.clientX;
        motion.lastY = event.clientY;
        renderer.domElement.setPointerCapture?.(event.pointerId);
      }
    }

    function onPointerMove(event) {
      const rect = renderer.domElement.getBoundingClientRect();
      const motion = cameraMotionRef.current;
      if (inspectModeRef.current && motion.dragging) {
        const dx = event.clientX - motion.lastX;
        const dy = event.clientY - motion.lastY;
        motion.lastX = event.clientX;
        motion.lastY = event.clientY;
        motion.yaw = THREE.MathUtils.clamp(motion.yaw - dx * 0.0023, -0.14, 0.14);
        motion.pitch = THREE.MathUtils.clamp(motion.pitch - dy * 0.0018, -0.08, 0.075);
        return;
      }

      if (!coarsePointer && event.pointerType !== 'touch' && !inspectModeRef.current) {
        const hit = boardHitFromPointer(event);
        const hovered = hit?.pieceHit ? tooltipForSquare(hit.square, event, 'hover') : null;
        setPieceTooltip((current) => {
          if (current?.source === 'click') return current;
          if (!hovered) return null;
          if (current?.source === 'hover' && current.square === hovered.square) return current;
          return hovered;
        });
      }

      motion.targetX = THREE.MathUtils.clamp(((event.clientX - rect.left) / Math.max(1, rect.width) - 0.5) * 2, -1, 1);
      motion.targetY = THREE.MathUtils.clamp(((event.clientY - rect.top) / Math.max(1, rect.height) - 0.5) * 2, -1, 1);
    }

    function onPointerLeave() {
      const motion = cameraMotionRef.current;
      motion.targetX = 0;
      motion.targetY = 0;
      motion.dragging = false;
      setPieceTooltip((current) => current?.source === 'hover' ? null : current);
    }

    function onPointerUp(event) {
      const start = pointerStartRef.current;
      pointerStartRef.current = null;
      if (inspectModeRef.current) {
        cameraMotionRef.current.dragging = false;
        renderer.domElement.releasePointerCapture?.(event.pointerId);
        return;
      }
      const touchLike = coarsePointer || start?.pointerType === 'touch';
      const tap = resolveBoardTap(
        start,
        { x: event.clientX, y: event.clientY, id: event.pointerId },
        { coarsePointer: touchLike },
      );
      if (!tap) return;
      const hit = boardHitFromPointer({ clientX: tap.x, clientY: tap.y });
      if (!hit) return;
      setFocusedSquare(hit.square);

      const piece = pieceMeshes.get(hit.square);
      if (piece) showClickedPieceTooltip(hit.square, { clientX: tap.x, clientY: tap.y });

      // En el primer toque no aceptamos una casilla vacía proyectada por la
      // perspectiva. En móvil ese error de raycast era suficiente para que un
      // peón pareciera avanzar directamente. Primer toque = seleccionar pieza;
      // segundo toque (ya con selectedSquare) = elegir destino legal.
      const selectedNow = latestPropsRef.current.selectedSquare;
      if (!selectedNow && !hit.pieceHit) return;
      latestPropsRef.current.onSquareClick?.(hit.square);
    }

    function onContextLost(event) {''')
text = regex_once(text, pointer_pattern, pointer_replacement, 'Board3D pointer interaction block', re.S)
text = replace_once(
    text,
    "      window.cancelAnimationFrame(ambientFrameRef.current);\n      ambientFrameRef.current = 0;",
    "      window.cancelAnimationFrame(ambientFrameRef.current);\n      ambientFrameRef.current = 0;\n      window.clearTimeout(tooltipTimeoutRef.current);",
    'Board3D tooltip cleanup',
)
text = replace_once(
    text,
    "  }, [boardTheme, orientation, showCoordinates]);",
    "  }, [boardTheme, orientation, showCoordinates, effectiveScenery]);",
    'Board3D scene dependency',
)
# Add cycle helper before keyboard handler.
text = replace_once(
    text,
    "function handleKeyDown(event) {",
    "function cycleScenery() {\n    if (sceneryLocked) return;\n    const next = nextSceneryMode(effectiveScenery);\n    const saved = setWarRoomScenery(next);\n    setPreferredScenery(saved);\n  }\n\nfunction handleKeyDown(event) {",
    'Board3D scenery cycle helper',
)
text = replace_once(
    text,
    "      <div className=\"board3d-renderer-badge\" aria-hidden=\"true\">{rendererLabel}</div>\n      <button type=\"button\" className=\"board3d-inspect secondary-btn\"",
    "      <div className=\"board3d-renderer-badge\" aria-hidden=\"true\">{rendererLabel}</div>\n      {pieceTooltip && (\n        <div\n          className={`board3d-piece-tooltip is-${pieceTooltip.source}`}\n          style={{ left: `${pieceTooltip.x}px`, top: `${pieceTooltip.y}px` }}\n          role=\"status\"\n          aria-live=\"polite\"\n        >\n          <strong>{pieceTooltip.label}</strong>\n          <span>{pieceTooltip.square.toUpperCase()}</span>\n        </div>\n      )}\n      <button type=\"button\" className=\"board3d-inspect secondary-btn\"",
    'Board3D tooltip JSX',
)
text = replace_once(
    text,
    "      {onCustomize && <button type=\"button\" className=\"board3d-customize secondary-btn\" onClick={onCustomize}>Apariencia</button>}\n",
    "      {!sceneryLocked && (\n        <button type=\"button\" className=\"board3d-scenery secondary-btn\" onClick={cycleScenery}>\n          Fondo · {WAR_ROOM_SCENERIES.find((row) => row.id === effectiveScenery)?.label || 'Sin fondo'}\n        </button>\n      )}\n      {onCustomize && <button type=\"button\" className=\"board3d-customize secondary-btn\" onClick={onCustomize}>Apariencia</button>}\n",
    'Board3D scenery JSX',
)
write(path, text)

# CSS overlays for tooltip and scenery selector.
path = 'frontend/src/components/Board3D.css'
text = read(path)
text += dedent('''\

/* Piece identity is visible both on desktop hover and on click/tap. */
.board3d-piece-tooltip {
  position: absolute;
  z-index: 8;
  transform: translate(-50%, calc(-100% - 10px));
  display: inline-flex;
  align-items: baseline;
  gap: .42rem;
  min-width: max-content;
  max-width: min(220px, calc(100% - 1rem));
  padding: .38rem .52rem;
  border: 1px solid rgba(206,164,76,.5);
  border-radius: 8px;
  background: rgba(7,10,15,.92);
  color: var(--parchment);
  font: 700 .68rem/1.2 var(--font-body);
  box-shadow: 0 10px 28px rgba(0,0,0,.34), inset 0 1px rgba(255,255,255,.04);
  backdrop-filter: blur(8px);
  pointer-events: none;
}

.board3d-piece-tooltip span {
  color: var(--brass-dim);
  font: 700 .56rem/1 var(--font-mono);
  letter-spacing: .08em;
}

.board3d-piece-tooltip.is-click {
  border-color: rgba(95,168,211,.72);
  box-shadow: 0 10px 28px rgba(0,0,0,.34), 0 0 18px rgba(95,168,211,.12);
}

.board3d-scenery {
  position: absolute;
  z-index: 5;
  left: 50%;
  bottom: .68rem;
  transform: translateX(-50%);
  min-height: 34px;
  padding: .4rem .62rem;
  font-size: .64rem;
  background: rgba(11,15,21,.86);
  backdrop-filter: blur(8px);
}

@media (max-width: 520px) {
  .board3d-scenery { bottom: .4rem; font-size: .58rem; padding-inline: .48rem; }
  .board3d-piece-tooltip { font-size: .62rem; }
}
''')
write(path, text)

# ---------------------------------------------------------------------------
# 7) Guard contracts for the revised premium side object
# ---------------------------------------------------------------------------
path = 'frontend/src/components/PremiumWarRoomScene.test.js'
text = read(path)
# Add a lightweight assertion to the first table-layer test if the test file
# contains the known build call; otherwise add a standalone test before close.
insert = dedent('''\

  it('convierte el antiguo folio lateral en una placa de mando inequívoca', () => {
    const layer = buildPremiumTableLayer(theme, false);
    expect(layer.getObjectByName('war-table-command-plaque')).toBeTruthy();
    expect(layer.getObjectByName('war-table-field-folio')).toBeFalsy();
    dispose(layer);
  });
''')
if text.rstrip().endswith('});'):
    text = text.rstrip()[:-3] + insert + '\n});\n'
else:
    raise RuntimeError('PremiumWarRoomScene.test.js: unexpected ending')
write(path, text)

# Self-remove the staging machinery. The generated commit contains only product code/tests.
(ROOT / 'scripts/apply_warroom3d_interaction_polish.py').unlink(missing_ok=True)
(ROOT / '.github/workflows/warroom3d-interaction-polish.yml').unlink(missing_ok=True)
print('War Room 3D interaction polish applied successfully.')
