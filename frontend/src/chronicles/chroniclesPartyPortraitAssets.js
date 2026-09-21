import { MATTHIAS_BASE_AVATAR } from '../matthiasVisuals.js';
import hildegardPortrait from '../assets/chronicles/hildegard-canonical-v2.webp';
import azizPortrait from '../assets/chronicles/aziz-canonical-v2.webp';
import faustPortrait from '../assets/chronicles/faust-canonical-v2.webp';

export const CHRONICLES_PARTY_PORTRAITS = Object.freeze({
  matthias: MATTHIAS_BASE_AVATAR,
  rook: hildegardPortrait,
  bishop: azizPortrait,
  knight: faustPortrait,
});

export function chroniclesPartyPortraitUrl(memberId) {
  return CHRONICLES_PARTY_PORTRAITS[memberId] || MATTHIAS_BASE_AVATAR;
}
