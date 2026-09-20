import matthiasPortrait from '../assets/chronicles/matthias-canonical.webp';
import hildegardPortrait from '../assets/chronicles/hildegard-canonical.webp';
import azizPortrait from '../assets/chronicles/aziz-canonical.webp';
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
