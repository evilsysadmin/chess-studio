export const CHESSCOM_MATERIAL_ART_V7 = Object.freeze({
  identity:'material-art-v7',
  surfaces:'weathered-industrial',
  palette:'charcoal-brass-teal-rust',
  microtexture:'procedural-subtle',
});

function setColor(B, target, hex) {
  if (!target) return;
  const next=B.Color3.FromHexString(hex);
  target.copyFrom?.(next);
}

function snapshotMaterial(mat) {
  return {
    diffuseColor:mat.diffuseColor?.clone?.(),
    ambientColor:mat.ambientColor?.clone?.(),
    specularColor:mat.specularColor?.clone?.(),
    emissiveColor:mat.emissiveColor?.clone?.(),
    specularPower:mat.specularPower,
    alpha:mat.alpha,
    bumpTexture:mat.bumpTexture || null,
  };
}

function restoreMaterial(mat, old) {
  try {
    if (old.diffuseColor && mat.diffuseColor) mat.diffuseColor.copyFrom(old.diffuseColor);
    if (old.ambientColor && mat.ambientColor) mat.ambientColor.copyFrom(old.ambientColor);
    if (old.specularColor && mat.specularColor) mat.specularColor.copyFrom(old.specularColor);
    if (old.emissiveColor && mat.emissiveColor) mat.emissiveColor.copyFrom(old.emissiveColor);
    mat.specularPower=old.specularPower;
    mat.alpha=old.alpha;
    mat.bumpTexture=old.bumpTexture;
  } catch {}
}

function seeded(seed) {
  let value=seed>>>0;
  return () => {
    value=(value*1664525+1013904223)>>>0;
    return value/4294967296;
  };
}

function makeGritTexture(B,scene,name,{grain=false}={}) {
  const texture=new B.DynamicTexture(name,{width:192,height:192},scene,false);
  const ctx=texture.getContext();
  const rand=seeded(grain?0xC0FFEE:0xA11CE);
  ctx.fillStyle='rgb(128,128,128)';
  ctx.fillRect(0,0,192,192);

  if(grain){
    for(let y=0;y<192;y+=6){
      const shade=112+Math.floor(rand()*34);
      ctx.strokeStyle=`rgb(${shade},${shade},${shade})`;
      ctx.lineWidth=1+Math.floor(rand()*2);
      ctx.beginPath();
      ctx.moveTo(0,y+rand()*4);
      ctx.bezierCurveTo(52,y-3+rand()*8,132,y+4-rand()*8,192,y+rand()*4);
      ctx.stroke();
    }
    for(let i=0;i<80;i+=1){
      const shade=104+Math.floor(rand()*48);
      ctx.fillStyle=`rgb(${shade},${shade},${shade})`;
      ctx.fillRect(rand()*192,rand()*192,1+rand()*5,1);
    }
  }else{
    for(let i=0;i<1250;i+=1){
      const shade=104+Math.floor(rand()*52);
      const size=rand()>.92?2:1;
      ctx.fillStyle=`rgb(${shade},${shade},${shade})`;
      ctx.fillRect(Math.floor(rand()*192),Math.floor(rand()*192),size,size);
    }
    for(let i=0;i<22;i+=1){
      const shade=114+Math.floor(rand()*25);
      ctx.strokeStyle=`rgba(${shade},${shade},${shade},.58)`;
      ctx.lineWidth=.7;
      const x=rand()*192,y=rand()*192,len=16+rand()*52;
      ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+len,y+(rand()-.5)*8);ctx.stroke();
    }
  }

  texture.update(false);
  texture.wrapU=B.Texture.WRAP_ADDRESSMODE;
  texture.wrapV=B.Texture.WRAP_ADDRESSMODE;
  texture.uScale=grain?2.2:3.8;
  texture.vScale=grain?4.6:3.8;
  texture.level=grain?.13:.085;
  return texture;
}

function tune(B,scene,name,config,snapshots,textures) {
  const mat=scene.getMaterialByName?.(name);
  if(!mat) return;
  if(!snapshots.has(mat)) snapshots.set(mat,snapshotMaterial(mat));
  if(config.diffuse) setColor(B,mat.diffuseColor,config.diffuse);
  if(config.ambient) setColor(B,mat.ambientColor,config.ambient);
  if(config.specular) setColor(B,mat.specularColor,config.specular);
  if(config.emissive) setColor(B,mat.emissiveColor,config.emissive);
  if(Number.isFinite(config.power)) mat.specularPower=config.power;
  if(Number.isFinite(config.alpha)) mat.alpha=config.alpha;
  if(config.bump && textures[config.bump]) mat.bumpTexture=textures[config.bump];
}

