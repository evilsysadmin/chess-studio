import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { squarePosition } from './Board3DBoardMath.js';
import {
  buildBoard3DTileInstances,
  resolveBoard3DPointerSquare,
  squareFromBoard3DIntersection,
} from './Board3DTileInstances.js';
import { board3DMovableSquares, pickBoard3DSquare } from './Board3DPointerPicking.js';

describe('Board3D tile instances', () => {
  it('packs the 64 board squares into two shared-geometry batches', () => {
    const lightMaterial = new THREE.MeshBasicMaterial();
    const darkMaterial = new THREE.MeshBasicMaterial();
    const [lightTiles, darkTiles] = buildBoard3DTileInstances({
      lightTileMaterial: lightMaterial,
      darkTileMaterial: darkMaterial,
    });

    expect(lightTiles.isInstancedMesh).toBe(true);
    expect(darkTiles.isInstancedMesh).toBe(true);
    expect(lightTiles.count).toBe(32);
    expect(darkTiles.count).toBe(32);
    expect(lightTiles.geometry).toBe(darkTiles.geometry);

    const squares = [
      ...lightTiles.userData.board3DSquares,
      ...darkTiles.userData.board3DSquares,
    ];
    expect(squares).toHaveLength(64);
    expect(new Set(squares).size).toBe(64);
    expect(squares).toContain('a1');
    expect(squares).toContain('h8');

    const owner = lightTiles.userData.board3DSquares.includes('e2') ? lightTiles : darkTiles;
    const instanceId = owner.userData.board3DSquares.indexOf('e2');
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    owner.getMatrixAt(instanceId, matrix);
    position.setFromMatrixPosition(matrix);
    const expected = squarePosition('e2');
    expect(position.x).toBeCloseTo(expected.x, 6);
    expect(position.z).toBeCloseTo(expected.z, 6);
  });

  it('resolves instanced tile hits and keeps legacy child-square picking', () => {
    const lightMaterial = new THREE.MeshBasicMaterial();
    const darkMaterial = new THREE.MeshBasicMaterial();
    const [lightTiles, darkTiles] = buildBoard3DTileInstances({
      lightTileMaterial: lightMaterial,
      darkTileMaterial: darkMaterial,
    });
    const owner = lightTiles.userData.board3DSquares.includes('c4') ? lightTiles : darkTiles;
    const instanceId = owner.userData.board3DSquares.indexOf('c4');

    expect(squareFromBoard3DIntersection({ object: owner, instanceId })).toBe('c4');

    const parent = new THREE.Group();
    parent.userData.square = 'g7';
    const child = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    parent.add(child);
    expect(squareFromBoard3DIntersection({ object: child })).toBe('g7');
    expect(squareFromBoard3DIntersection(null)).toBeNull();
  });
  it('prefiere un destino legal táctil aunque la pieza seleccionada lo ocluya en perspectiva', () => {
    const tile = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 0.1, 1),
      new THREE.MeshBasicMaterial(),
      1,
    );
    tile.userData.board3DSquares = ['g7'];

    const source = new THREE.Group();
    source.userData.square = 'g6';
    const sourceMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    source.add(sourceMesh);

    const intersections = [
      { object: sourceMesh, distance: 2 },
      { object: tile, instanceId: 0, distance: 3 },
    ];

    expect(resolveBoard3DPointerSquare(intersections)).toBe('g6');
    expect(resolveBoard3DPointerSquare(intersections, {
      selectedSquare: 'g6',
      legalTargets: [{ to: 'g7' }],
      preferLegalTargets: true,
    })).toBe('g7');
    expect(resolveBoard3DPointerSquare(intersections, {
      selectedSquare: 'g6',
      legalTargets: [{ to: 'f7' }],
      preferLegalTargets: true,
    })).toBe('g6');
  });


  it('prioriza la casilla legal oculta al hacer clic de ratón, pero no durante hover ni al reseleccionar', () => {
    const tile = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.1, 1), new THREE.MeshBasicMaterial(), 1);
    tile.userData.board3DSquares = ['e3'];
    const foreground = new THREE.Group();
    foreground.userData.square = 'e2';
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    foreground.add(mesh);
    const hits = [{ object: mesh, distance: 2 }, { object: tile, instanceId: 0, distance: 3 }];
    const canvas = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 800 }) };
    const pointer = new THREE.Vector2();
    const raycaster = { setFromCamera: () => {}, intersectObjects: () => hits };
    const openingFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    const base = { canvas, pointer, raycaster, camera: {}, pickTargets: [], latestProps: {
      selectedSquare: 'e2', legalTargets: [{ to: 'e3' }], fen: openingFen,
    } };
    expect(pickBoard3DSquare({ ...base, event: { type: 'pointermove', clientX: 410, clientY: 410 } })).toBe('e2');
    // The canvas sends release coordinates (not the raw pointer event) for an actual click.
    expect(pickBoard3DSquare({ ...base, event: { clientX: 410, clientY: 410 } })).toBe('e3');
    const knight = new THREE.Group();
    knight.userData.square = 'g1';
    const knightMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    knight.add(knightMesh);
    hits[0] = { object: knightMesh, distance: 2 };
    expect(pickBoard3DSquare({ ...base, event: { clientX: 410, clientY: 410 } })).toBe('g1');
    expect(pickBoard3DSquare({ ...base, event: { clientX: 410, clientY: 410 }, latestProps: {
      selectedSquare: null, legalTargets: [], fen: openingFen,
    } })).toBe('g1');
  });

  it('al elegir pieza, la casilla bajo el dedo gana si la pieza visible no puede mover', () => {
    const tile = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.1, 1), new THREE.MeshBasicMaterial(), 1);
    tile.userData.board3DSquares = ['e2'];
    const king = new THREE.Group();
    king.userData.square = 'e1';
    const kingMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    king.add(kingMesh);
    // From white's camera the e1 king's crown covers the e2 tile.
    const intersections = [
      { object: kingMesh, distance: 2 },
      { object: tile, instanceId: 0, distance: 3 },
    ];
    const opening = board3DMovableSquares('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    expect(opening.has('e2')).toBe(true);
    expect(opening.has('e1')).toBe(false);
    expect(resolveBoard3DPointerSquare(intersections, { movableSquares: opening })).toBe('e2');
    // Both can move: the visible piece still wins.
    expect(resolveBoard3DPointerSquare(intersections, { movableSquares: new Set(['e1', 'e2']) })).toBe('e1');
    // Under the finger nothing movable: keep the visible hit.
    expect(resolveBoard3DPointerSquare(intersections, { movableSquares: new Set(['d2']) })).toBe('e1');
    // No position info: unchanged behaviour.
    expect(resolveBoard3DPointerSquare(intersections)).toBe('e1');
    expect(board3DMovableSquares('not a fen')).toBeNull();
  });

});

