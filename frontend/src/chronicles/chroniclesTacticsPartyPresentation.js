export const CHRONICLES_ISO_PARTY_FACING = Math.PI;

export const CHRONICLES_ISO_PARTY_LAYOUT = Object.freeze({
  rook: Object.freeze({ x: -1.62, z: 0.08, scale: 1.03 }),
  matthias: Object.freeze({ x: -0.54, z: 0.32, scale: 1.07 }),
  bishop: Object.freeze({ x: 0.54, z: 0.32, scale: 1.01 }),
  knight: Object.freeze({ x: 1.62, z: 0.08, scale: 1.03 }),
});

export const CHRONICLES_ISO_EXPLORATION_PARTY_LAYOUT = Object.freeze({
  rook: Object.freeze({ x: -0.62, z: 0.34, scale: 1.03 }),
  matthias: Object.freeze({ x: -0.18, z: -0.32, scale: 1.07 }),
  bishop: Object.freeze({ x: 0.24, z: 0.32, scale: 1.01 }),
  knight: Object.freeze({ x: 0.64, z: -0.28, scale: 1.03 }),
});

export const CHRONICLES_ISO_MARKER_STYLE = Object.freeze({
  shape: 'square',
  moveColor: 0x65bfe3,
  attackColor: 0xc45143,
  selectionColor: 0xd8b56a,
});
