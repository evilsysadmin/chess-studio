export const CHRONICLES_MATERIAL_ATLAS_VERSION = 1;

function freezeProfile(id, category, label, values = {}) {
  return Object.freeze({
    id,
    category,
    label,
    pattern: values.pattern || 'masonry',
    roles: Object.freeze([...(values.roles || ['wall', 'floor'])]),
    tint: Object.freeze([...(values.tint || [0, 0, 0])]),
    relief: Number(values.relief ?? 1),
    roughnessBias: Number(values.roughnessBias ?? 0),
    cracks: Number(values.cracks ?? 0.35),
    moss: Number(values.moss ?? 0),
    moisture: Number(values.moisture ?? 0),
    mineral: Number(values.mineral ?? 0),
    soot: Number(values.soot ?? 0),
    normalScale: Number(values.normalScale ?? 1),
  });
}

export const CHRONICLES_MATERIAL_ATLAS = Object.freeze({
  D01: freezeProfile('D01', 'dungeon', 'Piedra oscura', { pattern: 'masonry', tint: [-10, -8, -4], relief: 1.12, roughnessBias: 0.07, cracks: 0.58, moisture: 0.16 }),
  D02: freezeProfile('D02', 'dungeon', 'Piedra desgastada', { pattern: 'masonry', tint: [2, -1, -5], relief: 1.28, roughnessBias: 0.08, cracks: 0.72 }),
  D03: freezeProfile('D03', 'dungeon', 'Ladrillo de mazmorra', { pattern: 'brick', tint: [13, -3, -12], relief: 0.94, roughnessBias: 0.05, cracks: 0.34, soot: 0.18, roles: ['wall'] }),
  D04: freezeProfile('D04', 'dungeon', 'Piedra con musgo', { pattern: 'masonry', tint: [-4, 1, -7], relief: 1.1, moss: 0.72, moisture: 0.38, roles: ['wall'] }),
  D05: freezeProfile('D05', 'dungeon', 'Piedra rota', { pattern: 'rubble', tint: [-5, -5, -4], relief: 1.48, roughnessBias: 0.1, cracks: 0.92 }),
  D06: freezeProfile('D06', 'dungeon', 'Columnas de mazmorra', { pattern: 'ashlar', tint: [6, 2, -2], relief: 0.84, cracks: 0.28, roles: ['wall'] }),

  C01: freezeProfile('C01', 'castle', 'Piedra caliza', { pattern: 'ashlar', tint: [14, 11, 5], relief: 0.62, roughnessBias: -0.03, cracks: 0.18 }),
  C02: freezeProfile('C02', 'castle', 'Sillería envejecida', { pattern: 'ashlar', tint: [8, 4, -2], relief: 0.86, cracks: 0.4 }),
  C03: freezeProfile('C03', 'castle', 'Mármol', { pattern: 'marble', tint: [18, 16, 15], relief: 0.24, roughnessBias: -0.11, cracks: 0.12 }),
  C04: freezeProfile('C04', 'castle', 'Arenisca', { pattern: 'ashlar', tint: [14, 7, -4], relief: 0.75, roughnessBias: 0.03, cracks: 0.3 }),
  C05: freezeProfile('C05', 'castle', 'Ladrillo rojo', { pattern: 'brick', tint: [17, -2, -12], relief: 0.74, cracks: 0.25, roles: ['wall'] }),
  C06: freezeProfile('C06', 'castle', 'Columnas clásicas', { pattern: 'ashlar', tint: [15, 12, 7], relief: 0.42, roughnessBias: -0.02, cracks: 0.14, roles: ['wall'] }),

  E01: freezeProfile('E01', 'exterior', 'Piedra de muralla', { pattern: 'blocks', tint: [-1, -2, -2], relief: 1.18, roughnessBias: 0.08, cracks: 0.52, roles: ['wall'] }),
  E02: freezeProfile('E02', 'exterior', 'Piedra rústica', { pattern: 'rubble', tint: [2, -1, -5], relief: 1.42, roughnessBias: 0.1, cracks: 0.68 }),
  E03: freezeProfile('E03', 'exterior', 'Piedra con liquen', { pattern: 'blocks', tint: [-2, 1, -6], relief: 1.15, moss: 0.55, moisture: 0.12, roles: ['wall'] }),
  E04: freezeProfile('E04', 'exterior', 'Mezcla piedra/ladrillo', { pattern: 'ruined', tint: [8, 0, -8], relief: 1.3, cracks: 0.78, roles: ['wall'] }),
  E05: freezeProfile('E05', 'exterior', 'Roca natural', { pattern: 'rock', tint: [-7, -6, -3], relief: 1.52, roughnessBias: 0.09, cracks: 0.72 }),
  E06: freezeProfile('E06', 'exterior', 'Bloque tallado', { pattern: 'blocks', tint: [7, 4, 0], relief: 0.78, cracks: 0.24, roles: ['wall'] }),

  N01: freezeProfile('N01', 'cave', 'Roca de cueva', { pattern: 'cave', tint: [-10, -7, -2], relief: 1.6, roughnessBias: 0.08, cracks: 0.74, moisture: 0.22 }),
  N02: freezeProfile('N02', 'cave', 'Roca caliza', { pattern: 'cave', tint: [13, 11, 5], relief: 1.28, roughnessBias: 0.03, cracks: 0.5, moisture: 0.16 }),
  N03: freezeProfile('N03', 'cave', 'Roca volcánica', { pattern: 'cave', tint: [-20, -18, -13], relief: 1.78, roughnessBias: 0.1, cracks: 0.82, soot: 0.36 }),
  N04: freezeProfile('N04', 'cave', 'Estalactitas', { pattern: 'cave', tint: [1, 0, -2], relief: 1.8, moisture: 0.28, roles: ['prop'] }),
  N05: freezeProfile('N05', 'cave', 'Roca con minerales', { pattern: 'cave', tint: [-5, 0, 16], relief: 1.42, mineral: 0.92, moisture: 0.26 }),
  N06: freezeProfile('N06', 'cave', 'Pared húmeda', { pattern: 'cave', tint: [-10, -2, 13], relief: 1.34, roughnessBias: -0.12, moisture: 0.86, mineral: 0.24 }),

  V01: freezeProfile('V01', 'variant', 'Madera', { pattern: 'wood', tint: [10, -1, -12], relief: 0.46, roughnessBias: 0.02, roles: ['prop'] }),
  V02: freezeProfile('V02', 'variant', 'Metal', { pattern: 'metal', tint: [-2, -2, 1], relief: 0.26, roughnessBias: -0.2, roles: ['prop'] }),
  V03: freezeProfile('V03', 'variant', 'Yeso envejecido', { pattern: 'plaster', tint: [15, 13, 8], relief: 0.34, roughnessBias: 0.01, cracks: 0.66, roles: ['wall'] }),
  V04: freezeProfile('V04', 'variant', 'Tierra compacta', { pattern: 'earth', tint: [10, 2, -8], relief: 0.82, roughnessBias: 0.1, cracks: 0.28, roles: ['floor'] }),
  V05: freezeProfile('V05', 'variant', 'Ladrillo ruinoso', { pattern: 'ruined', tint: [10, -2, -11], relief: 1.32, roughnessBias: 0.08, cracks: 0.88, roles: ['wall'] }),
  V06: freezeProfile('V06', 'variant', 'Grotesco/orgánico', { pattern: 'organic', tint: [-11, -3, -8], relief: 1.16, moisture: 0.64, roles: ['prop'] }),
});

