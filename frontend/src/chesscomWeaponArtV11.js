import './components/ChesscomWeaponArtV11.css';

export const CHESSCOM_WEAPON_ART_V11 = Object.freeze({
  identity:'weapon-art-v11',
  weapons:Object.freeze(['hk416','g36c','mp5sd']),
});

export function chesscomWeaponArtKey(label=''){
  const normalized=String(label).toLowerCase().replace(/[^a-z0-9]/g,'');
  if(normalized.includes('g36c')) return 'g36c';
  if(normalized.includes('mp5sd')) return 'mp5sd';
  if(normalized.includes('hk416')) return 'hk416';
  return '';
}

export function installChesscomWeaponArtV11(host){
  const root=host?.closest?.('[data-chesscom-poc="true"]') || host?.parentElement?.parentElement || null;
  const art=root?.querySelector?.('.chesscom-weapon-art') || null;
  const label=root?.querySelector?.('.chesscom-weapon-title strong') || null;
  if(!art||!label) return {destroy(){}};

  const sync=()=>{
    const key=chesscomWeaponArtKey(label.textContent || '');
    if(key) art.dataset.weapon=key;
    else delete art.dataset.weapon;
  };

  sync();
  const observer=typeof MutationObserver!=='undefined'
    ? new MutationObserver(sync)
    : null;
  observer?.observe(label,{subtree:true,childList:true,characterData:true});

  return {
    destroy(){
      observer?.disconnect();
      delete art.dataset.weapon;
    },
  };
}
