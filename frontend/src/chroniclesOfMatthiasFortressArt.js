import * as THREE from 'three';

export const CHRONICLES_TACTICS_FORTRESS_STYLE = Object.freeze({
  motif: 'heraldic-fortress',
  bannerCount: 2,
  battlementCount: 7,
  primaryCloth: 0x1f3550,
  secondaryCloth: 0x542c2a,
  heraldry: 0xc9a25c,
});

function ownedMaterial(params) {
  const material = new THREE.MeshStandardMaterial(params);
  material.userData.chroniclesIsoOwned = true;
  return material;
}

function addMesh(root, geometry, material, position, name, {
  castShadow = true,
  receiveShadow = true,
} = {}) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  mesh.name = name;
  mesh.castShadow = castShadow;
  mesh.receiveShadow = receiveShadow;
  root.add(mesh);
  return mesh;
}

function bannerGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(-0.52, 0.92);
  shape.lineTo(0.52, 0.92);
  shape.lineTo(0.52, -0.66);
  shape.lineTo(0.18, -1.02);
  shape.lineTo(0, -0.78);
  shape.lineTo(-0.18, -1.02);
  shape.lineTo(-0.52, -0.66);
  shape.closePath();
  return new THREE.ShapeGeometry(shape);
}

function buildBanner(root, {
  x,
  clothColor,
  index,
  brass,
  coarsePointer,
}) {
  const banner = new THREE.Group();
  banner.name = `chronicles-fortress-banner-${index}`;
  banner.position.set(x, 2.5, 0.62);

  const cloth = new THREE.Mesh(
    bannerGeometry(),
    ownedMaterial({
      color: clothColor,
      roughness: 0.9,
      metalness: 0.01,
      side: THREE.DoubleSide,
    }),
  );
  cloth.castShadow = !coarsePointer;
  cloth.receiveShadow = true;
  banner.add(cloth);

  const crossVertical = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.95, 0.028), brass);
  crossVertical.position.set(0, 0.04, 0.026);
  crossVertical.castShadow = !coarsePointer;
  banner.add(crossVertical);

  const crossHorizontal = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.075, 0.028), brass);
  crossHorizontal.position.set(0, 0.18, 0.026);
  crossHorizontal.castShadow = !coarsePointer;
  banner.add(crossHorizontal);

  const finial = new THREE.Mesh(
    new THREE.SphereGeometry(0.08, coarsePointer ? 8 : 12, coarsePointer ? 6 : 10),
    brass,
  );
  finial.position.set(0.64, 0.96, 0.01);
  finial.castShadow = !coarsePointer;
  banner.add(finial);

  const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 1.48, 8), brass);
  rail.rotation.z = Math.PI / 2;
  rail.position.set(0, 0.96, 0.01);
  rail.castShadow = !coarsePointer;
  banner.add(rail);

  root.add(banner);
  return banner;
}

export function installChroniclesTacticsFortressAccents(
  shrine,
  { wall, trim, brass, coarsePointer = false } = {},
) {
  if (!shrine || !wall || !trim || !brass) return null;

  const accents = new THREE.Group();
  accents.name = 'chronicles-fortress-accents';

  addMesh(
    accents,
    new THREE.BoxGeometry(6.7, 0.18, 1.42),
    trim,
    [0, 0.09, 0.36],
    'chronicles-fortress-threshold',
    { castShadow: !coarsePointer, receiveShadow: true },
  );

  [-3.08, 3.08].forEach((x, index) => {
    addMesh(
      accents,
      new THREE.BoxGeometry(0.72, 3.85, 0.94),
      wall,
      [x, 1.82, -0.06],
      `chronicles-fortress-buttress-${index}`,
      { castShadow: !coarsePointer, receiveShadow: true },
    );
    addMesh(
      accents,
      new THREE.BoxGeometry(0.96, 0.2, 1.08),
      trim,
      [x, 3.72, -0.02],
      `chronicles-fortress-buttress-cap-${index}`,
      { castShadow: !coarsePointer, receiveShadow: true },
    );
  });

  const gableLeft = addMesh(
    accents,
    new THREE.BoxGeometry(3.15, 0.22, 0.4),
    trim,
    [-1.28, 4.05, 0],
    'chronicles-fortress-gable-left',
    { castShadow: !coarsePointer, receiveShadow: true },
  );
  gableLeft.rotation.z = 0.48;

  const gableRight = addMesh(
    accents,
    new THREE.BoxGeometry(3.15, 0.22, 0.4),
    trim,
    [1.28, 4.05, 0],
    'chronicles-fortress-gable-right',
    { castShadow: !coarsePointer, receiveShadow: true },
  );
  gableRight.rotation.z = -0.48;

  const battlementGeometry = new THREE.BoxGeometry(0.46, 0.44, 0.62);
  const battlementXs = [-2.25, -1.5, -0.75, 0, 0.75, 1.5, 2.25];
  battlementXs.forEach((x, index) => {
    addMesh(
      accents,
      battlementGeometry,
      wall,
      [x, 3.69, -0.02],
      `chronicles-fortress-battlement-${index}`,
      { castShadow: !coarsePointer, receiveShadow: true },
    );
  });

  const primaryCloth = CHRONICLES_TACTICS_FORTRESS_STYLE.primaryCloth;
  const secondaryCloth = CHRONICLES_TACTICS_FORTRESS_STYLE.secondaryCloth;
  buildBanner(accents, {
    x: -4.08,
    clothColor: primaryCloth,
    index: 0,
    brass,
    coarsePointer,
  });
  buildBanner(accents, {
    x: 4.08,
    clothColor: secondaryCloth,
    index: 1,
    brass,
    coarsePointer,
  });

  const crest = new THREE.Group();
  crest.name = 'chronicles-fortress-crest';
  crest.position.set(0, 4.55, 0.18);
  const crestRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.34, 0.05, 8, coarsePointer ? 16 : 24),
    brass,
  );
  crestRing.castShadow = !coarsePointer;
  crest.add(crestRing);
  const crestBlade = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.62, 0.05), brass);
  crestBlade.rotation.z = Math.PI / 4;
  crest.add(crestBlade);
  const crestBladeCross = crestBlade.clone();
  crestBladeCross.rotation.z = -Math.PI / 4;
  crest.add(crestBladeCross);
  accents.add(crest);

  shrine.add(accents);
  return accents;
}
