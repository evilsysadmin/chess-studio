from pathlib import Path

path = Path('frontend/src/components/MatthiasKing3D.js')
text = path.read_text()

replacements = [
    ("group.userData.faceStyle = 'proud-command-scowl-v5';", "group.userData.faceStyle = 'command-fury-scowl-v6';"),
    ("const face = mat(pieceColor === 'b' ? 0xeee1c9 : 0xd3bea0, {", "const face = mat(0xf2eadb, {"),
    ("const faceShadow = mat(pieceColor === 'b' ? 0xbda78b : 0x9b7659, {", "const faceShadow = mat(0xc1ad91, {"),
    ("  const ink = mat(0x05070a, {\n", "  const eyeWhite = mat(0xd8d8d2, {\n    metalness: 0,\n    roughness: 0.88,\n    clearcoat: 0.01,\n    envMapIntensity: 0.08,\n    specularIntensity: 0.06,\n  });\n  const ink = mat(0x05070a, {\n"),
    ("  headRig.userData.expression = 'proud-angry-v1';", "  headRig.userData.expression = 'command-fury-v2';"),
    ("  // Slightly broader and flatter than the old soft oval: more officer, less sad doll.\n  add(headRig, new THREE.SphereGeometry(0.235, segments, coarsePointer ? 16 : 24), face, [0, 1.016, 0], [0, 0, 0], [1.09, 0.90, 0.92], 'matthias-face');\n  const faceZ = front * 0.226;\n\n  // Narrow eye slits angle inward to reinforce the scowl instead of reading tired.\n  add(headRig, new THREE.SphereGeometry(0.027, 14, 9), ink, [-0.071, 1.029, faceZ], [0, 0, -0.11 * front], [1.28, 0.36, 0.34], 'matthias-eye-left');\n  add(headRig, new THREE.SphereGeometry(0.027, 14, 9), ink, [0.071, 1.029, faceZ], [0, 0, 0.11 * front], [1.28, 0.36, 0.34], 'matthias-eye-right');\n\n  // Match Matthias' canonical avatar: brows rise toward the outside corners.\n  // From the tactical camera this reads as proud/angry, not drooping/sad.\n  add(headRig, new THREE.BoxGeometry(0.1, 0.016, 0.018), ink, [-0.064, 1.078, front * 0.229], [0, 0, 0.38 * front], null, 'matthias-brow-left');\n  add(headRig, new THREE.BoxGeometry(0.1, 0.016, 0.018), ink, [0.064, 1.078, front * 0.229], [0, 0, -0.38 * front], null, 'matthias-brow-right');",
     "  // Approved king-pawn reference: a pale, nearly round face under the plate cap.\n  // The expression must survive board scale without reading tired or sad.\n  add(headRig, new THREE.SphereGeometry(0.235, segments, coarsePointer ? 16 : 24), face, [0, 1.016, 0], [0, 0, 0], [1.06, 0.94, 0.94], 'matthias-face');\n  const faceZ = front * 0.226;\n\n  // Small pale sclera make the glare readable; the existing named eye meshes remain\n  // the dark pupils so animation/consumers keep their stable handles.\n  add(headRig, new THREE.SphereGeometry(0.036, 14, 9), eyeWhite, [-0.071, 1.028, faceZ], [0, 0, -0.12 * front], [1.34, 0.48, 0.36], 'matthias-eye-white-left');\n  add(headRig, new THREE.SphereGeometry(0.036, 14, 9), eyeWhite, [0.071, 1.028, faceZ], [0, 0, 0.12 * front], [1.34, 0.48, 0.36], 'matthias-eye-white-right');\n  add(headRig, new THREE.SphereGeometry(0.024, 14, 9), ink, [-0.069, 1.026, front * 0.233], [0, 0, -0.12 * front], [1.18, 0.34, 0.30], 'matthias-eye-left');\n  add(headRig, new THREE.SphereGeometry(0.024, 14, 9), ink, [0.069, 1.026, front * 0.233], [0, 0, 0.12 * front], [1.18, 0.34, 0.30], 'matthias-eye-right');\n\n  // Critical sign convention: inner brow ends sit LOWER than the outer ends.\n  // The previous signs did the opposite and produced the recurring sad Matthias.\n  add(headRig, new THREE.BoxGeometry(0.105, 0.019, 0.019), ink, [-0.064, 1.069, front * 0.231], [0, 0, -0.44 * front], null, 'matthias-brow-left');\n  add(headRig, new THREE.BoxGeometry(0.105, 0.019, 0.019), ink, [0.064, 1.069, front * 0.231], [0, 0, 0.44 * front], null, 'matthias-brow-right');"),
    ("  // Short, perfectly level pressed mouth: stern, not downturned.\n  add(headRig, new THREE.BoxGeometry(0.108, 0.01, 0.015), ink, [0, 0.939, front * 0.231], [0, 0, 0], null, 'matthias-mouth');",
     "  // Short, slightly skewed command sneer. It is deliberately NOT downturned.\n  add(headRig, new THREE.BoxGeometry(0.104, 0.012, 0.015), ink, [0.004, 0.939, front * 0.232], [0, 0, -0.055 * front], null, 'matthias-mouth');"),
]

