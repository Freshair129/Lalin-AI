import { invoke } from "@tauri-apps/api/core";
import type { PlaybackEQ, PlaybackQueue } from "./contracts";
import {
  PLAY_EQ_KEY,
  PLAY_QUEUE_KEY,
  PLAY_RESUME_KEY,
  playbackEqFromMigration,
  playbackQueueFromPlan,
  restoreOldStorage,
  type MigrationPreview,
  type MigrationRecovery,
} from "./playMigration";
import {
  loadPersistedEQ,
  loadPersistedQueue,
  usePlaybackStore,
} from "./playback/usePlaybackStore";

export async function importPlayMigration(
  rawJson: string,
  preview: MigrationPreview,
  allowRepeat: boolean,
): Promise<{ cleanupPending: boolean }> {
  const oldQueueRaw = localStorage.getItem(PLAY_QUEUE_KEY);
  const oldEqRaw = localStorage.getItem(PLAY_EQ_KEY);
  const oldResumeRaw = localStorage.getItem(PLAY_RESUME_KEY);
  const initialStore = usePlaybackStore.getState();
  const oldQueue = initialStore.queue;
  const oldEq = initialStore.eq;
  const transactionId = crypto.randomUUID();
  let prepared: MigrationPreview;
  try {
    prepared = await invoke<MigrationPreview>("prepare_play_migration", {
      rawJson,
      transactionId,
      oldQueueRaw,
      oldEqRaw,
      oldResumeRaw,
      allowRepeat,
    });
  } catch (prepareError) {
    await recoverLostPrepare(transactionId, oldQueue, oldEq, prepareError);
    throw prepareError;
  }
  if (prepared.transactionId !== transactionId) {
    throw new Error("Play returned a different migration transaction ID");
  }

  if (!samePreparedPreview(preview, prepared)) {
    try {
      await rollbackAndRestore(transactionId, oldQueue, oldEq);
    } catch (error) {
      throw new Error(`Preview changed and recovery is pending; restart Lalin Play: ${String(error)}`);
    }
    throw new Error("ไฟล์หรือสถานะสื่อเปลี่ยนหลัง preview กรุณาเลือกไฟล์และตรวจ preview อีกครั้ง");
  }

  const nextQueue = playbackQueueFromPlan(prepared.plan);
  const nextEq = playbackEqFromMigration(prepared.eq);
  let committed = false;
  let commitAttempted = false;
  try {
    usePlaybackStore.getState().stop();
    localStorage.setItem(PLAY_QUEUE_KEY, JSON.stringify(nextQueue));
    localStorage.setItem(PLAY_EQ_KEY, JSON.stringify(nextEq));
    localStorage.setItem(PLAY_RESUME_KEY, "true");
    await invoke("apply_play_migration", { transactionId });
    usePlaybackStore.getState().replaceFromMigration(nextQueue, nextEq);
    commitAttempted = true;
    await invoke("commit_play_migration", { transactionId });
    committed = true;
  } catch (error) {
    if (!committed) {
      if (commitAttempted) {
        const recovered = await recoverCommit(transactionId, oldQueue, oldEq, error);
        if (recovered) return acknowledge(transactionId);
      }
      try {
        await rollbackAndRestore(transactionId, oldQueue, oldEq);
      } catch (rollbackError) {
        throw new Error(
          `นำเข้าไม่สำเร็จและ rollback ยังไม่เสร็จ ข้อมูลกู้คืนยังอยู่; ปิดแล้วเปิด Lalin Play เพื่อกู้คืน: ${String(rollbackError)}`,
        );
      }
    }
    throw error;
  }

  return acknowledge(transactionId);
}

export async function undoLastPlayMigration(): Promise<{ cleanupPending: boolean }> {
  const oldQueueRaw = localStorage.getItem(PLAY_QUEUE_KEY);
  const oldEqRaw = localStorage.getItem(PLAY_EQ_KEY);
  const oldResumeRaw = localStorage.getItem(PLAY_RESUME_KEY);
  const initialStore = usePlaybackStore.getState();
  const oldQueue = initialStore.queue;
  const oldEq = initialStore.eq;
  const transactionId = crypto.randomUUID();
  let prepared: MigrationRecovery;
  try {
    prepared = await invoke<MigrationRecovery>("prepare_undo_play_migration", {
      transactionId,
      oldQueueRaw,
      oldEqRaw,
      oldResumeRaw,
    });
  } catch (prepareError) {
    await recoverLostPrepare(transactionId, oldQueue, oldEq, prepareError);
    throw prepareError;
  }
  if (prepared.transactionId !== transactionId || !prepared.restoreRawStorage) {
    try {
      await rollbackAndRestore(transactionId, oldQueue, oldEq);
    } catch (error) {
      throw new Error(`Undo preparation is incomplete; restart Lalin Play: ${String(error)}`);
    }
    throw new Error("Play returned incomplete migration undo state");
  }

  let committed = false;
  let commitAttempted = false;
  try {
    usePlaybackStore.getState().stop();
    applyRawStorage(prepared.newQueueRaw ?? null, prepared.newEqRaw ?? null, prepared.newResumeRaw ?? null);
    const previousQueue = loadQueueIgnoringResumeFlag();
    const previousEq = loadPersistedEQ();
    await invoke("apply_play_migration", { transactionId });
    usePlaybackStore.getState().replaceFromMigration(previousQueue, previousEq);
    commitAttempted = true;
    await invoke("commit_play_migration", { transactionId });
    committed = true;
  } catch (error) {
    if (!committed) {
      if (commitAttempted) {
        const recovered = await recoverCommit(transactionId, oldQueue, oldEq, error);
        if (recovered) return acknowledge(transactionId);
      }
      try {
        await rollbackAndRestore(transactionId, oldQueue, oldEq);
      } catch (rollbackError) {
        throw new Error(
          `Undo did not finish and recovery is pending; restart Lalin Play: ${String(rollbackError)}`,
        );
      }
    }
    throw error;
  }
  return acknowledge(transactionId);
}

