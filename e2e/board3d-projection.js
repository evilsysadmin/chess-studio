import { expect } from '@playwright/test';

// Proyección REAL de la War Room (#34 · Código Rojo GP-1/GP-2).
//
// Board3D publica en el canvas, tras cada cambio de cámara, la matriz
// vista-proyección de Three (`data-board3d-view-projection`, column-major).
// Los specs proyectan casillas y puntos con ESA matriz; no reconstruyen la
// cámara a partir de perfiles de encuadre (eso valida un modelo, no la pantalla,
// y así se nos escaparon un tablero al 146 % y un toque que "no seleccionaba").

const FILES = 'abcdefgh';
// Cara superior de las casillas (Board3DTileInstances: BoxGeometry de 0.105).
export const BOARD3D_SURFACE_Y = 0.105;

function project(elements, [x, y, z]) {
  const e = elements;
  const w = e[3] * x + e[7] * y + e[11] * z + e[15];
  return {
    x: (e[0] * x + e[4] * y + e[8] * z + e[12]) / w,
    y: (e[1] * x + e[5] * y + e[9] * z + e[13]) / w,
  };
}

/**
 * Espera a que la cámara se asiente y devuelve un proyector en coordenadas de
 * cliente: `square('e4', worldY?)`, `point([x, y, z])` y `board` (bbox de las
 * esquinas jugables).
 */
export async function readBoard3DProjection(canvas, { timeout = 15_000 } = {}) {
  const attribute = 'data-board3d-view-projection';
  await expect.poll(() => canvas.getAttribute(attribute), { timeout }).toBeTruthy();
  let previous = null;
  await expect.poll(async () => {
    const current = await canvas.getAttribute(attribute);
    const settled = current === previous;
    previous = current;
    return settled;
  }, { timeout, intervals: [250] }).toBe(true);

  const elements = previous.split(',').map(Number);
  const rect = await canvas.boundingBox();
  expect(rect).not.toBeNull();

  const point = (world) => {
    const ndc = project(elements, world);
    return {
      x: rect.x + ((ndc.x + 1) / 2) * rect.width,
      y: rect.y + ((1 - ndc.y) / 2) * rect.height,
    };
  };
  const square = (name, worldY = BOARD3D_SURFACE_Y) => {
    const file = FILES.indexOf(name[0]);
    const rank = Number(name[1]);
    return point([file - 3.5, worldY, 4.5 - rank]);
  };
  const corners = [[-4, -4], [4, -4], [-4, 4], [4, 4]].map(([x, z]) => point([x, BOARD3D_SURFACE_Y, z]));
  const xs = corners.map((corner) => corner.x);
  const ys = corners.map((corner) => corner.y);
  const board = {
    x: Math.min(...xs),
    y: Math.min(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };
  return { rect, point, square, board };
}
