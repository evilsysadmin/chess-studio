const MAX_PHYSICAL_RELICS = 3;

function material(THREE, options) {
  return new THREE.MeshStandardMaterial(options);
}

function box(THREE, parent, size, position, mat, rotation = null) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), mat);
  mesh.position.set(...position);
  if (rotation) mesh.rotation.set(...rotation);
  parent.add(mesh);
  return mesh;
}

function cylinder(THREE, parent, top, bottom, height, position, mat, segments = 14) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(top, bottom, height, segments), mat);
  mesh.position.set(...position);
  parent.add(mesh);
  return mesh;
}

function torus(THREE, parent, radius, tube, position, mat, rotation = null) {
  const mesh = new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 8, 24), mat);
  mesh.position.set(...position);
  if (rotation) mesh.rotation.set(...rotation);
  parent.add(mesh);
  return mesh;
}

function addPedestal(THREE, parent, mats) {
  cylinder(THREE, parent, .34, .42, .13, [0, .07, 0], mats.stone, 18);
  cylinder(THREE, parent, .28, .33, .08, [0, .17, 0], mats.brass, 18);
}

function addCrown(THREE, parent, mats) {
  torus(THREE, parent, .25, .055, [0, .34, 0], mats.brass, [Math.PI / 2, 0, 0]);
  for (const angle of [-.9, -.3, .3, .9]) {
    const x = Math.sin(angle) * .24;
    const z = Math.cos(angle) * .12;
    const spike = cylinder(THREE, parent, 0, .055, .35, [x, .50, z], mats.brass, 8);
    spike.rotation.z = -angle * .28;
  }
  const jewel = new THREE.Mesh(new THREE.SphereGeometry(.065, 10, 8), mats.ember);
  jewel.position.set(0, .54, .19);
  parent.add(jewel);
}

function addCup(THREE, parent, mats) {
  cylinder(THREE, parent, .08, .15, .10, [0, .29, 0], mats.brass, 14);
  cylinder(THREE, parent, .05, .05, .25, [0, .44, 0], mats.brass, 10);
  const bowl = new THREE.Mesh(new THREE.SphereGeometry(.25, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), mats.brass);
  bowl.scale.y = .78;
  bowl.rotation.x = Math.PI;
  bowl.position.set(0, .63, 0);
  parent.add(bowl);
  for (const side of [-1, 1]) {
    const handle = torus(THREE, parent, .17, .035, [side * .24, .60, 0], mats.brass, [Math.PI / 2, 0, 0]);
    handle.scale.x = .72;
  }
}

function addBlade(THREE, parent, mats, halberd = false) {
  const blade = box(THREE, parent, [halberd ? .07 : .10, .70, .045], [0, .54, 0], mats.steel, [0, 0, -.16]);
  if (halberd) {
    blade.scale.y = 1.25;
    box(THREE, parent, [.40, .06, .05], [.09, .82, 0], mats.steel, [0, 0, -.38]);
  } else {
    box(THREE, parent, [.36, .07, .07], [-.08, .27, 0], mats.brass, [0, 0, -.16]);
    cylinder(THREE, parent, .045, .045, .24, [-.11, .14, 0], mats.oak, 10).rotation.z = -.16;
  }
}

function addPawn(THREE, parent, mats, fallen = false) {
  const pawn = new THREE.Group();
  pawn.position.set(0, .21, 0);
  if (fallen) pawn.rotation.z = Math.PI / 2.8;
  parent.add(pawn);
  cylinder(THREE, pawn, .16, .22, .18, [0, .09, 0], mats.brass, 16);
  cylinder(THREE, pawn, .10, .15, .22, [0, .28, 0], mats.brass, 14);
  const head = new THREE.Mesh(new THREE.SphereGeometry(.14, 14, 10), mats.brass);
  head.position.set(0, .48, 0);
  pawn.add(head);
}

function addHelm(THREE, parent, mats) {
  const dome = new THREE.Mesh(new THREE.SphereGeometry(.25, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), mats.steel);
  dome.position.set(0, .43, 0);
  parent.add(dome);
  box(THREE, parent, [.34, .30, .035], [0, .31, .20], mats.steel);
  box(THREE, parent, [.035, .33, .05], [0, .31, .225], mats.brass);
  box(THREE, parent, [.30, .035, .05], [0, .36, .225], mats.brass);
}