describe('Combat capture e5 to d4 · 3D pointer', () => {
  it('picks a legal occupied target piece even when the destination tile is hidden', () => {
    const source = new THREE.Group();
    source.userData.square = 'e5';
    const sourceMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    source.add(sourceMesh);
    const target = new THREE.Group();
    target.userData.square = 'd4';
    const targetMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    target.add(targetMesh);
    const intersections = [
      { object: sourceMesh, distance: 1 },
      { object: targetMesh, distance: 1.2 },
    ];
    const targets = [{ to: 'd4', san: 'exd4', captured: 'n' }, { to: 'e4', san: 'e4' }];
    const opts = { selectedSquare: 'e5', legalTargets: targets, preferLegalTargets: true, movableSquares: new Set(['e5']) };
    expect(resolveBoard3DPointerSquare(intersections, opts)).toBe('d4');
    expect(resolveBoard3DPointerSquare(intersections, { ...opts, preferLegalTargets: false })).toBe('e5');
    expect(resolveBoard3DPointerSquare(intersections, { ...opts, legalTargets: [{ to: 'e4', san: 'e4' }] })).toBe('e5');
    source.userData.square = 'f5';
    expect(resolveBoard3DPointerSquare(intersections, { ...opts, movableSquares: new Set(['e5', 'f5']) })).toBe('f5');
    const canvas = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 800 }) };
    const raycaster = { setFromCamera() {}, intersectObjects: () => intersections };
    source.userData.square = 'e5';
    expect(pickBoard3DSquare({
      event: { clientX: 400, clientY: 400 }, canvas, pointer: new THREE.Vector2(), raycaster,
      camera: {}, pickTargets: [], latestProps: {
        selectedSquare: 'e5', legalTargets: targets, fen: '7k/8/8/4p3/3N4/8/8/K7 b - - 0 1',
      },
    })).toBe('d4');
  });
});
