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
import { usePlaybackStore } from "./playback/usePlaybackStore";

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
        `Prepare failed and recovery is still pending; restart Lalin Play: ${String(prepareError)}; ${String(recoveryError)}`,
      );
    }
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
  try {
    usePlaybackStore.getState().stop();
    localStorage.setItem(PLAY_QUEUE_KEY, JSON.stringify(nextQueue));
    localStorage.setItem(PLAY_EQ_KEY, JSON.stringify(nextEq));
    localStorage.setItem(PLAY_RESUME_KEY, "true");
    await invoke("apply_play_migration", { transactionId });
    usePlaybackStore.getState().replaceFromMigration(nextQueue, nextEq);
    await invoke("commit_play_migration", { transactionId });
    committed = true;
  } catch (error) {
    if (!committed) {
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
