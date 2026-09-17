import * as THREE from 'three';
import {
  HOME_CASTLE_ART_HEIGHT,
  HOME_CASTLE_ART_WIDTH,
  canonicalHallDepth,
} from './HomeCastle3DGeometry.js';

export const HOME_CASTLE_CLEAN_PATCH_PLAN = Object.freeze([
  Object.freeze({
    id: 'tournament',
    center: Object.freeze({ x: -0.96, y: 0.018 }),
    size: Object.freeze({ width: 0.19, height: 0.17 }),
    sampleOffsetX: 0.155,
    feather: 0.17,
  }),
]);

const VERTEX_SHADER = `
  attribute vec2 patchUv;
  varying vec2 vSourceUv;
  varying vec2 vPatchUv;

  void main() {
    vSourceUv = uv;
    vPatchUv = patchUv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAGMENT_SHADER = `
  uniform sampler2D map;
  uniform float sampleOffsetU;
  uniform float feather;
  varying vec2 vSourceUv;
  varying vec2 vPatchUv;

  void main() {
    vec4 fromLeft = texture2D(map, vSourceUv - vec2(sampleOffsetU, 0.0));
    vec4 fromRight = texture2D(map, vSourceUv + vec2(sampleOffsetU, 0.0));
    float blend = smoothstep(0.15, 0.85, vPatchUv.x);
    vec4 clean = mix(fromLeft, fromRight, blend);
    float edge = min(min(vPatchUv.x, 1.0 - vPatchUv.x), min(vPatchUv.y, 1.0 - vPatchUv.y));
    float alpha = smoothstep(0.0, feather, edge);
    gl_FragColor = vec4(clean.rgb, clean.a * alpha);
  }
`;

function createPatchGeometry(patch, segments = 6) {
  const geometry = new THREE.PlaneGeometry(patch.size.width, patch.size.height, segments, segments);
  const positions = geometry.attributes.position;
  const sourceUv = geometry.attributes.uv;
  const patchUv = new Float32Array(positions.count * 2);

  for (let index = 0; index < positions.count; index += 1) {
    const localX = positions.getX(index);
    const localY = positions.getY(index);
    const worldX = patch.center.x + localX;
    const worldY = patch.center.y + localY;
    const u = 0.5 + (worldX / HOME_CASTLE_ART_WIDTH);
    const v = 0.5 + (worldY / HOME_CASTLE_ART_HEIGHT);

    sourceUv.setXY(index, u, v);
    positions.setZ(index, canonicalHallDepth(u, v) + 0.0022);

    patchUv[(index * 2)] = (localX / patch.size.width) + 0.5;
    patchUv[(index * 2) + 1] = (localY / patch.size.height) + 0.5;
  }

  positions.needsUpdate = true;
  sourceUv.needsUpdate = true;
  geometry.setAttribute('patchUv', new THREE.BufferAttribute(patchUv, 2));
  return geometry;
}

export function createHomeCastleCleanPatchLayer(plan = HOME_CASTLE_CLEAN_PATCH_PLAN) {
  const group = new THREE.Group();
  group.name = 'home-castle-clean-patches';
  group.renderOrder = 0.5;
  const geometries = [];
  const materials = [];

  for (const patch of plan) {
    const geometry = createPatchGeometry(patch);
    const material = new THREE.ShaderMaterial({
      uniforms: {
        map: { value: null },
        sampleOffsetU: { value: patch.sampleOffsetX / HOME_CASTLE_ART_WIDTH },
        feather: { value: patch.feather },
      },
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `home-castle-clean-patch-${patch.id}`;
    mesh.renderOrder = 0.5;
    group.add(mesh);
    geometries.push(geometry);
    materials.push(material);
  }

  return {
    group,
    setTexture(texture) {
      for (const material of materials) {
        material.uniforms.map.value = texture;
        material.needsUpdate = true;
      }
    },
    dispose() {
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
    },
  };
}
