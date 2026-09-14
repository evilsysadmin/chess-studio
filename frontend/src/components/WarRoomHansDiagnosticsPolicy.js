export function warRoomHansDiagnosticsRequested({
  quickIteration = false,
  webdriver = false,
  ambientAudit = false,
} = {}) {
  return Boolean(quickIteration || (webdriver && ambientAudit));
}
