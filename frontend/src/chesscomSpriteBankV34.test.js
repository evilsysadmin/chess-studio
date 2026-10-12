import {describe,it,expect} from 'vitest';
import {
  CHESSCOM_SPRITE_BANK_V34 as C,
  chesscomScreenFacingV34 as facing,
  chesscomValidateSpriteBankV34 as validate,
  chesscomSpriteFrameUvV34 as uv,
} from './chesscomSpriteBankV34.js';

function completeFixture(){
  const bank={
    schema:2,surface:'chesscom',actor:'sven',variant:'master-v1',
    atlas:{src:'/chesscom/sven-canon.webp',sha256:'a'.repeat(64),width:1152,height:2304},
    cell:{width:144,height:192},pivot:{x:72,y:183},clips:{},
  };
  let slot=0;
  for(const [clip,min] of Object.entries(C.minimumFrames)){
    const dirs={};
    for(const direction of C.directions){
      dirs[direction]=Array.from({length:min},()=>{
        const result={x:(slot%8)*144,y:Math.floor(slot/8)*192,
          width:144,height:192,pivotX:72,pivotY:183};
        slot++;
        return result;
      });
    }
    bank.clips[clip]={fps:clip==='walk'?12:8,directions:dirs};
  }
  return bank;
}

describe('Chesscom eight-direction authored sprite contract V34',()=>{
  it('quantizes clockwise screen-facing with a stable standing direction',()=>{
    expect(C.directions).toEqual(['N','NE','E','SE','S','SW','W','NW']);
    for(const [x,y,d] of [[0,-1,'N'],[1,-1,'NE'],[1,0,'E'],
      [1,1,'SE'],[0,1,'S'],[-1,1,'SW'],[-1,0,'W'],[-1,-1,'NW']])
      expect(facing(x,y)).toBe(d);
    expect(facing(0,0,'SW')).toBe('SW');
    expect(()=>facing(Infinity,0)).toThrow(RangeError);
    expect(()=>facing(0,0,'UNKNOWN')).toThrow(RangeError);
  });
  it('accepts a complete eight-way authoring fixture, not V33s single NE pose',()=>{
    expect(validate(completeFixture())).toEqual({ok:true,errors:[],frames:88});
    const truncated=completeFixture();
    delete truncated.clips.idle.directions.N;
    expect(validate(truncated).errors).toContain('frames:idle:N');
  });
  it('rejects mismatched feet, copied directional slots and malformed atlas data',()=>{
    const feet=completeFixture();
    feet.clips.walk.directions.N[1].pivotY=174;
    expect(validate(feet).errors).toContain('footline:walk:N:1');
    const copied=completeFixture();
    copied.clips.idle.directions.NE[0]={...copied.clips.idle.directions.N[0]};
    expect(validate(copied).errors).toContain('direction-reuse:idle:NE:0');
    const clip=completeFixture();
    clip.clips.die.directions.NW[1].y=2304;
    expect(validate(clip).errors).toContain('rect:die:NW:1');
    const hash=completeFixture();
    hash.atlas.sha256='not-verified';
    expect(validate(hash).errors).toContain('atlas-sha256');
  });
  it('maps top-left authored frame rects to exact Babylon UVs',()=>{
    const a={width:1152,height:2304};
    expect(uv({x:0,y:0,width:144,height:192},a))
      .toEqual({u0:0,u1:.125,v0:1-192/2304,v1:1});
    expect(uv({x:1008,y:2112,width:144,height:192},a))
      .toEqual({u0:.875,u1:1,v0:0,v1:1-2112/2304});
    expect(()=>uv({x:1200,y:0,width:144,height:192},a)).toThrow(RangeError);
  });
});
