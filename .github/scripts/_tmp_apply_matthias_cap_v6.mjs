import fs from 'node:fs';

function replaceExact(path, from, to) {
  const source = fs.readFileSync(path, 'utf8');
  if (!source.includes(from)) throw new Error(`Expected block not found in ${path}: ${from.slice(0, 80)}`);
  fs.writeFileSync(path, source.replace(from, to));
}

const model = 'frontend/src/components/MatthiasKing3D.js';
const test = 'frontend/src/components/MatthiasKing3D.test.js';

replaceExact(model,
  "  group.userData.capStyle = 'premium-command-peaked-cap-v5';",
  "  group.userData.capStyle = 'premium-command-peaked-cap-v6';",
);

replaceExact(model,
`  capGroup.position.set(0, 1.175, -front * 0.004);
  capGroup.rotation.z = -0.018 * front;
  capGroup.rotation.x = -0.008 * front;
  capGroup.userData.faceClearance = 'eyes-and-brows-visible';
  capGroup.userData.silhouette = 'premium-plate-cap';
  capGroup.userData.reference = 'home-command-cap-v1';`,
`  capGroup.position.set(0, 1.168, -front * 0.003);
  capGroup.rotation.z = -0.012 * front;
  capGroup.rotation.x = -0.026 * front;
  capGroup.userData.faceClearance = 'eyes-and-brows-visible';
  capGroup.userData.silhouette = 'home-hero-plate-cap';
  capGroup.userData.reference = 'home-command-cap-v2';
  capGroup.userData.crownFlare = 'structured-high-flare';`,
);

replaceExact(model,
`  // Fitted lower band. The crown above deliberately flares wider, which is
  // the defining plate-cap silhouette missing from the old cylindrical hat.
  add(capGroup, new THREE.CylinderGeometry(0.207, 0.213, 0.076, segments), cap, [0, 0.035, 0], [0, 0, 0], [1.02, 1, 0.94], 'matthias-cap');
  add(capGroup, new THREE.CylinderGeometry(0.248, 0.208, 0.105, segments), cap, [0, 0.124, 0], [0, 0, 0], [1.025, 1, 0.91], 'matthias-cap-crown');
  add(capGroup, new THREE.CylinderGeometry(0.252, 0.247, 0.024, segments), cap, [-0.003, 0.188, -front * 0.002], [0, 0, 0.012 * front], [1.03, 1, 0.91], 'matthias-cap-top');

  // Wine-red band and fine top piping from the approved mock. They stay dark
  // enough to belong to the black uniform rather than reading as neon trim.
  add(capGroup, new THREE.TorusGeometry(0.211, 0.0115, 8, segments), capBand, [0, 0.061, 0], [Math.PI / 2, 0, 0], [1.02, 0.94, 1], 'matthias-cap-band');
  add(capGroup, new THREE.TorusGeometry(0.247, 0.0055, 7, segments), capBand, [-0.003, 0.199, -front * 0.002], [Math.PI / 2, 0, 0], [1.03, 0.91, 1], 'matthias-cap-red-piping');`,
`  // The Home mock reads as a real plate cap because the fitted band gives way
  // to a taller crown with a decisive shoulder before the broad top. Keep the
  // mass above the face: Matthias gets command presence, not a larger visor.
  add(capGroup, new THREE.CylinderGeometry(0.205, 0.212, 0.078, segments), cap, [0, 0.037, 0], [0, 0, 0], [1.02, 1, 0.94], 'matthias-cap');
  add(capGroup, new THREE.CylinderGeometry(0.269, 0.207, 0.132, segments), cap, [-0.002, 0.141, -front * 0.004], [0, 0, 0.008 * front], [1.025, 1, 0.92], 'matthias-cap-crown');
  add(capGroup, new THREE.CylinderGeometry(0.276, 0.268, 0.026, segments), cap, [-0.006, 0.226, -front * 0.009], [0, 0, 0.018 * front], [1.025, 1, 0.92], 'matthias-cap-top');
  add(capGroup, new THREE.TorusGeometry(0.267, 0.0075, 8, segments), cap, [-0.004, 0.211, -front * 0.007], [Math.PI / 2, 0, 0], [1.025, 0.92, 1], 'matthias-cap-crown-break');

  // The mock has a readable wine band, not merely a hairline. A shallow sleeve
  // gives it body at board scale; fine piping then frames the top plate.
  add(capGroup, new THREE.CylinderGeometry(0.214, 0.216, 0.034, segments), capBand, [0, 0.058, front * 0.001], [0, 0, 0], [1.02, 1, 0.94], 'matthias-cap-band-fill');
  add(capGroup, new THREE.TorusGeometry(0.213, 0.0085, 8, segments), brass, [0, 0.077, front * 0.002], [Math.PI / 2, 0, 0], [1.02, 0.94, 1], 'matthias-cap-band');
  add(capGroup, new THREE.TorusGeometry(0.271, 0.0055, 7, segments), capBand, [-0.006, 0.237, -front * 0.009], [Math.PI / 2, 0, 0], [1.025, 0.92, 1], 'matthias-cap-red-piping');`,
);

