// CR-009 Scope B: the official embedded YouTube player. Its audio goes straight
// to Windows; Play never routes, captures or processes it.
import { useI18n } from "../i18n";

export function YoutubeEmbedPlayer({ src, title, onClose }: { src: string; title: string; onClose: () => void }) {
  const { t } = useI18n();
  return (
    <div className="youtube-player">
      <div className="youtube-player-frame">
        <iframe
          src={src}
          title={`${t("app.youtubePlayerTitle")}: ${title}`}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
        />
      </div>
      <div className="youtube-player-bar">
        <span>{t("app.youtubeEmbedHelp")}</span>
        <button type="button" onClick={onClose}>{t("app.closePlayer")}</button>
      </div>
    </div>
  );
}
