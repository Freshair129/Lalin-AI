// @req FR-22.2 — Localized full playback controls, state and accessibility labels
import { usePlaybackStore } from "../playback/usePlaybackStore";
import { useI18n, localizeError } from "../i18n";

export function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

export function Transport({
  report,
  onRelink,
  relinkTitle,
}: {
  report: (error: unknown) => void;
  onRelink?: () => void;
  relinkTitle?: string;
}) {
  const store = usePlaybackStore();
  const { t, locale } = useI18n();
  const { nowPlaying: now, queue } = store;
  const action = (promise: Promise<unknown>) => void promise.catch(report);
  return (
    <footer className="transport" aria-label={t("transport.label")}>
      <div className="track-summary">
        <span className="cover" aria-hidden="true">
          ♪
        </span>
        <div>
          <strong>{now.item?.title || t("transport.emptyTitle")}</strong>
          <small>{now.item?.artist || t("transport.emptySubtitle")}</small>
        </div>
        <span className="play-state" data-testid="play-state">
          {t(`transport.state.${now.state}` as "transport.state.idle" | "transport.state.playing" | "transport.state.paused" | "transport.state.loading" | "transport.state.error")}
        </span>
      </div>
      <div className="seek-row">
        <time data-testid="position">{formatTime(now.currentTime)}</time>
        <input
          aria-label={t("transport.position")}
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
          aria-label={t("transport.shuffle")}
          aria-pressed={queue.shuffle}
          onClick={store.toggleShuffle}
        >
          ⇄
        </button>
        <button
          aria-label={t("transport.previous")}
          onClick={() => action(store.previous())}
        >
          ⏮
        </button>
        <button
          className="play-button"
          aria-label={now.state === "playing" ? t("transport.pause") : t("transport.play")}
          onClick={() => action(store.togglePlay())}
        >
          {now.state === "playing" ? "Ⅱ" : "▶"}
        </button>
        <button aria-label={t("transport.next")} onClick={() => action(store.next())}>
          ⏭
        </button>
        <button aria-label={t("transport.stop")} onClick={store.stop}>
          ■
        </button>
        <button
          aria-label={t("transport.repeat")}
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
            aria-label={now.muted ? t("transport.unmute") : t("transport.mute")}
            onClick={store.toggleMute}
          >
            {now.muted ? t("transport.unmute") : t("transport.mute")}
          </button>
          <input
            aria-label={t("transport.volume")}
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
          {localizeError(now.error, locale)}
          {onRelink ? (
            <button type="button" title={relinkTitle} onClick={onRelink}>
              {t("relink.button")}
            </button>
          ) : null}
        </p>
      ) : null}
    </footer>
  );
}
