// Lalin Intelligence — on-device natural-language queue/playlist builder.
// ไม่เรียก LLM/API ใด ๆ; สมอง AI ภายนอกแสดงเป็น opt-in "เร็ว ๆ นี้" จนกว่าจะผ่าน CR
import { useMemo, useState } from "react";
import { mediaItem, type LocalTrack } from "../native";
import { usePlaybackStore } from "../playback/usePlaybackStore";
import { useI18n } from "../i18n";
import {
  applyIntent,
  libraryInsights,
  parseIntent,
  splitDuration,
  suggestPrompts,
  type IntentChip,
  type PromptSuggestion,
} from "../intelligence";
import { formatTime } from "./Transport";

export function IntelligencePanel({
  tracks,
  initialPrompt = "",
  canSavePlaylist,
  onSavePlaylist,
  onOpenFiles,
  report,
}: {
  tracks: LocalTrack[];
  initialPrompt?: string;
  canSavePlaylist: boolean;
  onSavePlaylist: (name: string, trackIds: string[]) => void;
  onOpenFiles: () => void;
  report: (error: unknown) => void;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState(initialPrompt);
  const [prompt, setPrompt] = useState(initialPrompt);
  const [notice, setNotice] = useState<string | null>(null);
  const intent = useMemo(() => parseIntent(prompt), [prompt]);
  const results = useMemo(
    () => (prompt.trim() ? applyIntent(tracks, intent) : []),
    [tracks, intent, prompt],
  );
  const suggestions = useMemo(() => suggestPrompts(tracks), [tracks]);
  const insights = useMemo(() => libraryInsights(tracks), [tracks]);
  const playTime = splitDuration(insights.seconds);

  const suggestionText = (item: PromptSuggestion) =>
    item.key === "artist"
      ? t("intel.suggestArtist", { artist: item.artist })
      : t(item.key === "video" ? "intel.suggestVideo" : item.key === "short" ? "intel.suggestShort" : "intel.suggestShuffle");
  const chipText = (chip: IntentChip) => {
    switch (chip.type) {
      case "video": return t("intel.chipVideo");
      case "audio": return t("intel.chipAudio");
      case "shuffle": return t("intel.chipShuffle");
      case "max": return t("intel.chipMax", { minutes: chip.minutes });
      case "min": return t("intel.chipMin", { minutes: chip.minutes });
      case "who": return t("intel.chipWho", { value: chip.value });
      case "term": return t("intel.chipTerm", { value: chip.value });
    }
  };

  const ask = (value: string) => {
    setDraft(value);
    setPrompt(value);
    setNotice(null);
  };

  const playAll = () => {
    const store = usePlaybackStore.getState();
    store.clearQueue();
    for (const track of results) store.addToQueue(mediaItem(track));
    void store.playAtIndex(0).catch(report);
    setNotice(t("intel.playing", { count: results.length }));
  };

  const queueAll = () => {
    const store = usePlaybackStore.getState();
    for (const track of results) store.addToQueue(mediaItem(track));
    setNotice(t("intel.queued", { count: results.length }));
  };

  return (
    <section className="intelligence" aria-label={t("intel.nav")}>
      <div className="intel-hero">
        <div className="intel-orb" aria-hidden="true" />
        <span className="intel-badge">
          <Sparkle /> Lalin Intelligence
        </span>
        <h1>{t("intel.title")}</h1>
        <p>{t("intel.body")}</p>
        <form
          className="intel-prompt"
          onSubmit={(event) => {
            event.preventDefault();
            ask(draft);
          }}
        >
          <Sparkle />
          <input
            aria-label={t("intel.promptLabel")}
            placeholder={t("intel.placeholder")}
            value={draft}
            maxLength={200}
            onChange={(event) => setDraft(event.target.value)}
          />
          <button className="primary" disabled={!draft.trim()}>
            {t("intel.submit")}
          </button>
        </form>
        <div className="intel-suggestions" aria-label={t("intel.suggestionsLabel")}>
          {suggestions.map((item) => {
            const text = suggestionText(item);
            return (
              <button key={item.key} type="button" className="chip" onClick={() => ask(text)}>
                {text}
              </button>
            );
          })}
        </div>
      </div>

      {prompt.trim() ? (
        <div className="card intel-result" aria-live="polite">
          <div className="intel-result-head">
            <div>
              <span className="eyebrow">{t("intel.understood")}</span>
              <div className="intel-chips">
                {intent.chips.length ? (
                  intent.chips.map((chip) => (
                    <span className="token" key={chip.key}>
                      {chipText(chip)}
                    </span>
                  ))
                ) : (
                  <span className="token">{t("intel.everything")}</span>
                )}
              </div>
            </div>
            <strong className="intel-count">{t("intel.count", { count: results.length })}</strong>
          </div>
          {results.length ? (
            <>
              <ol className="intel-list">
                {results.slice(0, 8).map((track) => (
                  <li key={track.id}>
                    <span>{track.title}</span>
                    <small>{track.artist || t("app.unspecifiedArtist")}</small>
                    <time>{track.duration == null ? "—" : formatTime(track.duration)}</time>
                  </li>
                ))}
              </ol>
              {results.length > 8 ? (
                <p className="intel-more">{t("intel.more", { count: results.length - 8 })}</p>
              ) : null}
              <div className="intel-actions">
                <button type="button" className="primary" onClick={playAll}>
                  {t("intel.playAll")}
                </button>
                <button type="button" onClick={queueAll}>{t("intel.queueAll")}</button>
                <button
                  type="button"
                  disabled={!canSavePlaylist}
                  onClick={() => {
                    onSavePlaylist(prompt.trim().slice(0, 120), results.map((track) => track.id));
                    setNotice(t("intel.saved"));
                  }}
                >
                  {t("intel.savePlaylist")}
                </button>
              </div>
            </>
          ) : (
            <p className="intel-empty">
              {tracks.length ? t("intel.noMatch") : t("intel.emptyLibrary")}
            </p>
          )}
          {notice ? <p className="intel-notice" role="status">{notice}</p> : null}
        </div>
      ) : null}

      <div className="intel-grid">
        <div className="card">
          <span className="eyebrow">{t("intel.overview")}</span>
          <div className="stat-row">
            <div><strong>{insights.total}</strong><small>{t("intel.items")}</small></div>
            <div><strong>{insights.videos}</strong><small>{t("intel.videos")}</small></div>
            <div>
              <strong>
                {playTime.hours
                  ? t("intel.hours", playTime)
                  : t("intel.minutes", { minutes: playTime.minutes })}
              </strong>
              <small>{t("intel.playTime")}</small>
            </div>
          </div>
          <ul className="intel-tips">
            {insights.untagged ? <li>{t("intel.untagged", { count: insights.untagged })}</li> : null}
            {insights.missing ? <li>{t("intel.missing", { count: insights.missing })}</li> : null}
            {!insights.total ? (
              <li>
                <button type="button" className="link" onClick={onOpenFiles}>{t("intel.addFirst")}</button>
              </li>
            ) : null}
            {insights.total && !insights.untagged && !insights.missing ? <li>{t("intel.tidy")}</li> : null}
          </ul>
        </div>
        <div className="card intel-connect">
          <span className="eyebrow">{t("intel.brain")}</span>
          <div className="intel-engine">
            <span className="engine-dot on" aria-hidden="true" />
            <div>
              <strong>{t("intel.onDevice")}</strong>
              <small>{t("intel.onDeviceStatus")}</small>
            </div>
          </div>
          <div className="intel-engine">
            <span className="engine-dot" aria-hidden="true" />
            <div>
              <strong>{t("intel.studio")}</strong>
              <small>{t("intel.studioStatus")}</small>
            </div>
            <span className="soon">{t("intel.soon")}</span>
          </div>
          <p className="fine-print">{t("intel.optIn")}</p>
        </div>
      </div>
    </section>
  );
}

export function Sparkle() {
  return (
    <svg className="sparkle" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 1.5c.4 4.2 1.7 7.1 3.5 8.9 1.8 1.8 4.7 3.1 8.9 3.5-4.2.4-7.1 1.7-8.9 3.5-1.8 1.8-3.1 4.7-3.5 8.9-.4-4.2-1.7-7.1-3.5-8.9C6.7 15.6 3.8 14.3-.4 13.9c4.2-.4 7.1-1.7 8.9-3.5C10.3 8.6 11.6 5.7 12 1.5Z"
        transform="scale(.88) translate(1.6 0)"
      />
    </svg>
  );
}
