import { describe, expect, it } from 'vitest';
import { CHESSCOM_CAMERA_V18, installChesscomCameraV18 } from './chesscomCameraV18.js';

function fakeTarget(x=.35,y=.42,z=.46) {
  return {
    x,y,z,
    clone(){ return fakeTarget(this.x,this.y,this.z); },
    copyFrom(other){ this.x=other.x; this.y=other.y; this.z=other.z; },
  };
}

describe('Chesscom camera v18', () => {
  it('gira, baja el cenital y abre ligeramente el encuadre ortográfico', () => {
    const camera = {
      alpha:-Math.PI/4,
      beta:.90,
      target:fakeTarget(),
      orthoLeft:-9.65,
      orthoRight:9.65,
      orthoTop:6.35,
      orthoBottom:-6.35,
    };
    const scene = { getCameraByName:() => camera };

    const installed = installChesscomCameraV18(scene);

    expect(camera.alpha).toBeCloseTo(-Math.PI/4 + (8 * Math.PI / 180), 6);
    expect(camera.beta).toBe(CHESSCOM_CAMERA_V18.beta);
    expect(camera.target.x).toBeCloseTo(.47, 6);
    expect(camera.target.z).toBeCloseTo(.54, 6);
    expect(camera.orthoRight).toBeCloseTo(9.65 * 1.04, 6);
    expect(camera.orthoTop).toBeCloseTo(6.35 * 1.04, 6);

    installed.destroy();
    expect(camera.alpha).toBeCloseTo(-Math.PI/4, 6);
    expect(camera.beta).toBeCloseTo(.90, 6);
    expect(camera.target.x).toBeCloseTo(.35, 6);
    expect(camera.target.y).toBeCloseTo(.42, 6);
    expect(camera.target.z).toBeCloseTo(.46, 6);
    expect(camera.orthoLeft).toBeCloseTo(-9.65, 6);
    expect(camera.orthoRight).toBeCloseTo(9.65, 6);
  });

  it('es inerte si no hay una cámara compatible', () => {
    expect(() => installChesscomCameraV18({}).destroy()).not.toThrow();
  });
});