replaceExact(model,
`  visorShape.moveTo(-0.17, 0);
  visorShape.quadraticCurveTo(-0.165, 0.092, -0.105, 0.126);
  visorShape.quadraticCurveTo(0, 0.154, 0.105, 0.126);
  visorShape.quadraticCurveTo(0.165, 0.092, 0.17, 0);
  visorShape.quadraticCurveTo(0, -0.012, -0.17, 0);`,
`  visorShape.moveTo(-0.162, 0);
  visorShape.quadraticCurveTo(-0.158, 0.082, -0.101, 0.115);
  visorShape.quadraticCurveTo(0, 0.139, 0.101, 0.115);
  visorShape.quadraticCurveTo(0.158, 0.082, 0.162, 0);
  visorShape.quadraticCurveTo(0, -0.01, -0.162, 0);`,
);

replaceExact(model,
`    [0, -0.006, front * 0.14],
    [front * Math.PI / 2, 0, 0],`,
`    [0, -0.004, front * 0.137],
    [front * (Math.PI / 2 - 0.052), 0, 0],`,
);

replaceExact(model,
`  const cordCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.158, 0.027, front * 0.195),
    new THREE.Vector3(-0.082, 0.018, front * 0.211),
    new THREE.Vector3(0, 0.014, front * 0.216),
    new THREE.Vector3(0.082, 0.018, front * 0.211),
    new THREE.Vector3(0.158, 0.027, front * 0.195),
  ]);
  add(capGroup, new THREE.TubeGeometry(cordCurve, coarsePointer ? 12 : 22, 0.0065, 7, false), brass, [0, 0, 0], [0, 0, 0], null, 'matthias-cap-cord');
  add(capGroup, new THREE.SphereGeometry(0.012, 10, 7), brass, [-0.164, 0.03, front * 0.194], [0, 0, 0], null, 'matthias-cap-cord-stud-left');
  add(capGroup, new THREE.SphereGeometry(0.012, 10, 7), brass, [0.164, 0.03, front * 0.194], [0, 0, 0], null, 'matthias-cap-cord-stud-right');`,
`  const cordCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.162, 0.068, front * 0.195),
    new THREE.Vector3(-0.083, 0.057, front * 0.214),
    new THREE.Vector3(0, 0.052, front * 0.22),
    new THREE.Vector3(0.083, 0.057, front * 0.214),
    new THREE.Vector3(0.162, 0.068, front * 0.195),
  ]);
  add(capGroup, new THREE.TubeGeometry(cordCurve, coarsePointer ? 12 : 22, 0.0072, 7, false), brass, [0, 0, 0], [0, 0, 0], null, 'matthias-cap-cord');
  add(capGroup, new THREE.SphereGeometry(0.013, 10, 7), brass, [-0.168, 0.071, front * 0.194], [0, 0, 0], null, 'matthias-cap-cord-stud-left');
  add(capGroup, new THREE.SphereGeometry(0.013, 10, 7), brass, [0.168, 0.071, front * 0.194], [0, 0, 0], null, 'matthias-cap-cord-stud-right');`,
);

