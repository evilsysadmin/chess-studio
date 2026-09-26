import { describe, expect, it } from 'vitest';
import { buildPiece, disposeObject } from './Board3DPieces.js';

function sharedGeometryByRole(root) {
  const roles = new Map();
  root.traverse((child) => {
    const role = child?.geometry?.userData?.board3DSharedGeometryRole;
    if (!child?.isMesh || !role) return;
    if (!roles.has(role)) roles.set(role, []);
    roles.get(role).push(child.geometry);
  });
  return roles;
}

function expectSharedRole(left, right, role, minimumMeshes = 1) {
  const leftGeometry = left.get(role) || [];
  const rightGeometry = right.get(role) || [];
  expect(leftGeometry.length).toBeGreaterThanOrEqual(minimumMeshes);
  expect(rightGeometry.length).toBeGreaterThanOrEqual(minimumMeshes);
  expect(new Set(leftGeometry).size).toBe(1);
  expect(new Set(rightGeometry).size).toBe(1);
  expect(leftGeometry[0]).toBe(rightGeometry[0]);
  expect(leftGeometry[0]?.userData?.board3DSharedGeometry).toBe(true);
  return leftGeometry[0];
}

describe('Board3D shared premium piece geometry', () => {
  it('reuses immutable bishop geometry across colors', () => {
    const white = buildPiece('b', 'w', 'studio', false);
    const black = buildPiece('b', 'b', 'studio', false);
    const left = sharedGeometryByRole(white);
    const right = sharedGeometryByRole(black);

    for (const role of [
      'full:bishop-body',
      'full:bishop-collar',
      'full:bishop-mitre',
      'full:bishop-slash',
      'full:bishop-signature',
    ]) {
      expectSharedRole(left, right, role);
    }

    [white, black].forEach(disposeObject);
  });

  it('reuses rook flutes and battlements within and across pieces without disposing them', () => {
    const white = buildPiece('r', 'w', 'studio', false);
    const black = buildPiece('r', 'b', 'studio', false);
    const left = sharedGeometryByRole(white);
    const right = sharedGeometryByRole(black);

    for (const role of [
      'full:rook-body',
      'full:rook-lower-ring',
      'full:rook-ornamental-band',
      'full:rook-upper-base-ring',
      'full:rook-crown-base',
      'full:rook-crown-lip',
      'full:rook-signature',
    ]) {
      expectSharedRole(left, right, role);
    }
    const flute = expectSharedRole(left, right, 'full:rook-band-flute', 16);
    const battlement = expectSharedRole(left, right, 'full:rook-battlement', 6);

    let fluteDisposed = false;
    let battlementDisposed = false;
    flute.addEventListener('dispose', () => { fluteDisposed = true; });
    battlement.addEventListener('dispose', () => { battlementDisposed = true; });

    disposeObject(white);
    expect(fluteDisposed).toBe(false);
    expect(battlementDisposed).toBe(false);
    expect((right.get('full:rook-band-flute') || [])[0]?.attributes?.position?.count).toBeGreaterThan(0);

    disposeObject(black);
    expect(fluteDisposed).toBe(false);
    expect(battlementDisposed).toBe(false);
  });

  it('reuses the seven queen crown cones and orbs', () => {
    const white = buildPiece('q', 'w', 'studio', false);
    const black = buildPiece('q', 'b', 'studio', false);
    const left = sharedGeometryByRole(white);
    const right = sharedGeometryByRole(black);

    expectSharedRole(left, right, 'full:queen-body');
    expectSharedRole(left, right, 'full:queen-collar');
    expectSharedRole(left, right, 'full:queen-signature');
    expectSharedRole(left, right, 'full:queen-crown-cone', 7);
    expectSharedRole(left, right, 'full:queen-crown-orb', 7);

    [white, black].forEach(disposeObject);
  });
});
