/**
 * CHESSCOM 2.5D production-bank contract.
 * V33's isolated NE sprite is deliberately NOT a valid eight-way bank.
 * No artwork is generated or repeated here. Actual atomic frames must pass
 * the existing shared Sprite Forge linter and visual animation review.
 */
export const CHESSCOM_SPRITE_BANK_V34=Object.freeze({
  identity:'chesscom-sprite-bank-v34',
  schema:2,
  surface:'chesscom',
  directions:Object.freeze(['N','NE','E','SE','S','SW','W','NW']),
  minimumFrames:Object.freeze({idle:1,walk:4,aim:1,shoot:2,hit:1,die:2}),
  maxFrames:256,
  maxAtlasPixels:4096,
  footTolerancePx:2,
});
const int=(v)=>Number.isSafeInteger(v)&&v>=0;
const positive=(v)=>int(v)&&v>0;

/** +X screen right; +Y screen down. Preserve last direction when still. */
export function chesscomScreenFacingV34(dx,dy,previous='S'){
  const directions=CHESSCOM_SPRITE_BANK_V34.directions;
  if(!directions.includes(previous)||!Number.isFinite(dx)||!Number.isFinite(dy))
    throw new RangeError('Invalid screen facing');
  if(Math.hypot(dx,dy)<.00001)return previous;
  const oct=Math.round(Math.atan2(dx,-dy)/(Math.PI/4));
  return directions[(oct+8)%8];
}

/** Validate metadata only; visual/source-hash auditing happens in Sprite Forge. */
export function chesscomValidateSpriteBankV34(bank){
  const C=CHESSCOM_SPRITE_BANK_V34,errors=[];
  if(bank?.schema!==C.schema)errors.push('schema');
  if(bank?.surface!==C.surface)errors.push('surface');
  if(typeof bank?.actor!=='string'||!bank.actor.trim())errors.push('actor');
  if(typeof bank?.variant!=='string'||!bank.variant.trim())errors.push('variant');
  const atlas=bank?.atlas,cell=bank?.cell,pivot=bank?.pivot;
  if(typeof atlas?.src!=='string'||!(atlas.src.startsWith('/')||atlas.src.startsWith('https://')))
    errors.push('atlas-src');
  if(!/^[a-f0-9]{64}$/i.test(atlas?.sha256||''))errors.push('atlas-sha256');
  if(!positive(atlas?.width)||!positive(atlas?.height)
    ||atlas.width>C.maxAtlasPixels||atlas.height>C.maxAtlasPixels)
    errors.push('atlas-size');
  if(!positive(cell?.width)||!positive(cell?.height)
    ||cell.width>1024||cell.height>1024)errors.push('cell');
  if(!int(pivot?.x)||!int(pivot?.y)
    ||pivot.x>=(cell?.width||0)||pivot.y>=(cell?.height||0))errors.push('pivot');
  const clips=bank?.clips;
  if(!clips||typeof clips!=='object'||Array.isArray(clips))errors.push('clips');
  else for(const name of Object.keys(clips))
    if(!(name in C.minimumFrames))errors.push('unknown-clip:'+name);
  let count=0;
  const rectOwner=new Map();
  for(const [action,min] of Object.entries(C.minimumFrames)){
    const clip=clips?.[action],sequences=clip?.directions;
    if(!positive(clip?.fps)||clip.fps>30)errors.push('fps:'+action);
    if(!sequences||typeof sequences!=='object'||Array.isArray(sequences)){
      errors.push('directions:'+action);continue;
    }
    for(const d of Object.keys(sequences))
      if(!C.directions.includes(d))errors.push('unknown-direction:'+action+':'+d);
    for(const direction of C.directions){
      const frames=sequences[direction];
      if(!Array.isArray(frames)||frames.length<min||frames.length>32){
        errors.push('frames:'+action+':'+direction);continue;
      }
      const seen=new Set();
      for(const [index,frame] of frames.entries()){
        count++;
        const key=action+':'+direction+':'+index;
        if(!int(frame?.x)||!int(frame?.y)||frame?.width!==cell?.width
          ||frame?.height!==cell?.height
          ||frame.x+frame.width>(atlas?.width||0)
          ||frame.y+frame.height>(atlas?.height||0)){
          errors.push('rect:'+key);continue;
        }
        if(!int(frame.pivotX)||!int(frame.pivotY)
          ||Math.abs(frame.pivotX-(pivot?.x??-999))>C.footTolerancePx
          ||Math.abs(frame.pivotY-(pivot?.y??-999))>C.footTolerancePx)
          errors.push('footline:'+key);
        const rect=[frame.x,frame.y,frame.width,frame.height].join(',');
        if(seen.has(rect))errors.push('duplicate-frame:'+key);
        seen.add(rect);
        const owner=rectOwner.get(rect);
        if(owner&&owner!==direction)errors.push('direction-reuse:'+key);
        if(!owner)rectOwner.set(rect,direction);
      }
    }
  }
  if(count>C.maxFrames)errors.push('frame-budget');
  return {ok:errors.length===0,errors,frames:count};
}

/** Babylon UV coordinates for an authored top-left row-major atlas. */
export function chesscomSpriteFrameUvV34(frame,atlas){
  if(!int(frame?.x)||!int(frame?.y)||!positive(frame?.width)||!positive(frame?.height)
    ||!positive(atlas?.width)||!positive(atlas?.height)
    ||frame.x+frame.width>atlas.width||frame.y+frame.height>atlas.height)
    throw new RangeError('Invalid atlas rectangle');
  return Object.freeze({
    u0:frame.x/atlas.width,u1:(frame.x+frame.width)/atlas.width,
    v0:1-(frame.y+frame.height)/atlas.height,v1:1-frame.y/atlas.height,
  });
}
