// Orchestrates the server-backed "Empezar de cero" flow so the UI does not
// silently report success when profile reset and Matthias memory diverge.
export async function runProgressResetLifecycle({
  snapshot,
  resetLocal,
  saveProfile,
  resetMatthias,
  restoreLocal,
}) {
  resetLocal();
  try {
    await saveProfile();
    await resetMatthias();
    return { reset: true };
  } catch (error) {
    restoreLocal(snapshot);
    try { await saveProfile(); } catch { /* rollback is best effort */ }
    throw error;
  }
}
