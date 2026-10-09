// Board3DProjectionDiagnostics.js — proyección REAL del tablero en pantalla.
//
// Contrato del golden path móvil (#34 · Código Rojo GP-1/GP-2): los tests miden
// lo que la cámara renderiza, no un modelo de la cámara reconstruido en el test.
// Tras cada render publicamos en el canvas la matriz vista-proyección real
// (`data-board3d-view-projection`, 16 números column-major de Three). Quien la
// consume proyecta a NDC y combina con `canvas.getBoundingClientRect()`, igual
// que hace el raycast de `squareFromPointer`, así que toque y medida comparten
// exactamente la misma matemática.
//
// Coste: sólo reescribe el dataset cuando la cámara cambia (clave redondeada de
// matrixWorld + projectionMatrix); el resto de frames es una comparación de string.
import * as THREE from 'three';
import { squarePosition } from './Board3DBoardMath.js';

export const BOARD3D_PROJECTION_VERSION = 'board3d-projection-v1';
// Evento (burbujea) que el canvas emite cuando cambia la proyección publicada.
export const BOARD3D_PROJECTION_EVENT = 'board3d-projection';
// Cara superior de las casillas (BoxGeometry 0.105 de alto apoyada en y=0).
export const BOARD3D_PLAY_SURFACE_Y = 0.105;

const FILES = 'abcdefgh';
const SQUARES = Object.freeze(
  Array.from({ length: 64 }, (_, index) => `${FILES[index % 8]}${Math.floor(index / 8) + 1}`),
);
const CORNERS = Object.freeze([[-4, -4], [4, -4], [-4, 4], [4, 4]]);

const probe = new THREE.Vector3();
const viewProjection = new THREE.Matrix4();
const lastKeyByCanvas = new WeakMap();

function round(value) {
  return Math.round(value * 1000) / 1000;
}

function projectXZ(camera, x, z) {
  probe.set(x, BOARD3D_PLAY_SURFACE_Y, z).project(camera);
  return [round(probe.x), round(probe.y)];
}

function cameraKey(camera) {
  const world = camera.matrixWorld.elements;
  const projection = camera.projectionMatrix.elements;
  let key = '';
  for (let i = 0; i < 16; i += 1) key += `${round(world[i])},${round(projection[i])};`;
  return key;
}

export const BOARD3D_PLAY_CORNERS = CORNERS;

// Snapshot NDC de esquinas y casillas (tests y calibración del encuadre).
export function board3DProjectionSnapshot(camera) {
  const squares = {};
  for (const square of SQUARES) {
    const { x, z } = squarePosition(square);
    squares[square] = projectXZ(camera, x, z);
  }
  return {
    version: BOARD3D_PROJECTION_VERSION,
    corners: CORNERS.map(([x, z]) => projectXZ(camera, x, z)),
    squares,
  };
}

/**
 * Proyecta un punto del mundo con la matriz vista-proyección publicada
 * (`dataset.board3dViewProjection`, 16 números column-major de Three).
 * Devuelve NDC {x, y, z} o null si la matriz no es válida o el punto queda detrás.
 */
export function projectWorldPointNdc(elements, [x, y, z]) {
  if (!Array.isArray(elements) || elements.length !== 16 || elements.some((value) => !Number.isFinite(value))) return null;
  const e = elements;
  const w = e[3] * x + e[7] * y + e[11] * z + e[15];
  if (!(w > 1e-6)) return null;
  return {
    x: (e[0] * x + e[4] * y + e[8] * z + e[12]) / w,
    y: (e[1] * x + e[5] * y + e[9] * z + e[13]) / w,
    z: (e[2] * x + e[6] * y + e[10] * z + e[14]) / w,
  };
}

export function readBoard3DViewProjection(canvas) {
  const raw = canvas?.dataset?.board3dViewProjection;
  if (!raw) return null;
  const elements = raw.split(',').map(Number);
  return elements.length === 16 && elements.every(Number.isFinite) ? elements : null;
}

/**
 * Publica la matriz vista-proyección en `canvas.dataset.board3dViewProjection`
 * si la cámara ha cambiado desde la última escritura. Devuelve 1 si escribió.
 */
export function applyBoard3DProjectionDiagnostics(canvas, camera) {
  if (!canvas?.dataset || !camera?.matrixWorld || !camera?.projectionMatrix) return 0;
  const key = cameraKey(camera);
  if (lastKeyByCanvas.get(canvas) === key) return 0;
  viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  canvas.dataset.board3dViewProjection = viewProjection.elements.map((value) => Number(value.toFixed(6))).join(',');
  lastKeyByCanvas.set(canvas, key);
  if (typeof canvas.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
    canvas.dispatchEvent(new CustomEvent(BOARD3D_PROJECTION_EVENT, { bubbles: true }));
  }
  return 1;
}


export function applyBoard3DRendererMemoryDiagnostics(canvas, renderer) {
  if (!canvas?.dataset || !renderer?.info?.memory) return 0;
  canvas.dataset.board3dMemoryGeometries = String(renderer.info.memory.geometries || 0);
  canvas.dataset.board3dMemoryTextures = String(renderer.info.memory.textures || 0);
  canvas.dataset.board3dMemoryPrograms = String(renderer.info.programs?.length || 0);
  return 1;
}
