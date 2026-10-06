let quickMatchModulePromise = null;

export function loadQuickMatchReadyRoom() {
  if (!quickMatchModulePromise) {
    quickMatchModulePromise = import('./QuickMatchModal.jsx').catch((error) => {
      quickMatchModulePromise = null;
      throw error;
    });
  }
  return quickMatchModulePromise;
}

export async function preloadQuickMatchReadyRoom() {
  try {
    await loadQuickMatchReadyRoom();
    return true;
  } catch {
    return false;
  }
}
