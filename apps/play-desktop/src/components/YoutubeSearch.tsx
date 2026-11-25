// CR-011 (personal builds only): search YouTube from Play and send results to a deck or its queue.
import { useEffect, useState } from "react";
import { useI18n } from "../i18n";
import { deckName, itemFromSearch, useYoutubeDecks, type SearchResult } from "../youtubeDecks";

export function YoutubeSearch({ onSave }: { onSave: (result: SearchResult) => void }) {
  const { t } = useI18n();
  const available = useYoutubeDecks((state) => state.available);
  const search = useYoutubeDecks((state) => state.search);
  const { searchYoutube, playNow, enqueue } = useYoutubeDecks.getState();
  const [text, setText] = useState(search.query);

  // A search started from the top search field shows up here too.
  useEffect(() => setText(search.query), [search.query]);

  if (!available) return null;

  return (
    <section className="youtube-search" aria-label={t("decks.searchTitle")}>
      <form
        className="youtube-search-form"
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          void searchYoutube(text);
        }}
      >
        <input
          type="search"
          maxLength={200}
          aria-label={t("decks.searchPlaceholder")}
          placeholder={t("decks.searchPlaceholder")}
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
        <button className="primary" disabled={!text.trim() || search.busy}>
          {search.busy ? t("decks.searching") : t("decks.searchButton")}
        </button>
      </form>
      {search.error ? (
        <p className="youtube-decks-note warning" role="alert">
          {t("decks.searchFailed")} ({search.error})
        </p>
      ) : null}
      {!search.busy && !search.error && search.query && !search.results.length ? (
        <p className="empty">{t("decks.searchEmpty")}</p>
      ) : null}
      {search.results.length ? (
        <ul className="youtube-search-results" aria-label={t("decks.searchResults")}>
          {search.results.map((result) => (
            <li key={result.videoId} className="youtube-row">
              <span className="youtube-search-text">
                <strong>{result.title}</strong>
                <small>
                  {[result.channel, result.duration].filter(Boolean).join(" · ")}
                </small>
              </span>
              {[0, 1].map((deck) => (
                <button
                  key={`play-${deck}`}
                  type="button"
                  aria-label={`${t("decks.playOn")} ${deckName(deck)} ${result.title}`}
                  onClick={() => void playNow(deck, itemFromSearch(result))}
                >
                  ▶ {deckName(deck)}
                </button>
              ))}
              {[0, 1].map((deck) => (
                <button
                  key={`queue-${deck}`}
                  type="button"
                  aria-label={`${t("decks.queueTo")} ${deckName(deck)} ${result.title}`}
                  onClick={() => enqueue(deck, itemFromSearch(result))}
                >
                  + {t("decks.queue")} {deckName(deck)}
                </button>
              ))}
              <button type="button" aria-label={`${t("decks.saveLink")} ${result.title}`} onClick={() => onSave(result)}>
                {t("decks.saveLink")}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