function freezeEnvironment(id, wall, floor) {
  return Object.freeze({
    id,
    wall: Object.freeze([...wall]),
    floor: Object.freeze([...floor]),
  });
}

export const CHRONICLES_MATERIAL_ENVIRONMENTS = Object.freeze({
  dungeon: freezeEnvironment('dungeon', ['D01', 'D02', 'D03', 'D04', 'D05', 'D06'], ['D01', 'D02', 'D05']),
  'castle-interior': freezeEnvironment('castle-interior', ['C01', 'C02', 'C04', 'C05', 'C06'], ['C01', 'C02', 'C03', 'C04']),
  exterior: freezeEnvironment('exterior', ['E01', 'E02', 'E03', 'E04', 'E06'], ['E02', 'E05', 'V04']),
  cave: freezeEnvironment('cave', ['N01', 'N02', 'N03', 'N05', 'N06'], ['N01', 'N02', 'N03', 'N05', 'V04']),
  'cave-water': freezeEnvironment('cave-water', ['N06'], ['N01', 'N06']),
  'ash-ruin': freezeEnvironment('ash-ruin', ['D01', 'D05', 'V05', 'N03', 'E04'], ['D02', 'N03', 'V04', 'E05']),
  'iron-foundry': freezeEnvironment('iron-foundry', ['D03', 'V05', 'E04', 'D01', 'E06'], ['D01', 'V04', 'E05']),
  'black-glass': freezeEnvironment('black-glass', ['N03', 'D01', 'C03', 'E06'], ['N03', 'C03', 'D01']),
});

