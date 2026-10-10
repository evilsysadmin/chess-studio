// Shared look for Chronicles 2.5D sprites: an MM3-era painted feel built
// from vector shapes. A paper grain multiplies the figure, a slight edge
// wobble breaks the "clip-art" perfection, and an optional palette step
// quantizes gradients into VGA-like bands.

export const INK = '#170e08';

export function paintFilter(id, { grain = 0.2, wobble = 0.9, bands = 0, seed = 7 } = {}) {
  const quantize = bands > 0
    ? `<feComponentTransfer in="painted" result="banded">
        <feFuncR type="discrete" tableValues="${steps(bands)}"/>
        <feFuncG type="discrete" tableValues="${steps(bands)}"/>
        <feFuncB type="discrete" tableValues="${steps(bands)}"/>
      </feComponentTransfer>`
    : '';
  return `
  <filter id="${id}" x="-5%" y="-5%" width="110%" height="110%" color-interpolation-filters="sRGB">
    <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="${seed}" result="warp"/>
    <feDisplacementMap in="SourceGraphic" in2="warp" scale="${wobble}" xChannelSelector="R" yChannelSelector="G" result="wobbled"/>
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
