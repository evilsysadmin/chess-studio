export const HOME_GUIDE_KEY = 'chess-study-home-guide-dismissed-v1';
export const HOME_GUIDE_OPEN_EVENT = 'chess-study-open-home-guide';

export function requestHomeGuideOpen() {
  window.dispatchEvent(new Event(HOME_GUIDE_OPEN_EVENT));
}
