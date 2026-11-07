// @req FR-20.1, FR-20.2, FR-20.3, FR-20.5 — Real Play-owned MEDIA and MASTER channels
// @req FR-21.2, FR-21.4 — Labeled simulated surround modes and fallback notice
import { useEffect, useState } from "react";
import { usePlaybackStore } from "../playback/usePlaybackStore";
import type { SpatialMode } from "../contracts";
import { useI18n } from "../i18n";

const speakers = [
  ["mixer.frontLeft", "front-left"],
  ["mixer.frontCenter", "front-center"],
  ["mixer.frontRight", "front-right"],
  ["mixer.sideLeft", "side-left"],
  ["mixer.sideRight", "side-right"],
  ["mixer.rearLeft", "rear-left"],
  ["mixer.rearRight", "rear-right"],
  ["mixer.lfe", "lfe"],
] as const;

export function PlaybackMixerPanel({
  onOpenEQ,
  report,
}: {
  onOpenEQ: () => void;
  report: (error: unknown) => void;
}) {
  const { t } = useI18n();
  const now = usePlaybackStore((state) => state.nowPlaying);
  const mixer = usePlaybackStore((state) => state.mixer);
  const notice = usePlaybackStore((state) => state.spatialNotice);
  const devices = usePlaybackStore((state) => state.availableOutputDevices);
  const refreshOutputDevices = usePlaybackStore((state) => state.refreshOutputDevices);
  const [outputError, setOutputError] = useState(false);

  useEffect(() => {
    void refreshOutputDevices().catch(report);
  }, [refreshOutputDevices, report]);

  const selectMode = (mode: SpatialMode) => {
    usePlaybackStore.getState().setSpatialMode(mode);
  };

  return (
    <section className="mixer-panel" aria-label={t("app.mixerTitle")}>
      <div className="mixer-channel-grid">
        <article className="mixer-channel" aria-labelledby="mixer-media-title">
          <header className="mixer-channel-heading">
            <div>
              <span className="mixer-channel-kicker">{t("mixer.media")}</span>
              <h2 id="mixer-media-title">{now.item?.title || t("mixer.noMedia")}</h2>
              <p>{now.item?.artist || t("mixer.mediaDescription")}</p>
            </div>
            <button type="button" className="mixer-eq-link" onClick={onOpenEQ}>
              {t("mixer.openEq")}
            </button>
          </header>
          <div className="mixer-fader-row">
            <button
              type="button"
              className={`mixer-mute ${mixer.mediaMuted ? "active" : ""}`}
              aria-pressed={mixer.mediaMuted}
              aria-label={t(mixer.mediaMuted ? "mixer.mediaUnmute" : "mixer.mediaMute")}
              onClick={() => usePlaybackStore.getState().toggleMediaMute()}
            >
              {t(mixer.mediaMuted ? "mixer.muted" : "mixer.mute")}
            </button>
            <div className="mixer-fader-control">
              <div className="mixer-level-label">
                <span>{t("mixer.channelLevel")}</span>
                <strong>{Math.round(mixer.mediaGain * 100)}%</strong>
              </div>
              <input
                type="range"
                min="0"
                max="1.5"
                step="0.01"
                value={mixer.mediaGain}
                aria-label={t("mixer.channelLevel")}
                onChange={(event) => usePlaybackStore.getState().setMediaGain(Number(event.target.value))}
              />
            </div>
          </div>
        </article>

        <article className="mixer-channel mixer-master" aria-labelledby="mixer-master-title">
          <header className="mixer-channel-heading">
            <div>
              <span className="mixer-channel-kicker">{t("mixer.master")}</span>
              <h2 id="mixer-master-title">{t("mixer.masterLevel")}</h2>
              <p>{t("mixer.output")}</p>
            </div>
          </header>
          <div className="mixer-fader-row">
            <button
              type="button"
              className={`mixer-mute ${now.muted ? "active" : ""}`}
              aria-pressed={now.muted}
              aria-label={t(now.muted ? "mixer.masterUnmute" : "mixer.masterMute")}
              onClick={() => usePlaybackStore.getState().toggleMute()}
            >
              {t(now.muted ? "mixer.muted" : "mixer.mute")}
            </button>
            <div className="mixer-fader-control">
              <div className="mixer-level-label">
                <span>{t("mixer.masterLevel")}</span>
                <strong>{Math.round((now.muted ? 0 : now.volume) * 100)}%</strong>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={now.muted ? 0 : now.volume}
                aria-label={t("mixer.masterLevel")}
                onChange={(event) => usePlaybackStore.getState().setVolume(Number(event.target.value))}
              />
            </div>
          </div>
          <div className="mixer-output-row">
            <select
              aria-label={t("mixer.output")}
              value={now.activeOutputDeviceId ?? ""}
              onChange={(event) => {
                setOutputError(false);
                void usePlaybackStore.getState().setOutputDevice(event.target.value)
                  .then((ok) => setOutputError(!ok))
                  .catch(report);
              }}
            >
              {devices.map((device) => (
                <option key={device.deviceId} value={device.deviceId}>
                  {device.deviceId ? device.label : t("app.defaultWindowsOutput")}
                </option>
              ))}
            </select>
            <button type="button" onClick={() => void refreshOutputDevices().catch(report)}>
              {t("mixer.refreshOutput")}
            </button>
          </div>
          {outputError ? <p className="mixer-notice" role="status">{t("app.outputSelectionFailed")}</p> : null}
        </article>
      </div>

      <section className="spatial-card" aria-labelledby="spatial-heading">
        <div className="spatial-copy">
          <span className="mixer-channel-kicker">{t("mixer.headphones")}</span>
          <h2 id="spatial-heading">{t("mixer.spatialHeading")}</h2>
          <p>{t("mixer.spatialHelp")}</p>
          {notice === "fallback-stereo" ? <p className="mixer-notice" role="status">{t("mixer.fallback")}</p> : null}
          <div className="spatial-mode-switch" role="group" aria-label={t("mixer.spatialHeading")}>
            <button type="button" aria-pressed={mixer.spatialMode === "stereo"} onClick={() => selectMode("stereo")}>
              {t("mixer.stereo")}
            </button>
            <button type="button" aria-pressed={mixer.spatialMode === "virtual-7.1"} onClick={() => selectMode("virtual-7.1")}>
              {t("mixer.virtual71")}
            </button>
          </div>
        </div>
        <div className={`spatial-map ${mixer.spatialMode === "virtual-7.1" ? "is-active" : ""}`} role="img" aria-label={t("mixer.virtual71")}>
          <span className="spatial-headphones">{t("mixer.headphones")}</span>
          {speakers.map(([key, position]) => (
            <span key={position} className={`spatial-speaker ${position}`} title={t(key)} aria-hidden="true">
              {position === "lfe" ? "LFE" : "•"}
            </span>
          ))}
        </div>
      </section>
    </section>
  );
}
