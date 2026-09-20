import matthiasPortrait from '../assets/chronicles/matthias-canonical-v2.webp';
import hildegardPortrait from '../assets/chronicles/hildegard-canonical-v2.webp';
import azizPortrait from '../assets/chronicles/aziz-canonical-v2.webp';
import faustPortrait from '../assets/chronicles/faust-canonical-v2.webp';

export const CHRONICLES_PARTY_PORTRAITS = Object.freeze({
  matthias: matthiasPortrait,
  rook: hildegardPortrait,
  bishop: azizPortrait,
  knight: faustPortrait,
});

export function chroniclesPartyPortraitUrl(memberId) {
  return CHRONICLES_PARTY_PORTRAITS[memberId] || matthiasPortrait;
}
