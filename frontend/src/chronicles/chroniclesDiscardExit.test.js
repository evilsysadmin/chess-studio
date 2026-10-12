import { describe, expect, it, vi } from 'vitest';
import { chroniclesDiscardAndExit } from './chroniclesDiscardExit.js';

const config = (overrides = {}) => ({
  runId: 'new-run',
  checkpointQueue: Promise.resolve(),
  hasCheckpoint: () => false,
  deleteRun: vi.fn().mockResolvedValue(undefined),
  forgetRun: vi.fn(),
  exit: vi.fn(),
  onCleanupError: vi.fn(),
  ...overrides,
});

describe('Chronicles · salir sin guardar sin bloquear la UI', () => {
  it('closes immediately even when DELETE has not answered', async () => {
    const neverSettles = new Promise(() => {});
    const args = config({ deleteRun: vi.fn(() => neverSettles) });
    void chroniclesDiscardAndExit(args);
    expect(args.exit).toHaveBeenCalledOnce();
    await Promise.resolve();
    expect(args.deleteRun).toHaveBeenCalledWith('new-run');
    expect(args.forgetRun).not.toHaveBeenCalled();
  });

  it('discards a fresh unsaved run only after server deletion succeeded', async () => {
    const args = config();
    await chroniclesDiscardAndExit(args);
    expect(args.exit).toHaveBeenCalledOnce();
    expect(args.deleteRun).toHaveBeenCalledWith('new-run');
    expect(args.forgetRun).toHaveBeenCalledWith('new-run');
  });

  it('does not delete an existing manual or area checkpoint', async () => {
    const args = config({ hasCheckpoint: () => true });
    await chroniclesDiscardAndExit(args);
    expect(args.exit).toHaveBeenCalledOnce();
    expect(args.deleteRun).not.toHaveBeenCalled();
    expect(args.forgetRun).not.toHaveBeenCalled();
  });

  it('waits for an in-flight area checkpoint before checking durability, not before exiting', async () => {
    let complete;
    let durable = false;
    const pending = new Promise((resolve) => { complete = resolve; });
    const args = config({ checkpointQueue: pending, hasCheckpoint: () => durable });
    const cleanup = chroniclesDiscardAndExit(args);
    expect(args.exit).toHaveBeenCalledOnce();
    expect(args.deleteRun).not.toHaveBeenCalled();
    durable = true;
    complete();
    await cleanup;
    expect(args.deleteRun).not.toHaveBeenCalled();
  });

  it('does not strand player or falsely remove a run on DELETE 503', async () => {
    const failure = Object.assign(new Error('unavailable'), { status: 503 });
    const args = config({ deleteRun: vi.fn().mockRejectedValue(failure) });
    await chroniclesDiscardAndExit(args);
    expect(args.exit).toHaveBeenCalledOnce();
    expect(args.forgetRun).not.toHaveBeenCalled();
    expect(args.onCleanupError).toHaveBeenCalledWith(failure);
  });

  it('treats a missing remote run as already deleted, cleaning local index', async () => {
    const args = config({ deleteRun: vi.fn().mockRejectedValue(Object.assign(new Error('missing'), { status: 404 })) });
    await chroniclesDiscardAndExit(args);
    expect(args.exit).toHaveBeenCalledOnce();
    expect(args.forgetRun).toHaveBeenCalledWith('new-run');
    expect(args.onCleanupError).not.toHaveBeenCalled();
  });

  it('still exits when the queued checkpoint rejected', async () => {
    const args = config({ checkpointQueue: Promise.reject(new Error('save failed')) });
    await chroniclesDiscardAndExit(args);
    expect(args.exit).toHaveBeenCalledOnce();
    expect(args.deleteRun).toHaveBeenCalledWith('new-run');
  });
});
