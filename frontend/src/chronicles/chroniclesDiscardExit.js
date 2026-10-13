// Leaving Chronicles is a UI action, not a server-side DELETE transaction.
// A fresh unsaved run may need cleanup, but deleting it must never block exit.
// Previously committed manual/area checkpoints are not touched here.
export function chroniclesDiscardAndExit({
  runId,
  checkpointQueue,
  hasCheckpoint,
  deleteRun,
  forgetRun,
  exit,
  onCleanupError = () => {},
}) {
  // Capture the old run ID before exit clears the active-run ref. Checkpoint
  // writes already queued must settle before deciding whether deletion is safe.
  const settledCheckpoint = Promise.resolve(checkpointQueue).catch(() => undefined);
  exit();
  return settledCheckpoint.then(async () => {
    if (!runId || hasCheckpoint()) return;
    try {
      await deleteRun(runId);
    } catch (error) {
      // 404 means this run is already absent on the authoritative server.
      if (error?.status !== 404) {
        onCleanupError(error);
        return;
      }
    }
    try {
      forgetRun(runId);
    } catch (error) {
      onCleanupError(error);
    }
  });
}