function loadQueueIgnoringResumeFlag(): PlaybackQueue {
  const previousResumeRaw = localStorage.getItem(PLAY_RESUME_KEY);
  localStorage.setItem(PLAY_RESUME_KEY, "true");
  const queue = loadPersistedQueue();
  restoreKey(PLAY_RESUME_KEY, previousResumeRaw);
  return queue;
}

function applyRawStorage(queue: string | null, eq: string | null, resume: string | null): void {
  restoreKey(PLAY_QUEUE_KEY, queue);
  restoreKey(PLAY_EQ_KEY, eq);
  restoreKey(PLAY_RESUME_KEY, resume);
}

function restoreKey(key: string, value: string | null): void {
  if (value === null) localStorage.removeItem(key);
  else localStorage.setItem(key, value);
}

async function recoverLostPrepare(
  transactionId: string,
  oldQueue: PlaybackQueue,
  oldEq: PlaybackEQ,
  originalError: unknown,
): Promise<void> {
  try {
    const recovery = await invoke<MigrationRecovery | null>("recover_play_migration");
    if (recovery) {
      if (recovery.transactionId !== transactionId || recovery.committed) {
        throw new Error("an unexpected migration journal was found");
      }
      restoreOldStorage(recovery);
      usePlaybackStore.getState().replaceFromMigration(oldQueue, oldEq);
      await invoke("ack_play_migration", { transactionId });
    }
  } catch (recoveryError) {
    throw new Error(
      `Prepare failed and recovery is still pending; restart Lalin Play: ${String(originalError)}; ${String(recoveryError)}`,
    );
  }
}

async function recoverCommit(
  transactionId: string,
  oldQueue: PlaybackQueue,
  oldEq: PlaybackEQ,
  originalError: unknown,
): Promise<boolean> {
  let recovery: MigrationRecovery | null;
  try {
    recovery = await invoke<MigrationRecovery | null>("recover_play_migration");
  } catch (recoveryError) {
    throw new Error(
      `Commit state is uncertain and the recovery journal was retained; restart Lalin Play: ${String(originalError)}; ${String(recoveryError)}`,
    );
  }
  if (!recovery || recovery.transactionId !== transactionId) {
    throw new Error(`Commit state is uncertain; restart Lalin Play: ${String(originalError)}`);
  }
  if (recovery.committed) {
    applyCommittedRecovery(recovery);
    return true;
  }
  restoreOldStorage(recovery);
  usePlaybackStore.getState().replaceFromMigration(oldQueue, oldEq);
  return false;
}

function applyCommittedRecovery(recovery: MigrationRecovery): void {
  if (recovery.restoreRawStorage) {
    applyRawStorage(
      recovery.newQueueRaw ?? null,
      recovery.newEqRaw ?? null,
      recovery.newResumeRaw ?? null,
    );
    usePlaybackStore.getState().replaceFromMigration(
      loadQueueIgnoringResumeFlag(),
      loadPersistedEQ(),
    );
    return;
  }
  const nextQueue = playbackQueueFromPlan(recovery.plan);
  const nextEq = playbackEqFromMigration(recovery.eq);
  localStorage.setItem(PLAY_QUEUE_KEY, JSON.stringify(nextQueue));
  localStorage.setItem(PLAY_EQ_KEY, JSON.stringify(nextEq));
  localStorage.setItem(PLAY_RESUME_KEY, "true");
  usePlaybackStore.getState().replaceFromMigration(nextQueue, nextEq);
}

async function acknowledge(transactionId: string): Promise<{ cleanupPending: boolean }> {
  try {
    await invoke("ack_play_migration", { transactionId });
    return { cleanupPending: false };
  } catch {
    return { cleanupPending: true };
  }
}

function samePreparedPreview(a: MigrationPreview, b: MigrationPreview): boolean {
  return a.exportId === b.exportId && a.alreadyImported === b.alreadyImported &&
    JSON.stringify({ plan: a.plan, eq: a.eq, unresolved: a.unresolved }) ===
    JSON.stringify({ plan: b.plan, eq: b.eq, unresolved: b.unresolved });
}

async function rollbackAndRestore(
  transactionId: string,
  oldQueue: PlaybackQueue,
  oldEq: PlaybackEQ,
): Promise<void> {
  const recovery = await invoke<MigrationRecovery>("rollback_play_migration", {
    transactionId,
  });
  restoreOldStorage(recovery);
  usePlaybackStore.getState().replaceFromMigration(oldQueue, oldEq);
  await invoke("ack_play_migration", { transactionId });
}
