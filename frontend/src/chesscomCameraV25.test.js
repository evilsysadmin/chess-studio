import { describe, expect, it } from 'vitest';
import {
  CHESSCOM_CAMERA_V25,
  chesscomCameraV25Profile,
  installChesscomCameraV25,
} from './chesscomCameraV25.js';

const target=(x=.35,y=.42,z=.46)=>({
  x,y,z,
  clone(){return target(this.x,this.y,this.z);},
  copyFrom(p){this.x=p.x;this.y=p.y;this.z=p.z;},
});

describe('Chesscom responsive cinematic camera v25',()=>{
  it('tightens wide desktop only; mobile/tablet keep all tactical objectives visible',()=>{
    const wide=chesscomCameraV25Profile({width:1600,height:900});
    expect(CHESSCOM_CAMERA_V25.identity).toBe('camera-v25-cinematic-wide');
    expect(wide.mode).toBe('cinematic');
    expect(wide.scale).toBeGreaterThanOrEqual(.92);
    expect(wide.scale).toBeLessThan(1);
    for(const [width,height] of [[390,844],[430,932],[1280,720],[1500,1000],[1600,650]]){
      const p=chesscomCameraV25Profile({width,height});
      expect(p.mode).toBe('overview');
      expect(p.scale).toBe(1);
      expect(p.beta).toBeNull();
    }
  });

  it('uses a single camera, reapplies the full original framing on resize and destroy',()=>{
    const camera={
      alpha:-Math.PI/4,
      beta:.90,
      target:target(),
      orthoLeft:-9.65,orthoRight:9.65,
      orthoTop:6.35,orthoBottom:-6.35,
    };
    const scene={getCameraByName:()=>camera};
    const host={dataset:{}};
    let width=1600,height=900;
    const installed=installChesscomCameraV25(scene,{host,viewport:()=>({width,height})});
    expect(camera.alpha).toBeCloseTo(-Math.PI/4+8*Math.PI/180);
    expect(camera.beta).toBeCloseTo(CHESSCOM_CAMERA_V25.cinematicBeta);
    expect(camera.orthoRight).toBeCloseTo(9.65*1.04*.94);
    expect(host.dataset.chesscomCameraFraming).toBe('cinematic');
    width=390;height=844;
    installed.refresh();
    expect(camera.beta).toBeCloseTo(.96);
    expect(camera.orthoRight).toBeCloseTo(9.65*1.04);
    expect(host.dataset.chesscomCameraFraming).toBe('overview');
    width=1600;height=900;
    installed.refresh();
    expect(camera.orthoTop).toBeCloseTo(6.35*1.04*.94);
    installed.destroy();
    installed.destroy(); // teardown safe under React remounts
    expect(camera.alpha).toBeCloseTo(-Math.PI/4);
    expect(camera.beta).toBeCloseTo(.90);
    expect(camera.orthoRight).toBeCloseTo(9.65);
    expect(camera.orthoTop).toBeCloseTo(6.35);
    expect(camera.target.x).toBeCloseTo(.35);
    expect(host.dataset.chesscomCamera).toBeUndefined();
    expect(host.dataset.chesscomCameraFraming).toBeUndefined();
  });

  it('degrades to a no-op when Babylon did not supply a usable camera',()=>{
    const result=installChesscomCameraV25({});
    expect(()=>result.refresh()).not.toThrow();
    expect(()=>result.destroy()).not.toThrow();
  });
});
