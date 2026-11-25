// CR-009 Scope A: choose whether the EQ runs inside Lalin Play or system-wide
// through a user-installed Equalizer APO.
import { useEffect } from "react";
import { useI18n } from "../i18n";
import { systemEqReady, useSystemEq, type EqOutput } from "../systemEq";
import { useYoutubeDecks } from "../youtubeDecks";

export function SystemEqOutput() {
  const { t } = useI18n();
  const { output, status, busy, error, refresh, selectOutput, removeFromApo } = useSystemEq();

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const options: { value: EqOutput; label: string }[] = [
    { value: "app", label: t("eq.outputApp") },
    { value: "system", label: t("eq.outputSystem") },
  ];
  const missing = status !== null && !status.installed;
  const showMissing = missing || error === "not-installed";
  const systemOn = output === "system" && systemEqReady(status);
  const decksPlaying = useYoutubeDecks((state) => state.available && state.source === "decks");

  return (
    <div className="system-eq">
      <div className="segmented" role="radiogroup" aria-label={t("eq.output")}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={output === option.value}
            disabled={busy}
            onClick={() => {
              if (option.value !== output) void selectOutput(option.value);
            }}
          >
            {option.label}
          </button>
        ))}
      </div>
      {busy ? (
        <p className="system-eq-note" role="status">{t("eq.systemBusy")}</p>
      ) : showMissing ? (
        <p className="system-eq-note">{t("eq.systemMissing")}</p>
      ) : error ? (
        <p className="system-eq-note warning" role="alert">
          {error === "setup-failed" ? t("eq.systemSetupFailed") : error}
        </p>
      ) : systemOn ? (
        <p className="system-eq-note">{t("eq.systemActive")}</p>
      ) : null}
      {decksPlaying && !systemOn ? <p className="system-eq-note">{t("decks.eqHint")}</p> : null}
      {status?.linked && !busy ? (
        <button type="button" className="eq-btn" onClick={() => void removeFromApo()}>
          {t("eq.systemRemove")}
        </button>
      ) : null}
    </div>
  );
}
