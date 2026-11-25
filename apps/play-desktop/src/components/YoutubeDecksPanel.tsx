// CR-010/CR-011 (personal builds only): control the two youtube.com decks from Play.
import { useEffect } from "react";
import { useI18n, type TranslationKey } from "../i18n";
import { usePlaybackStore } from "../playback/usePlaybackStore";
import { deckName, formatDeckTime, useYoutubeDecks } from "../youtubeDecks";

export function YoutubeDecksPanel() {
  const { t } = useI18n();
  const { available, snapshot, error, run, queues, extensions, loadExtensions, moveQueued, removeQueued, sendToOther } =
    useYoutubeDecks();
  const fadeSeconds = usePlaybackStore((state) => state.transitionSettings.durationSeconds);

  // Keep the deck fade length in step with Play's crossfade length.
  useEffect(() => {
    if (available && snapshot?.auto && snapshot.fadeSeconds !== fadeSeconds) {
      void run("deck_set_auto", { enabled: true, fadeSeconds });
    }
  }, [available, snapshot?.auto, snapshot?.fadeSeconds, fadeSeconds, run]);

  useEffect(() => {
    if (available && extensions === null) void loadExtensions();
  }, [available, extensions, loadExtensions]);

  if (!available || !snapshot) return null;
  const next = snapshot.active === 0 ? 1 : 0;
  const message = error?.startsWith("decks.") ? t(error as TranslationKey) : error;

  return (
    <section className="youtube-decks" aria-label={t("decks.title")}>
      <div className="youtube-decks-head">
        <strong>{t("decks.title")}</strong>
        <span className="youtube-decks-badge">{t("decks.personal")}</span>
        <button type="button" onClick={() => void run("deck_open")}>
          {t("decks.openWindow")}
        </button>
      </div>
      <div className="youtube-decks-grid">
        {snapshot.decks.map((deck, index) => (
          <div key={index} className={`youtube-deck${snapshot.active === index ? " active" : ""}`}>
            <span className="youtube-deck-name">{deckName(index)}</span>
            <span className="youtube-deck-title">
              {deck.loaded ? deck.title || "…" : t("decks.empty")}
              {deck.cued ? <small className="youtube-deck-cued"> · {t("decks.cued")}</small> : null}
            </span>
            <span className="youtube-deck-time">
              {deck.ad ? t("decks.ad") : `${formatDeckTime(deck.time)} / ${formatDeckTime(deck.duration)}`}
            </span>
            <button
              type="button"
              disabled={!deck.loaded}
              aria-label={`${deck.paused ? t("decks.play") : t("decks.pause")} ${deckName(index)}`}
              onClick={() => void run("deck_play_pause", { deck: index, playing: deck.paused })}
            >
              {deck.paused ? t("decks.play") : t("decks.pause")}
            </button>
            <ol className="youtube-deck-queue" aria-label={`${t("decks.queue")} ${deckName(index)}`}>
              {queues[index].length === 0 ? <li className="empty">{t("decks.queueEmpty")}</li> : null}
              {queues[index].map((item, position) => (
                <li key={item.key}>
                  <span className="youtube-deck-queue-title" title={item.title}>
                    {item.title}
                    {item.duration ? <small> · {item.duration}</small> : null}
                  </span>
                  <button
                    type="button"
                    aria-label={`${t("decks.moveUp")} ${item.title}`}
                    disabled={position === 0}
                    onClick={() => moveQueued(index, item.key, -1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label={`${t("decks.moveDown")} ${item.title}`}
                    disabled={position === queues[index].length - 1}
                    onClick={() => moveQueued(index, item.key, 1)}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    aria-label={`${t("decks.moveToOther")} ${deckName(1 - index)} ${item.title}`}
                    onClick={() => sendToOther(index, item.key)}
                  >
                    → {deckName(1 - index)}
                  </button>
                  <button
                    type="button"
                    aria-label={`${t("decks.remove")} ${item.title}`}
                    onClick={() => removeQueued(index, item.key)}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
      <div className="youtube-decks-mixer">
        <span>A</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          aria-label={t("decks.crossfader")}
          value={snapshot.mix}
          onChange={(event) => void run("deck_set_mix", { mix: Number(event.target.value) })}
        />
        <span>B</span>
        <button
          type="button"
          className="primary"
          disabled={snapshot.fading || !snapshot.decks[next].loaded}
          onClick={() => void run("deck_crossfade", { seconds: fadeSeconds })}
        >
          {snapshot.fading ? t("decks.fading") : `${t("decks.fadeTo")} ${deckName(next)} · ${fadeSeconds}s`}
        </button>
        <label className="youtube-decks-auto">
          <input
            type="checkbox"
            checked={snapshot.auto}
            onChange={(event) => void run("deck_set_auto", { enabled: event.target.checked, fadeSeconds })}
          />
          {t("decks.auto")}
        </label>
      </div>
      <div className="youtube-decks-note">
        <span>{t("decks.extensions")}:</span>{" "}
        {extensions?.length ? (
          <span className="youtube-decks-extensions">
            {extensions.map((extension) => `${extension.name}${extension.version ? ` ${extension.version}` : ""}`).join(", ")}
          </span>
        ) : (
          <span>{t("decks.noExtensions")}</span>
        )}{" "}
        <button type="button" onClick={() => void run("deck_open_extensions_folder")} title={snapshot.extensionsDir}>
          {t("decks.openFolder")}
        </button>
        <button type="button" onClick={() => void loadExtensions()}>
          {t("decks.refresh")}
        </button>
        <small className="youtube-decks-hint">{t("decks.extensionsHelp")} <code>{snapshot.extensionsDir}</code></small>
      </div>
      {message ? <p className="youtube-decks-note warning" role="alert">{message}</p> : null}
    </section>
  );
}
