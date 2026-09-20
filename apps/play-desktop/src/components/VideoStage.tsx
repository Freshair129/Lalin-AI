import { useEffect, useRef, useState } from "react";
import { PlaybackAudioEngine } from "../playback/audioEngine";
import { usePlaybackStore } from "../playback/usePlaybackStore";
import { isVideoItem } from "../native";

export function VideoStage({
  expanded,
  onExpand,
  compact = false,
}: {
  expanded: boolean;
  onExpand: () => void;
  compact?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const item = usePlaybackStore((state) => state.nowPlaying.item);
  const state = usePlaybackStore((store) => store.nowPlaying.state);
  const error = usePlaybackStore((store) => store.nowPlaying.error);
  const [dimensions, setDimensions] = useState("");
  const [ready, setReady] = useState(false);
  const video = isVideoItem(item);

  useEffect(() => {
    const media = PlaybackAudioEngine.getInstance().getMediaElement();
    if (!media || !host.current) return;
    // Host นี้ไม่ remount เมื่อสลับ layout/navigation และไม่กำหนด src ซ้ำกับ owner
    host.current.appendChild(media);
    const reset = () => {
      setReady(false);
      setDimensions("");
    };
    const metadata = () =>
      setDimensions(
        media.videoWidth && media.videoHeight
          ? `${media.videoWidth} × ${media.videoHeight}`
          : "",
      );
    const loaded = () => {
      metadata();
      setReady(true);
    };
    media.addEventListener("loadstart", reset);
    media.addEventListener("loadedmetadata", metadata);
    media.addEventListener("loadeddata", loaded);
    return () => {
      media.removeEventListener("loadstart", reset);
      media.removeEventListener("loadedmetadata", metadata);
      media.removeEventListener("loadeddata", loaded);
      media.remove();
    };
  }, []);

  return (
    <section
      className={`video-stage ${video ? "" : "video-hidden"}`}
      aria-label="วิดีโอ Now Playing"
      aria-hidden={!video}
    >
      <div className="video-heading" hidden={compact}>
        <strong>{item?.title}</strong>
        <small>{dimensions}</small>
        <button onClick={onExpand} aria-pressed={expanded}>
          {expanded ? "ย่อภาพ (Esc)" : "ขยายภาพ"}
        </button>
      </div>
      <div className="video-frame">
        <div
          ref={host}
          className={`video-host ${state === "error" || (!ready && state === "loading") ? "frame-hidden" : ""}`}
        />
        {state === "error" ? (
          <p className="video-status" role="status">
            {error}
          </p>
        ) : state === "loading" ? (
          <p className="video-status" role="status">
            กำลังโหลดวิดีโอ…
          </p>
        ) : null}
      </div>
    </section>
  );
}