for old, new in replacements:
    if old not in text:
        raise SystemExit(f'Matthias anchor not found:\n{old[:160]}')
    text = text.replace(old, new, 1)

path.write_text(text)

# Update the main geometry contract test without broad source-reader coupling.
test_path = Path('frontend/src/components/MatthiasKing3D.test.js')
t = test_path.read_text()
t = t.replace("expect(group.userData.faceStyle).toBe('proud-command-scowl-v5');", "expect(group.userData.faceStyle).toBe('command-fury-scowl-v6');")
t = t.replace("expect(headRig.userData.expression).toBe('proud-angry-v1');", "expect(headRig.userData.expression).toBe('command-fury-v2');")
t = t.replace("expect(face.scale.x).toBeGreaterThan(1.07);\n    expect(face.scale.y).toBeLessThan(0.93);", "expect(face.scale.x).toBeGreaterThan(1.04);\n    expect(face.scale.y).toBeGreaterThan(0.92);\n    expect(face.scale.y).toBeLessThan(0.96);")
t = t.replace("expect(leftBrow.rotation.z).toBeGreaterThan(0.32);\n    expect(rightBrow.rotation.z).toBeLessThan(-0.32);", "expect(leftBrow.rotation.z).toBeLessThan(-0.40);\n    expect(rightBrow.rotation.z).toBeGreaterThan(0.40);")
t = t.replace("expect(mouth.geometry.parameters.width).toBeLessThanOrEqual(0.11);\n    expect(Math.abs(mouth.rotation.z)).toBeLessThan(0.001);", "expect(mouth.geometry.parameters.width).toBeLessThanOrEqual(0.105);\n    expect(Math.abs(mouth.rotation.z)).toBeGreaterThan(0.04);\n    expect(Math.abs(mouth.rotation.z)).toBeLessThan(0.07);")
t = t.replace("expect(group.getObjectByName('matthias-eye-left')).toBeTruthy();\n    expect(group.getObjectByName('matthias-brow-left')).toBeTruthy();", "expect(group.getObjectByName('matthias-eye-left')).toBeTruthy();\n    expect(group.getObjectByName('matthias-eye-white-left')).toBeTruthy();\n    expect(group.getObjectByName('matthias-brow-left')).toBeTruthy();", 1)
t = t.replace("expect(group.getObjectByName('matthias-eye-right')).toBeTruthy();\n    expect(group.getObjectByName('matthias-mouth')).toBeTruthy();", "expect(group.getObjectByName('matthias-eye-right')).toBeTruthy();\n    expect(group.getObjectByName('matthias-eye-white-left')).toBeTruthy();\n    expect(group.getObjectByName('matthias-eye-white-right')).toBeTruthy();\n    expect(group.getObjectByName('matthias-mouth')).toBeTruthy();")
# New brow is closer to the eye on purpose: aggression, not surprise.
t = t.replace("expect(brow.position.y - eye.position.y).toBeGreaterThan(0.045);", "expect(brow.position.y - eye.position.y).toBeGreaterThan(0.038);")
t = t.replace("expect(brow.geometry.parameters.width).toBeLessThanOrEqual(0.1);", "expect(brow.geometry.parameters.width).toBeLessThanOrEqual(0.105);")
t = t.replace("expect(mouth.geometry.parameters.height).toBeLessThanOrEqual(0.01);", "expect(mouth.geometry.parameters.height).toBeLessThanOrEqual(0.012);")
test_path.write_text(t)

contrast_path = Path('frontend/src/components/MatthiasKing3DFaceContrast.test.js')
c = contrast_path.read_text()
c = c.replace("expect(face.material.color.getHex()).toBe(0xeee1c9);", "expect(face.material.color.getHex()).toBe(0xf2eadb);")
c = c.replace("expect(nose.material.color.getHex()).toBe(0xbda78b);", "expect(nose.material.color.getHex()).toBe(0xc1ad91);")
c = c.replace("const mouth = group.getObjectByName('matthias-mouth');", "const mouth = group.getObjectByName('matthias-mouth');\n    const eyeWhite = group.getObjectByName('matthias-eye-white-left');")
c = c.replace("expect(brow.material).toBe(eye.material);", "expect(eyeWhite).toBeTruthy();\n    expect(brightness(eyeWhite.material)).toBeGreaterThan(brightness(eye.material) * 5);\n    expect(brow.material).toBe(eye.material);")
contrast_path.write_text(c)

# The approved player king is tall but deliberately slimmer in X/Z. Scaling the
# whole group laterally also contains skin decorations that are attached after
# the core model is built; Y stays untouched so king height remains authoritative.
player_path = Path('frontend/src/components/PlayerKing3D.js')
p = player_path.read_text()
old_scale = "  group.scale.setScalar(coarsePointer ? 0.97 : 1.0);\n  group.userData.board3DPremiumPieceScale = group.scale.x;"
new_scale = "  group.scale.set(\n    coarsePointer ? 0.92 : 0.94,\n    coarsePointer ? 0.97 : 1.0,\n    coarsePointer ? 0.92 : 0.94,\n  );\n  group.userData.board3DPremiumPieceScale = group.scale.x;"
if old_scale not in p:
    raise SystemExit('Player king scale anchor not found')
player_path.write_text(p.replace(old_scale, new_scale, 1))