replaceExact(model,
`  add(capGroup, new THREE.BoxGeometry(0.068, 0.068, 0.014), brass, [0, 0.102, front * 0.211], [0, 0, Math.PI / 4], [1, 1.12, 1], 'matthias-cap-badge');
  add(capGroup, new THREE.BoxGeometry(0.046, 0.046, 0.016), ink, [0, 0.102, front * 0.22], [0, 0, Math.PI / 4], [1, 1.08, 1], 'matthias-cap-badge-inset');
  add(capGroup, new THREE.BoxGeometry(0.022, 0.022, 0.018), capBand, [0, 0.102, front * 0.231], [0, 0, Math.PI / 4], [1, 1.05, 1], 'matthias-cap-badge-gem');`,
`  add(capGroup, new THREE.BoxGeometry(0.072, 0.076, 0.014), brass, [0, 0.119, front * 0.214], [0, 0, Math.PI / 4], [1, 1.12, 1], 'matthias-cap-badge');
  add(capGroup, new THREE.BoxGeometry(0.048, 0.052, 0.016), ink, [0, 0.119, front * 0.223], [0, 0, Math.PI / 4], [1, 1.08, 1], 'matthias-cap-badge-inset');
  add(capGroup, new THREE.BoxGeometry(0.023, 0.025, 0.018), capBand, [0, 0.119, front * 0.234], [0, 0, Math.PI / 4], [1, 1.05, 1], 'matthias-cap-badge-gem');`,
);

replaceExact(test,
  "    expect(group.userData.capStyle).toBe('premium-command-peaked-cap-v5');",
  "    expect(group.userData.capStyle).toBe('premium-command-peaked-cap-v6');",
);

replaceExact(test,
`    expect(group.getObjectByName('matthias-cap-top')).toBeTruthy();
    expect(group.getObjectByName('matthias-cap-band')).toBeTruthy();`,
`    expect(group.getObjectByName('matthias-cap-top')).toBeTruthy();
    expect(group.getObjectByName('matthias-cap-crown-break')).toBeTruthy();
    expect(group.getObjectByName('matthias-cap-band-fill')).toBeTruthy();
    expect(group.getObjectByName('matthias-cap-band')).toBeTruthy();`,
);

replaceExact(test,
`    expect(capGroup.userData.silhouette).toBe('premium-plate-cap');
    expect(capGroup.userData.reference).toBe('home-command-cap-v1');
    expect(capGroup.position.y).toBeGreaterThanOrEqual(1.17);`,
`    expect(capGroup.userData.silhouette).toBe('home-hero-plate-cap');
    expect(capGroup.userData.reference).toBe('home-command-cap-v2');
    expect(capGroup.userData.crownFlare).toBe('structured-high-flare');
    expect(capGroup.position.y).toBeGreaterThanOrEqual(1.16);`,
);

replaceExact(test,
`    expect(visorWidth).toBeLessThanOrEqual(0.36);
    expect(visorProjection).toBeLessThanOrEqual(0.18);
    expect(cap.geometry.parameters.radiusTop).toBeLessThanOrEqual(0.21);
    expect(crown.geometry.parameters.radiusTop).toBeGreaterThan(0.24);
    expect(crown.geometry.parameters.radiusTop).toBeGreaterThan(cap.geometry.parameters.radiusTop);
    expect(cord.geometry.type).toBe('TubeGeometry');`,
`    expect(visorWidth).toBeLessThanOrEqual(0.35);
    expect(visorProjection).toBeLessThanOrEqual(0.16);
    expect(cap.geometry.parameters.radiusTop).toBeLessThanOrEqual(0.21);
    expect(crown.geometry.parameters.radiusTop).toBeGreaterThanOrEqual(0.265);
    expect(crown.geometry.parameters.height).toBeGreaterThanOrEqual(0.13);
    expect(crown.geometry.parameters.radiusTop / cap.geometry.parameters.radiusTop).toBeGreaterThanOrEqual(1.29);
    expect(group.getObjectByName('matthias-cap-top').position.y).toBeGreaterThanOrEqual(0.22);
    expect(Math.abs(capGroup.rotation.x)).toBeGreaterThanOrEqual(0.02);
    expect(cord.geometry.type).toBe('TubeGeometry');`,
);

replaceExact(test,
`    expect(visor.geometry.boundingBox.max.x - visor.geometry.boundingBox.min.x).toBeLessThanOrEqual(0.36);`,
`    expect(visor.geometry.boundingBox.max.x - visor.geometry.boundingBox.min.x).toBeLessThanOrEqual(0.35);`,
);