export function installChesscomMaterialArtV7(B,scene,{tier='ultra'}={}) {
  const snapshots=new Map();
  const ownedTextures=[];
  const textures={};

  if(tier!=='balanced'){
    textures.grit=makeGritTexture(B,scene,'chesscom-material-v7-grit');
    textures.grain=makeGritTexture(B,scene,'chesscom-material-v7-grain',{grain:true});
    ownedTextures.push(textures.grit,textures.grain);
  }

  const bump=tier==='balanced'?null:'grit';
  const grain=tier==='balanced'?null:'grain';
  const configs={
    ground:{diffuse:'#20282a',ambient:'#080b0c',specular:'#111617',power:18,bump},
    tile:{diffuse:'#313a3c',ambient:'#0b0f10',specular:'#22292b',power:28,bump},
    road:{diffuse:'#292f31',ambient:'#080a0b',specular:'#151a1b',power:20,bump},
    concrete:{diffuse:'#4a4d4c',ambient:'#0d0f0f',specular:'#262929',power:30,bump},
    roof:{diffuse:'#252b2d',ambient:'#090b0c',specular:'#202628',power:34,bump},
    'roof-trim':{diffuse:'#444b4d',ambient:'#0b0e0f',specular:'#4d5659',power:58,bump},
    door:{diffuse:'#2a3031',ambient:'#090c0d',specular:'#424a4c',power:66,bump},
    wood:{diffuse:'#704f34',ambient:'#160f0a',specular:'#3e2b1e',power:38,bump:grain},
    'wood-light':{diffuse:'#906a49',ambient:'#1a120c',specular:'#503825',power:44,bump:grain},
    barrel:{diffuse:'#71392f',ambient:'#160a08',specular:'#5a2a24',power:52,bump},
    'barrel-top':{diffuse:'#4d2723',ambient:'#100706',specular:'#47302c',power:62,bump},
    sandbag:{diffuse:'#83785d',ambient:'#17140d',specular:'#343026',power:18,bump},
    metal:{diffuse:'#343c3f',ambient:'#080a0b',specular:'#667276',power:90,bump},
    'metal-bright':{diffuse:'#596467',ambient:'#0b0e0f',specular:'#929fa2',power:118,bump},
    'metal-dark':{diffuse:'#202628',ambient:'#07090a',specular:'#40484a',power:72,bump},
    'fence-wire':{diffuse:'#6c777a',ambient:'#0a0d0e',specular:'#9aa4a6',power:112},
    truck:{diffuse:'#3d4b40',ambient:'#0c100d',specular:'#4b5c52',power:66,bump},
    tire:{diffuse:'#141718',ambient:'#050606',specular:'#25292a',power:32,bump},
    window:{diffuse:'#24414a',ambient:'#071014',specular:'#91acb4',emissive:'#0b2730',power:150,alpha:.92},
    headlight:{diffuse:'#9a824a',ambient:'#1b1408',specular:'#e7d7a2',emissive:'#b88c3c',power:130},
    lamp:{diffuse:'#9a5f29',ambient:'#1b0e05',specular:'#d89b62',emissive:'#cf6828',power:104},
    'intel-case':{diffuse:'#51492c',ambient:'#100d07',specular:'#746842',power:54,bump},
  };

  for(const [name,config] of Object.entries(configs)) tune(B,scene,name,config,snapshots,textures);

  if(scene.imageProcessingConfiguration){
    const cfg=scene.imageProcessingConfiguration;
    const old={contrast:cfg.contrast,exposure:cfg.exposure};
    snapshots.set(cfg,old);
    cfg.contrast=Math.max(1.08,Math.min(cfg.contrast||1,1.17));
    cfg.exposure=Math.max(cfg.exposure||1,tier==='balanced'?1.02:1.08);
  }

  return {
    destroy(){
      for(const [target,old] of snapshots){
        if(target===scene.imageProcessingConfiguration){
          try{target.contrast=old.contrast;target.exposure=old.exposure;}catch{}
        }else restoreMaterial(target,old);
      }
      snapshots.clear();
      for(const texture of ownedTextures.reverse()){try{texture.dispose?.();}catch{}}
    },
  };
}
