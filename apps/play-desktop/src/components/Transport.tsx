import { usePlaybackStore } from "../playback/usePlaybackStore";

export function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

export function Transport({ report }: { report: (error: unknown) => void }) {
  const store = usePlaybackStore();
  const { nowPlaying: now, queue } = store;
  const action = (promise: Promise<unknown>) => void promise.catch(report);
  return (
    <footer className="transport" aria-label="ควบคุมการเล่น">
      <div className="track-summary">
        <span className="cover" aria-hidden="true">
          ♪
        </span>
        <div>
          <strong>{now.item?.title || "เลือกเพลงที่อยากฟัง"}</strong>
          <small>{now.item?.artist || "ไฟล์ในเครื่องของคุณ"}</small>
        </div>
        <span className="play-state" data-testid="play-state">
          {now.state}
        </span>
      </div>
      <div className="seek-row">
        <time data-testid="position">{formatTime(now.currentTime)}</time>
        <input
          aria-label="ตำแหน่งเล่น"
          type="range"
          min="0"
          max={Number.isFinite(now.duration) ? now.duration : 0}
          step="0.1"
          value={now.currentTime}
          onChange={(e) => store.seek(Number(e.target.value))}
        />
        <time>{formatTime(now.duration)}</time>
      </div>
      <div className="transport-buttons">
        <button
          aria-label="สุ่มเพลง"
          aria-pressed={queue.shuffle}
          onClick={store.toggleShuffle}
        >
          ⇄
        </button>
        <button
          aria-label="เพลงก่อนหน้า"
          onClick={() => action(store.previous())}
        >
          ⏮
        </button>
        <button
          className="play-button"
          aria-label={now.state === "playing" ? "หยุดชั่วคราว" : "เล่น"}
          onClick={() => action(store.togglePlay())}
        >
          {now.state === "playing" ? "Ⅱ" : "▶"}
        </button>
        <button aria-label="เพลงถัดไป" onClick={() => action(store.next())}>
          ⏭
        </button>
        <button aria-label="หยุด" onClick={store.stop}>
          ■
        </button>
        <button
          aria-label="เล่นซ้ำ"
          aria-pressed={queue.repeatMode !== "off"}
          onClick={() =>
            store.setRepeatMode(
              queue.repeatMode === "off"
                ? "all"
                : queue.repeatMode === "all"
                  ? "one"
                  : "off",
            )
          }
        >
          {queue.repeatMode === "one" ? "↻ 1" : "↻"}
        </button>
        <label className="volume">
          <button
            aria-label={now.muted ? "เปิดเสียง" : "ปิดเสียง"}
            onClick={store.toggleMute}
          >
            {now.muted ? "เงียบ" : "เสียง"}
          </button>
          <input
            aria-label="ระดับเสียง"
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={now.muted ? 0 : now.volume}
            onChange={(e) => store.setVolume(Number(e.target.value))}
          />
        </label>
      </div>
      {now.error ? (
        <p role="alert" className="error">
          {now.error}
        </p>
      ) : null}
    </footer>
  );
}
