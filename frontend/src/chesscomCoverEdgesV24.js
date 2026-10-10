// Dust Veil cover readability: physically attached, light-catching edging.
// This never changes grid collision, cover classification, movement or LOS.
export const CHESSCOM_COVER_EDGES_V24 = Object.freeze({
  identity:'cover-edges-v24',
  perCrateLimit:3,
  affectsTactics:false,
});

export function chesscomCrateEdgeV24Parts({high=false,coarse=false}={}) {
  const height=high?1.05:.58;
  const parts=[
    {name:'front-rim',finish:'metalBright',
      x:0,y:height-.095,z:-.537,w:.84,h:.045,d:.036},
  ];
  // Vertical corner reinforcement makes high cover recognisable without
  // inventing an extra wall or touching tactical cover data.
  if(high&&!coarse){
    for(const side of [-1,1])parts.push({
      name:`high-corner-${side}`,finish:'metal',
      x:side*.424,y:height-.365,z:-.535,w:.042,h:.34,d:.034,
    });
  }
  return parts;
}