function addStandard(THREE, parent, mats) {
  const pole = cylinder(THREE, parent, .025, .025, 1.05, [-.18, .62, 0], mats.steel, 8);
  pole.rotation.z = 0;
  box(THREE, parent, [.48, .50, .025], [.08, .74, 0], mats.velvet);
  box(THREE, parent, [.54, .035, .045], [.08, 1.00, 0], mats.brass);
}

function addReliquary(THREE, parent, mats) {
  box(THREE, parent, [.46, .45, .32], [0, .44, 0], mats.oak);
  box(THREE, parent, [.50, .06, .36], [0, .69, 0], mats.brass);
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(.10, 0), mats.ember);
  gem.position.set(0, .47, .18);
  parent.add(gem);
}

function addPlaque(THREE, parent, mats) {
  box(THREE, parent, [.62, .42, .055], [0, .48, 0], mats.oak);
  box(THREE, parent, [.50, .30, .065], [0, .48, .04], mats.brass);
  for (const x of [-.14, 0, .14]) box(THREE, parent, [.035, .18, .025], [x, .48, .09], mats.steel);
}

function addSeal(THREE, parent, mats) {
  cylinder(THREE, parent, .23, .23, .05, [0, .38, 0], mats.ember, 20).rotation.x = Math.PI / 2;
  torus(THREE, parent, .17, .025, [0, .38, .035], mats.brass, [Math.PI / 2, 0, 0]);
}

function addBook(THREE, parent, mats) {
  box(THREE, parent, [.58, .12, .42], [0, .31, 0], mats.parchment, [0, .10, 0]);
  box(THREE, parent, [.62, .035, .46], [0, .38, 0], mats.ember, [0, .10, 0]);
  box(THREE, parent, [.62, .035, .46], [0, .24, 0], mats.ember, [0, .10, 0]);
}

function buildRelic(THREE, honour, mats) {
  const group = new THREE.Group();
  group.name = `home-castle-relic-${String(honour.id || 'unknown')}`;
  group.userData.castleObjectId = honour.id;
  group.userData.castleEvidence = honour.evidence || 'recorded';
  group.userData.castlePrestige = Number(honour.prestige || 0);
  addPedestal(THREE, group, mats);
  switch (honour.form) {
    case 'crown': addCrown(THREE, group, mats); break;
    case 'cup': addCup(THREE, group, mats); break;
    case 'blade': addBlade(THREE, group, mats, false); break;
    case 'halberd': addBlade(THREE, group, mats, true); break;
    case 'pawn': addPawn(THREE, group, mats, false); break;
    case 'fallen-king': addPawn(THREE, group, mats, true); break;
    case 'helm': addHelm(THREE, group, mats); break;
    case 'standard': addStandard(THREE, group, mats); break;
    case 'reliquary': addReliquary(THREE, group, mats); break;
    case 'plaque': addPlaque(THREE, group, mats); break;
    case 'seal': addSeal(THREE, group, mats); break;
    case 'book': addBook(THREE, group, mats); break;
    default: addPlaque(THREE, group, mats); break;
  }
  return group;
}

export function installHomeCastleRelics(THREE, parent, honours = [], { coarse = false } = {}) {
  if (!THREE || !parent || !Array.isArray(honours)) return [];
  const visible = honours.filter((item) => item?.kind === 'honour').slice(0, MAX_PHYSICAL_RELICS);
  if (!visible.length) return [];

  const mats = {
    brass: material(THREE, { color: 0xb98a35, roughness: .27, metalness: .87 }),
    steel: material(THREE, { color: 0x8a959c, roughness: .30, metalness: .82 }),
    oak: material(THREE, { color: 0x4c2c18, roughness: .69, metalness: .05 }),
    stone: material(THREE, { color: 0x575a57, roughness: .84, metalness: .04 }),
    velvet: material(THREE, { color: 0x6e1224, roughness: .94, metalness: 0 }),
    parchment: material(THREE, { color: 0xc4b084, roughness: .90, metalness: 0 }),
    ember: material(THREE, { color: 0xa93218, emissive: 0x6c1608, emissiveIntensity: coarse ? .26 : .42, roughness: .52, metalness: .16 }),
  };
  const slots = coarse
    ? [[-3.9, .72, 2.2], [0, .72, 2.2], [3.9, .72, 2.2]]
    : [[-3.7, .72, 2.0], [0, .72, 2.0], [3.7, .72, 2.0]];

  return visible.map((honour, index) => {
    const relic = buildRelic(THREE, honour, mats);
    const [x, y, z] = slots[index];
    relic.position.set(x, y, z);
    relic.scale.setScalar(coarse ? .74 : .88);
    parent.add(relic);
    return relic;
  });
}
