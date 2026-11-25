// @req FR-22.1, FR-22.2 — Compact inherits locale and localizes transport/accessibility labels
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { usePlaybackStore } from "../playback/usePlaybackStore";
import { FramePreview, type PreviewFrame } from "../playback/framePreview";
import { isVideoItem, resolveMedia } from "../native";
import { formatTime } from "./Transport";
import { PlaybackAudioEngine } from "../playback/audioEngine";
import { relativeSeekTarget } from "../playback/relativeSeek";
import { useI18n, localizeError } from "../i18n";
import { useDeckTransportView, useYoutubeDecks } from "../youtubeDecks";

export function CompactTransport({
  onFull,
  switching,
  onOpen,
  relinkHint = false,
  report,
  fullscreen,
  onFullscreen,
}: {
  onFull: () => void;
  switching: boolean;
  onOpen: () => void;
  relinkHint?: boolean;
  report: (error: unknown) => void;
  fullscreen: boolean;
  onFullscreen: () => void;
}) {
  const now = usePlaybackStore((state) => state.nowPlaying);
  // CR-011: the YouTube decks own playback, so play/pause and seek go to the active deck.
  const deck = useDeckTransportView();
  const { t, locale } = useI18n();
  const video = isVideoItem(now.item);
  const footer = useRef<HTMLElement>(null);
  const dragging = useRef<number | null>(null);
  const preview = useRef<FramePreview | null>(null);
  const latestTime = useRef<number | null>(null);
  const [draft, setDraft] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [frame, setFrame] = useState<PreviewFrame | null>(null);
  const [hidden, setHidden] = useState(false);
  const rawDuration = deck ? deck.duration : now.duration;
  const duration =
    Number.isFinite(rawDuration) && rawDuration > 0 ? rawDuration : 0;
  const seekTo = (time: number) =>
    deck ? void useYoutubeDecks.getState().seek(time) : usePlaybackStore.getState().seek(time);
  const target = draft ?? hover;

  useEffect(() => {
    if (!video || !now.item) return;
    let disposed = false;
    let decoder: FramePreview | null = null;
    void resolveMedia(now.item)
      .then((source) => {
        if (disposed) return;
        decoder = new FramePreview(source, setFrame);
        preview.current = decoder;
        if (latestTime.current !== null) decoder.request(latestTime.current);
      })
      .catch(() => {
        if (!disposed)
          setFrame({
            time: latestTime.current ?? 0,
            image: null,
            failed: true,
          });
      });
    return () => {
      disposed = true;
      decoder?.dispose();
      preview.current = null;
    };
  }, [now.item, video]);

  useEffect(() => {
    latestTime.current = target;
    if (target !== null) preview.current?.request(target);
    else preview.current?.cancel();
  }, [target]);

  useEffect(() => {
    const controls = footer.current;
    const root = controls?.closest(".app");
    if (!root || !controls) return;
    let timer: ReturnType<typeof setTimeout>;
    const wake = () => {
      setHidden(false);
      clearTimeout(timer);
      if (video && now.state === "playing" && !now.error) {
        timer = setTimeout(() => {
          if (
            dragging.current === null &&
            !controls.contains(document.activeElement)
          ) {
            setHidden(true);
            setHover(null);
          }
        }, 2500);
      }
    };
    wake();
    root.addEventListener("pointermove", wake);
    root.addEventListener("pointerdown", wake);
    root.addEventListener("pointerup", wake);
    controls.addEventListener("focusin", wake);
    controls.addEventListener("focusout", wake);
    return () => {
      clearTimeout(timer);
      root.removeEventListener("pointermove", wake);
      root.removeEventListener("pointerdown", wake);
      root.removeEventListener("pointerup", wake);
      controls.removeEventListener("focusin", wake);
      controls.removeEventListener("focusout", wake);
    };
  }, [video, now.state, now.error]);

  const pointTime = (event: PointerEvent<HTMLInputElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return (
      Math.max(
        0,
        Math.min(1, (event.clientX - bounds.left) / Math.max(1, bounds.width)),
      ) * duration
    );
  };
  const cancel = () => {
    dragging.current = null;
    setDraft(null);
    setHover(null);
  };
  const shownFrame =
    target !== null && frame?.time === Math.floor(target * 10) / 10
      ? frame
      : null;
  const position = draft ?? (deck ? deck.time : now.currentTime);
  const skipDisabled =
    (!now.item && !deck) ||
    !duration ||
    draft !== null ||
    now.state === "loading" ||
    now.state === "error";
  const skip = (delta: number) => {
    if (skipDisabled || dragging.current !== null) return;
    if (deck) {
      seekTo(Math.max(0, Math.min(duration, deck.time + delta)));
      return;
    }
    const media = PlaybackAudioEngine.getInstance().getActiveMediaElement();
    if (!media) return;
    const target = relativeSeekTarget(media, delta);
    if (target !== null) usePlaybackStore.getState().seek(target);
  };

  return (
    <footer
      ref={footer}
      className={`compact-transport ${video ? "overlay" : "audio-compact"} ${hidden ? "controls-hidden" : ""}`}
      aria-label={t("compact.label")}
    >
      {!video ? (
        <div className="compact-artwork">
          <span aria-hidden="true">♫</span>
          <strong>{deck ? deck.title : now.item?.title || t("compact.openFile")}</strong>
          {!now.item && !deck ? <button onClick={onOpen}>{t("compact.openButton")}</button> : null}
        </div>
      ) : null}
      <div className="compact-seek">
        {video && target !== null && duration > 0 ? (
          <div
            className="frame-tooltip"
            role="status"
            style={{
              left: `clamp(96px, ${(target / duration) * 100}%, calc(100% - 96px))`,
            }}
          >
            {shownFrame?.image ? (
              <img
                src={shownFrame.image}
            alt={t("compact.previewAt", { time: formatTime(target) })}
              />
            ) : (
              <span>
                {frame?.failed ? t("compact.previewUnavailable") : t("compact.readingFrame")}
              </span>
            )}
            <time>{formatTime(target)}</time>
          </div>
        ) : null}
        <input
          aria-label={t("transport.position")}
          type="range"
          min="0"
          max={duration}
          step="0.1"
          disabled={!duration || (!now.item && !deck)}
          value={Math.min(duration, position)}
          aria-valuetext={`${formatTime(position)} / ${formatTime(duration)}`}
          onPointerDown={(event) => {
            if (event.button !== 0 || !duration) return;
            event.preventDefault();
            event.currentTarget.focus();
            event.currentTarget.setPointerCapture(event.pointerId);
            dragging.current = event.pointerId;
            setDraft(pointTime(event));
          }}
          onPointerMove={(event) => {
            if (!duration) return;
            if (dragging.current === event.pointerId)
              setDraft(pointTime(event));
            else if (dragging.current === null) setHover(pointTime(event));
          }}
          onPointerLeave={() => {
            if (dragging.current === null) setHover(null);
          }}
          onPointerUp={(event) => {
            if (dragging.current !== event.pointerId) return;
            seekTo(pointTime(event));
            cancel();
            event.currentTarget.releasePointerCapture(event.pointerId);
          }}
          onPointerCancel={cancel}
          onLostPointerCapture={cancel}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              if (dragging.current !== null) {
                event.preventDefault();
                event.stopPropagation();
              }
              cancel();
              event.currentTarget.blur();
            }
          }}
          onBlur={() => {
            if (dragging.current === null) setHover(null);
          }}
          onChange={(event) => {
            if (dragging.current !== null) return;
            const time = Number(event.target.value);
            seekTo(time);
            setHover(time);
          }}
        />
      </div>
      <div className="compact-controls">
        <button
          className="skip-ten"
          aria-label={t("compact.backTen")}
          title={t("compact.backTen")}
          disabled={skipDisabled}
          onClick={() => skip(-10)}
        >
          ↶<small>10</small>
        </button>
        <button
          className="compact-play"
          aria-label={(deck ? deck.playing : now.state === "playing") ? t("transport.pause") : t("transport.play")}
          onClick={() =>
            void (deck ? useYoutubeDecks.getState().togglePlay() : usePlaybackStore.getState().togglePlay()).catch(report)
          }
        >
          {(deck ? deck.playing : now.state === "playing") ? "Ⅱ" : "▶"}
        </button>
        <button
          className="skip-ten"
          aria-label={t("compact.forwardTen")}
          title={t("compact.forwardTen")}
          disabled={skipDisabled}
          onClick={() => skip(10)}
        >
          ↷<small>10</small>
        </button>
        <time data-testid="position">
          {formatTime(position)} / {formatTime(duration)}
        </time>
        <div className="compact-volume">
          <button
            aria-label={now.muted ? t("transport.unmute") : t("transport.mute")}
            onClick={() => usePlaybackStore.getState().toggleMute()}
          >
            {now.muted ? "🔇" : "🔊"}
          </button>
          <input
            aria-label={t("transport.volume")}
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={now.muted ? 0 : now.volume}
            onChange={(event) =>
              usePlaybackStore.getState().setVolume(Number(event.target.value))
            }
          />
        </div>
        <button
          aria-label={fullscreen ? t("compact.exitFullscreen") : t("compact.fullscreen")}
          title={fullscreen ? `${t("compact.exitFullscreen")} (Esc)` : t("compact.fullscreen")}
          aria-pressed={fullscreen}
          disabled={switching}
          onClick={onFullscreen}
        >
          ⛶
        </button>
        <button
          aria-label={t("compact.backFull")}
          title={t("compact.backFull")}
          disabled={switching}
          onClick={onFull}
        >
          ↗
        </button>
      </div>
      {now.error ? (
        <p className="error" role="alert">
          {localizeError(now.error, locale)}
          {relinkHint ? <small>{t("relink.compactHint")}</small> : null}
        </p>
      ) : null}
    </footer>
  );
}
