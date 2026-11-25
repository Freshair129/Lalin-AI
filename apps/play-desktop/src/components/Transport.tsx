// @req FR-22.2 — Localized full playback controls, state and accessibility labels
import { usePlaybackStore } from "../playback/usePlaybackStore";
import { useI18n, localizeError } from "../i18n";
import { useDeckTransportView, useYoutubeDecks } from "../youtubeDecks";

export function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

function FadeIcon() {
  // Two overlapping ramps: one track fading out while the next fades in.
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M2 4.5 L9.5 13.5 H2 Z" fill="currentColor" opacity="0.45" />
      <path d="M16 4.5 L8.5 13.5 H16 Z" fill="currentColor" />
    </svg>
  );
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
  const transition = store.transitionSettings;
  const crossfadeOn = transition.mode !== "off";
  // CR-011: while the YouTube decks own playback, the bar shows and drives the active deck.
  const deck = useDeckTransportView();
  const decks = useYoutubeDecks.getState;
  const title = deck ? deck.title : now.item?.title || t("transport.emptyTitle");
  const subtitle = deck ? deck.subtitle : now.item?.artist || t("transport.emptySubtitle");
  const playing = deck ? deck.playing : now.state === "playing";
  const position = deck ? deck.time : now.currentTime;
  const length = deck ? deck.duration : now.duration;
  return (
    <footer className="transport" aria-label={t("transport.label")}>
      <div className="track-summary">
        <span className="cover" aria-hidden="true">
          ♪
        </span>
        <div>
          <strong>{title}</strong>
          <small>{subtitle}</small>
        </div>
        <span className="play-state" data-testid="play-state">
          {t(`transport.state.${deck ? (deck.playing ? "playing" : "paused") : now.state}` as "transport.state.idle" | "transport.state.playing" | "transport.state.paused" | "transport.state.loading" | "transport.state.error")}
        </span>
      </div>
      <div className="seek-row">
        <time data-testid="position">{formatTime(position)}</time>
        <input
          aria-label={t("transport.position")}
          type="range"
          min="0"
          max={Number.isFinite(length) ? length : 0}
          step="0.1"
          value={position}
          onChange={(e) => (deck ? void decks().seek(Number(e.target.value)) : store.seek(Number(e.target.value)))}
        />
        <time>{formatTime(length)}</time>
      </div>
      <div className="transport-buttons">
        <button
          aria-label={t("transport.shuffle")}
          aria-pressed={queue.shuffle}
          disabled={Boolean(deck)}
          onClick={store.toggleShuffle}
        >
          ⇄
        </button>
        <button
          aria-label={t("transport.previous")}
          onClick={() => action(deck ? decks().previous() : store.previous())}
        >
          ⏮
        </button>
        <button
          className="play-button"
          aria-label={playing ? t("transport.pause") : t("transport.play")}
          onClick={() => action(deck ? decks().togglePlay() : store.togglePlay())}
        >
          {playing ? "Ⅱ" : "▶"}
        </button>
        <button aria-label={t("transport.next")} onClick={() => action(deck ? decks().next() : store.next())}>
          ⏭
        </button>
        <button aria-label={t("transport.stop")} onClick={() => (deck ? void decks().stop() : store.stop())}>
          ■
        </button>
        <button
          aria-label={t("transport.repeat")}
          aria-pressed={queue.repeatMode !== "off"}
          disabled={Boolean(deck)}
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
        <div className="transport-side">
          <div className="fade-control">
            <button
              className="fade-toggle"
              aria-label={t("transport.crossfade")}
              title={t("transport.crossfade")}
              aria-pressed={crossfadeOn}
              onClick={() =>
                store.setTransitionSettings({
                  ...transition,
                  // Turning it on picks the plain crossfade; Manual/Medley/Smart stay in Settings.
                  mode: crossfadeOn ? "off" : "smooth",
                })
              }
            >
              <FadeIcon />
            </button>
            {crossfadeOn && transition.mode !== "manual" ? (
              <label className="fade-duration">
                <input
                  aria-label={t("transport.crossfadeLength")}
                  type="range"
                  min={2}
                  max={12}
                  step={1}
                  value={transition.durationSeconds}
                  onChange={(e) =>
                    store.setTransitionSettings({ ...transition, durationSeconds: Number(e.target.value) })
                  }
                />
                <output>{transition.durationSeconds}s</output>
              </label>
            ) : null}
          </div>
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