const MAP_ENVIRONMENT = Object.freeze({
  'crypt-eight-squares': 'dungeon',
  'gallery-of-forks': 'castle-interior',
  'menagerie-of-ash': 'ash-ruin',
  'ash-vault': 'ash-ruin',
  'blind-king-archive': 'castle-interior',
  'iron-foundry': 'iron-foundry',
  'chain-basilica': 'castle-interior',
  'hollow-bell-tower': 'exterior',
  'black-glass-chapel': 'black-glass',
  'echo-cistern': 'cave-water',
});

export function chroniclesMaterialProfile(profileId) {
  return CHRONICLES_MATERIAL_ATLAS[profileId] || CHRONICLES_MATERIAL_ATLAS.D01;
}

export function chroniclesMaterialEnvironment(environmentId) {
  return CHRONICLES_MATERIAL_ENVIRONMENTS[environmentId] || CHRONICLES_MATERIAL_ENVIRONMENTS.dungeon;
}

export function chroniclesMaterialEnvironmentForMapId(mapId = '') {
  const id = String(mapId || '').trim().toLowerCase();
  if (MAP_ENVIRONMENT[id]) return MAP_ENVIRONMENT[id];
  if (/(cistern|sewer|water|flood|canal)/.test(id)) return 'cave-water';
  if (/(cave|cavern|grotto|mine|mountain|tunnel|underground)/.test(id)) return 'cave';
  if (/(foundry|forge|iron|smelter)/.test(id)) return 'iron-foundry';
  if (/(glass|obsidian)/.test(id)) return 'black-glass';
  if (/(ash|ruin|burnt|charred)/.test(id)) return 'ash-ruin';
  if (/(tower|rampart|courtyard|exterior|wall|battlement)/.test(id)) return 'exterior';
  if (/(archive|basilica|gallery|castle|palace|chapel|keep|hall|library)/.test(id)) return 'castle-interior';
  if (/(crypt|dungeon|vault|tomb|catacomb)/.test(id)) return 'dungeon';
  return 'dungeon';
}

function hashText(text) {
  let hash = 2166136261;
  const source = String(text || '');
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function cellSignature(entries = []) {
  return (entries || []).map((entry) => String(entry.x) + ',' + String(entry.y)).join(';');
}

export function chroniclesMaterialSceneSeed(scenePlan = null) {
  const signature = [
    scenePlan?.mapId || 'unknown',
    String(scenePlan?.width || 0) + 'x' + String(scenePlan?.height || 0),
    cellSignature(scenePlan?.walls),
    cellSignature(scenePlan?.floors),
  ].join('|');
  return hashText(signature);
}

function gcd(a, b) {
  let left = Math.abs(a);
  let right = Math.abs(b);
  while (right) {
    const next = left % right;
    left = right;
    right = next;
  }
  return left || 1;
}

function pickProfiles(values, count, seed, salt) {
  if (!values?.length) return Object.freeze([]);
  const amount = Math.min(values.length, Math.max(1, Number(count) || 1));
  const start = (seed + salt) % values.length;
  let step = ((seed >>> 5) + salt * 3) % values.length;
  if (step === 0) step = 1;
  while (gcd(step, values.length) !== 1) step = (step + 1) % values.length || 1;
  const picked = [];
  for (let index = 0; picked.length < amount; index += 1) {
    const candidate = values[(start + index * step) % values.length];
    if (!picked.includes(candidate)) picked.push(candidate);
  }
  return Object.freeze(picked);
}

export function chroniclesMaterialPlanForScene(scenePlan = null) {
  const environmentId = chroniclesMaterialEnvironmentForMapId(scenePlan?.mapId);
  const environment = chroniclesMaterialEnvironment(environmentId);
  const seed = chroniclesMaterialSceneSeed(scenePlan);
  return Object.freeze({
    version: CHRONICLES_MATERIAL_ATLAS_VERSION,
    environmentId,
    seed,
    wallProfileIds: pickProfiles(environment.wall, 3, seed, 17),
    floorProfileIds: pickProfiles(environment.floor, 2, seed, 31),
  });
}
