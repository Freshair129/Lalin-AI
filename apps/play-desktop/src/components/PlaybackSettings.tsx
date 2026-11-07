// @req FR-22.2 — Localized playback settings and output-device errors
// @req PLAY-25 — Persisted Smooth crossfade controls
import { useEffect, useState } from "react";
import { usePlaybackStore } from "../playback/usePlaybackStore";
import { useI18n, localizeError } from "../i18n";
import { check, type Update } from "@tauri-apps/plugin-updater";

export function PlaybackSettings({ report }: { report: (error: unknown) => void }) {
  const { t, locale } = useI18n();
  const devices = usePlaybackStore(state => state.availableOutputDevices);
  const output = usePlaybackStore(state => state.nowPlaying.activeOutputDeviceId);
  const rate = usePlaybackStore(state => state.nowPlaying.playbackRate);
  const nowPlaying = usePlaybackStore(state => state.nowPlaying);
  const queue = usePlaybackStore(state => state.queue);
  const transition = usePlaybackStore(state => state.transitionSettings);
  const isTransitioning = usePlaybackStore(state => state.isTransitioning);
  const crossfader = usePlaybackStore(state => state.crossfader);
  const transitionTargetId = usePlaybackStore(state => state.transitionTargetQueueEntryId);
  const [manualTargetEntryId, setManualTargetEntryId] = useState("");
  const [availableUpdate, setAvailableUpdate] = useState<Update | null>(null);
  const [updaterBusy, setUpdaterBusy] = useState(false);
  const [updaterStatus, setUpdaterStatus] = useState("");
  useEffect(() => { void usePlaybackStore.getState().refreshOutputDevices().catch(report); }, [report]);
  useEffect(() => () => { void availableUpdate?.close(); }, [availableUpdate]);
  const currentIndex = queue.currentIndex;
  const currentItem = queue.items[currentIndex];
  const nextSequentialIndex = currentIndex + 1 < queue.items.length
    ? currentIndex + 1
    : queue.repeatMode === "all" && queue.items.length > 1 ? 0 : -1;
  const retainedTargetIndex = transitionTargetId
    ? queue.items.findIndex(item => item.queueEntryId === transitionTargetId)
    : -1;
  const selectedManualIndex = queue.items.findIndex(item => item.queueEntryId === manualTargetEntryId);
  const manualTarget = selectedManualIndex >= 0 && selectedManualIndex !== currentIndex
    ? selectedManualIndex
    : retainedTargetIndex >= 0 ? retainedTargetIndex : nextSequentialIndex;
  const incomingIndex = retainedTargetIndex >= 0
    ? retainedTargetIndex
    : transition.mode === "manual" ? manualTarget : queue.shuffle ? -1 : nextSequentialIndex;
  const incomingItem = queue.items[incomingIndex];
  const availableDeckItems = queue.items.map((item, index) => ({ item, index })).filter(entry => entry.index !== currentIndex);
  const checkForUpdates = async () => {
    setUpdaterBusy(true);
    setUpdaterStatus(t("updater.checking"));
    try {
      const update = await check();
      setAvailableUpdate(update);
      setUpdaterStatus(update
        ? t("updater.available", { version: update.version })
        : t("updater.upToDate"));
    } catch (error) {
      setUpdaterStatus(t("updater.checkFailed"));
      report(error);
    } finally {
      setUpdaterBusy(false);
    }
  };
  const installUpdate = async () => {
    if (!availableUpdate || !window.confirm(t("updater.confirmInstall", { version: availableUpdate.version }))) return;
    setUpdaterBusy(true);
    setUpdaterStatus(t("updater.downloading"));
    try {
      await availableUpdate.download();
      setUpdaterStatus(t("updater.installing"));
      await availableUpdate.install();
    } catch (error) {
      setUpdaterStatus(t("updater.installFailed"));
      report(error);
    } finally {
      setAvailableUpdate(null);
      setUpdaterBusy(false);
    }
  };
  return <>
    <label>{t("app.playingRate")} <select value={rate} onChange={event => usePlaybackStore.getState().setPlaybackRate(Number(event.target.value))}>{[.5,.75,1,1.25,1.5,2].map(value => <option key={value} value={value}>{value}×</option>)}</select></label>
    <label>{t("transition.mode")} <select value={transition.mode} onChange={event => usePlaybackStore.getState().setTransitionSettings({ ...transition, mode: event.target.value as typeof transition.mode })}><option value="off">{t("transition.off")}</option><option value="smooth">{t("transition.smooth")}</option><option value="manual">{t("transition.manual")}</option><option value="medley">{t("transition.medley")}</option></select></label>
    {transition.mode === "smooth" || transition.mode === "medley" ? <>
      <label>{t("transition.duration")} <input type="range" min={2} max={12} step={1} value={transition.durationSeconds} aria-label={t("transition.duration")} onChange={event => usePlaybackStore.getState().setTransitionSettings({ ...transition, durationSeconds: Number(event.target.value) })} /><output>{transition.durationSeconds}s</output></label>
      <p className="settings-help">{t(isTransitioning ? "transition.active" : transition.mode === "medley" ? "transition.medleyHelp" : "transition.help")}</p>
    </> : null}
    {transition.mode === "manual" ? <>
      <p className="settings-help">{t(isTransitioning ? "transition.manualReady" : "transition.manualHelp")}</p>
      <label>{t("transition.chooseDeckB")} <select value={manualTarget >= 0 ? queue.items[manualTarget]?.queueEntryId ?? "" : ""} disabled={isTransitioning} onChange={event => setManualTargetEntryId(event.target.value)}>
        {availableDeckItems.map(({ item, index }) => <option key={item.queueEntryId ?? `${item.id}:${index}`} value={item.queueEntryId ?? ""}>{index + 1}. {item.title}</option>)}
      </select></label>
      <button disabled={!currentItem || !incomingItem || nowPlaying.state !== "playing" || isTransitioning} onClick={() => void usePlaybackStore.getState().prepareNextDeck(manualTarget).catch(report)}>{t("transition.prepareNext")}</button>
      <label>{t("transition.crossfader")} <input type="range" min={0} max={1} step={0.01} value={crossfader} disabled={!isTransitioning || nowPlaying.state !== "playing"} aria-label={t("transition.crossfader")} onChange={event => usePlaybackStore.getState().setCrossfader(Number(event.target.value))} /><output>{Math.round(crossfader * 100)}%</output></label>
    </> : null}
    {transition.mode === "medley" && currentItem ? <fieldset className="transition-cues">
      <legend>{t("transition.medley")}</legend>
      <label>{t("transition.cueOut")} <input type="number" min={0} max={currentItem.duration ?? undefined} step={0.1} value={currentItem.cueOutSeconds ?? currentItem.duration ?? ""} onChange={event => usePlaybackStore.getState().setCuePoints(currentIndex, currentItem.cueInSeconds, event.target.value === "" ? undefined : Number(event.target.value))} /></label>
      {incomingItem ? <label>{t("transition.cueIn")} <input type="number" min={0} max={incomingItem.duration ?? undefined} step={0.1} value={incomingItem.cueInSeconds ?? 0} onChange={event => usePlaybackStore.getState().setCuePoints(manualTarget, event.target.value === "" ? undefined : Number(event.target.value), incomingItem.cueOutSeconds)} /></label> : null}
    </fieldset> : null}
    <label>{t("app.outputDevice")} <select value={output ?? ""} onChange={event => void usePlaybackStore.getState().setOutputDevice(event.target.value).then(ok => { if (!ok) report(localizeError("Could not select this device. Using the default device instead", locale)); }).catch(report)}>{devices.map(device => <option key={device.deviceId} value={device.deviceId}>{device.deviceId ? device.label : t("app.defaultWindowsOutput")}</option>)}</select></label>
    <button onClick={() => void usePlaybackStore.getState().refreshOutputDevices().catch(report)}>{t("app.refreshDevices")}</button>
    <div className="settings-help">
      <button type="button" disabled={updaterBusy} onClick={() => void checkForUpdates()}>{t("updater.check")}</button>
      {availableUpdate ? <button type="button" disabled={updaterBusy} onClick={() => void installUpdate()}>{t("updater.install")}</button> : null}
      {updaterStatus ? <p role="status">{updaterStatus}</p> : null}
      <p>{t("updater.manualOnly")}</p>
    </div>
  </>;
}
