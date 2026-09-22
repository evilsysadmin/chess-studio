// Pure deterministic helpers shared by ambient sequencing and performance.
export function stableThemeSeed(id = '') {
  let seed = 0;
  for (let i = 0; i < id.length; i += 1) seed = ((seed * 31) + id.charCodeAt(i)) >>> 0;
  return seed;
}
