import { useEffect, useRef, useState, type PointerEvent } from "react";
import { usePlaybackStore } from "../playback/usePlaybackStore";
import { FramePreview, type PreviewFrame } from "../playback/framePreview";
import { isVideoItem, resolveMedia } from "../native";
import { formatTime } from "./Transport";
import { PlaybackAudioEngine } from "../playback/audioEngine";
import { relativeSeekTarget } from "../playback/relativeSeek";

export function CompactTransport({
  onFull,
  switching,
  onOpen,
  report,
  fullscreen,
  onFullscreen,
}: {
  onFull: () => void;
  switching: boolean;
  onOpen: () => void;
  report: (error: unknown) => void;
  fullscreen: boolean;
  onFullscreen: () => void;
}) {
  const now = usePlaybackStore((state) => state.nowPlaying);
  const video = isVideoItem(now.item);
  const footer = useRef<HTMLElement>(null);
  const dragging = useRef<number | null>(null);
  const preview = useRef<FramePreview | null>(null);
  const latestTime = useRef<number | null>(null);
  const [draft, setDraft] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [frame, setFrame] = useState<PreviewFrame | null>(null);
  const [hidden, setHidden] = useState(false);
  const duration =
    Number.isFinite(now.duration) && now.duration > 0 ? now.duration : 0;
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
  const position = draft ?? now.currentTime;
  const skipDisabled =
    !now.item ||
    !duration ||
    draft !== null ||
    now.state === "loading" ||
    now.state === "error";
  const skip = (delta: number) => {
    if (skipDisabled || dragging.current !== null) return;
    const media = PlaybackAudioEngine.getInstance().getMediaElement();
    if (!media) return;
    const target = relativeSeekTarget(media, delta);
    if (target !== null) usePlaybackStore.getState().seek(target);
  };

  return (
    <footer
      ref={footer}
      className={`compact-transport ${video ? "overlay" : "audio-compact"} ${hidden ? "controls-hidden" : ""}`}
      aria-label="ควบคุมการเล่นแบบกระชับ"
    >
      {!video ? (
        <div className="compact-artwork">
          <span aria-hidden="true">♫</span>
          <strong>{now.item?.title || "เปิดไฟล์เพื่อเริ่มเล่น"}</strong>
          {!now.item ? <button onClick={onOpen}>เปิดไฟล์</button> : null}
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
                alt={`ภาพตัวอย่างที่ ${formatTime(target)}`}
              />
            ) : (
              <span>
                {frame?.failed ? "ภาพตัวอย่างไม่พร้อม" : "กำลังอ่านเฟรม…"}
              </span>
            )}
            <time>{formatTime(target)}</time>
          </div>
        ) : null}
        <input
          aria-label="ตำแหน่งเล่น"
          type="range"
          min="0"
          max={duration}
          step="0.1"
          disabled={!duration || !now.item}
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
            usePlaybackStore.getState().seek(pointTime(event));
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
            usePlaybackStore.getState().seek(time);
            setHover(time);
          }}
        />
      </div>
      <div className="compact-controls">
        <button
          className="skip-ten"
          aria-label="ย้อน 10 วินาที"
          title="ย้อน 10 วินาที"
          disabled={skipDisabled}
          onClick={() => skip(-10)}
        >
          ↶<small>10</small>
        </button>
        <button
          className="compact-play"
          aria-label={now.state === "playing" ? "หยุดชั่วคราว" : "เล่น"}
          onClick={() =>
            void usePlaybackStore.getState().togglePlay().catch(report)
          }
        >
          {now.state === "playing" ? "Ⅱ" : "▶"}
        </button>
        <button
          className="skip-ten"
          aria-label="ข้าม 10 วินาที"
          title="ข้าม 10 วินาที"
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
            aria-label={now.muted ? "เปิดเสียง" : "ปิดเสียง"}
            onClick={() => usePlaybackStore.getState().toggleMute()}
          >
            {now.muted ? "🔇" : "🔊"}
          </button>
          <input
            aria-label="ระดับเสียง"
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
          aria-label={fullscreen ? "ออกจากเต็มจอ" : "เต็มจอ"}
          title={fullscreen ? "ออกจากเต็มจอ (Esc)" : "เต็มจอ"}
          aria-pressed={fullscreen}
          disabled={switching}
          onClick={onFullscreen}
        >
          ⛶
        </button>
        <button
          aria-label="กลับ Full"
          title="กลับ Full"
          disabled={switching}
          onClick={onFull}
        >
          ↗
        </button>
      </div>
      {now.error ? (
        <p className="error" role="alert">
          {now.error}
        </p>
      ) : null}
    </footer>
  );
}
