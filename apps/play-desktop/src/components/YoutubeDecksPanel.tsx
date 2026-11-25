// CR-010 (personal builds only): control the two youtube.com decks from Play.
import { useEffect } from "react";
import { useI18n } from "../i18n";
import { usePlaybackStore } from "../playback/usePlaybackStore";
import { deckName, formatDeckTime, useYoutubeDecks } from "../youtubeDecks";

export function YoutubeDecksPanel() {
  const { t } = useI18n();
  const { available, snapshot, error, run } = useYoutubeDecks();
  const fadeSeconds = usePlaybackStore((state) => state.transitionSettings.durationSeconds);

  // Keep the deck fade length in step with Play's crossfade length.
  useEffect(() => {
    if (available && snapshot?.auto && snapshot.fadeSeconds !== fadeSeconds) {
      void run("deck_set_auto", { enabled: true, fadeSeconds });
    }
  }, [available, snapshot?.auto, snapshot?.fadeSeconds, fadeSeconds, run]);

  if (!available || !snapshot) return null;
  const next = snapshot.active === 0 ? 1 : 0;

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
            <span className="youtube-deck-title">{deck.loaded ? deck.title || "…" : t("decks.empty")}</span>
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
      <p className="youtube-decks-note">
        {t("decks.extensionsHelp")} <code>{snapshot.extensionsDir}</code>{" "}
        <button type="button" onClick={() => void run("deck_open_extensions_folder")}>
          {t("decks.openFolder")}
        </button>
      </p>
      {error ? <p className="youtube-decks-note warning" role="alert">{error}</p> : null}
    </section>
  );
}
