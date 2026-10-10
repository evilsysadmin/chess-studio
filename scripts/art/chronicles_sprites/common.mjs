// Shared look for Chronicles 2.5D sprites: an MM3-era painted feel built
// from vector shapes. A paper grain multiplies the figure, a slight edge
// wobble breaks the "clip-art" perfection, and an optional palette step
// quantizes gradients into VGA-like bands.

export const INK = '#170e08';

// `light` sculpts the flat vector shapes into painted volume: a height map
// made from the blurred silhouette (every bone becomes a rounded tube) plus
// the blurred luminance (folds and planes inside a solid figure) is lit by a
// warm key light from the upper left, with a soft specular sheen.
export function paintFilter(id, {
  grain = 0.2, wobble = 0.9, bands = 0, seed = 7,
  light = true, relief = 4.2, softness = 3.2, sheen = 0.4, saturation = 1.15,
} = {}) {
  const quantize = bands > 0
    ? `<feComponentTransfer in="painted" result="banded">
        <feFuncR type="discrete" tableValues="${steps(bands)}"/>
        <feFuncG type="discrete" tableValues="${steps(bands)}"/>
        <feFuncB type="discrete" tableValues="${steps(bands)}"/>
      </feComponentTransfer>`
    : '';
  const lighting = light ? `
    <feGaussianBlur in="SourceAlpha" stdDeviation="${softness}" result="alphaBlur"/>
    <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  .3 .59 .11 0 0" result="lumAlpha"/>
    <feComposite in="lumAlpha" in2="SourceAlpha" operator="in" result="lumIn"/>
    <feGaussianBlur in="lumIn" stdDeviation="${softness * 0.55}" result="lumBlur"/>
    <feComposite in="alphaBlur" in2="lumBlur" operator="arithmetic" k1="0" k2=".62" k3=".38" k4="0" result="height"/>
    <feDiffuseLighting in="height" surfaceScale="${relief}" diffuseConstant="1.55" lighting-color="#fff3df" result="diffuse">
      <feDistantLight azimuth="225" elevation="48"/>
    </feDiffuseLighting>
    <feSpecularLighting in="height" surfaceScale="${relief}" specularConstant="${sheen}" specularExponent="22" lighting-color="#fffaf0" result="spec">
      <feDistantLight azimuth="225" elevation="56"/>
    </feSpecularLighting>
    <feComposite in="spec" in2="SourceAlpha" operator="in" result="specIn"/>
    <!-- cool rim from behind-right separates the figure from any background -->
    <feSpecularLighting in="alphaBlur" surfaceScale="${relief * 1.6}" specularConstant=".9" specularExponent="9" lighting-color="#a9c8ff" result="rim">
      <feDistantLight azimuth="20" elevation="18"/>
    </feSpecularLighting>
    <feComposite in="rim" in2="SourceAlpha" operator="in" result="rimIn"/>
    <feBlend in="SourceGraphic" in2="diffuse" mode="multiply" result="shaded"/>
    <feComposite in="shaded" in2="SourceAlpha" operator="in" result="shadedIn"/>
    <feComposite in="shadedIn" in2="specIn" operator="arithmetic" k1="0" k2="1" k3=".55" k4="0" result="litKey"/>
    <feComposite in="litKey" in2="rimIn" operator="arithmetic" k1="0" k2="1" k3=".35" k4="0" result="litRaw"/>
    <feColorMatrix in="litRaw" type="saturate" values="${saturation}" result="lit"/>` : '';
  const base = light ? 'lit' : 'SourceGraphic';
  return `
  <filter id="${id}" x="-5%" y="-5%" width="110%" height="110%" color-interpolation-filters="sRGB">
    ${lighting}
    <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="${seed}" result="warp"/>
    <feDisplacementMap in="${base}" in2="warp" scale="${wobble}" xChannelSelector="R" yChannelSelector="G" result="wobbled"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="${seed + 3}" result="noise"/>
    <feColorMatrix in="noise" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 -1.1 1.15" result="paper"/>
    <feComposite in="paper" in2="wobbled" operator="in" result="paperMask"/>
    <feComponentTransfer in="paperMask" result="grainy"><feFuncA type="linear" slope="${grain}"/></feComponentTransfer>
    <feBlend in="wobbled" in2="grainy" mode="multiply" result="painted"/>
    ${quantize}
  </filter>`;
}

function steps(count) {
  return Array.from({ length: count }, (_, index) => (index / (count - 1)).toFixed(3)).join(' ');
}

// A bone limb segment: ink outline, painted body, shadow side and a rim of light.
export function bone(d, width, { light = '#fff6dc', body = '#e3d0a4', shade = '#957a4e' } = {}) {
  return `
    <path d="${d}" fill="none" stroke="${INK}" stroke-width="${width + 5}" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="${d}" fill="none" stroke="${body}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="${d}" fill="none" stroke="${shade}" stroke-width="${Math.max(1.4, width * 0.4)}" stroke-linecap="round" stroke-linejoin="round" transform="translate(1.4 1.9)" opacity=".8"/>
    <path d="${d}" fill="none" stroke="${light}" stroke-width="${Math.max(1, width * 0.22)}" stroke-linecap="round" transform="translate(-.9 -1.3)" opacity=".9"/>`;
}

export function knob(x, y, r, fill = 'url(#bone-fill)') {
  return `<circle cx="${x}" cy="${y}" r="${r + 2.4}" fill="${INK}"/><circle cx="${x}" cy="${y}" r="${r}" fill="${fill}"/>
    <circle cx="${x - r * 0.32}" cy="${y - r * 0.36}" r="${r * 0.36}" fill="#fff6dc" opacity=".85"/>`;
}
