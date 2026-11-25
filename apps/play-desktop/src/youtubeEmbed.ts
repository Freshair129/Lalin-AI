// CR-009 Scope B: turn a saved official YouTube link into the official embed URL.
// Anything that does not parse to a well-formed video/playlist ID returns null,
// and the UI falls back to "Open on YouTube".

const EMBED_ORIGIN = "https://www.youtube-nocookie.com";
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const LIST_ID = /^[A-Za-z0-9_-]{2,64}$/;
const HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
  "www.youtu.be",
]);

export interface YoutubeEmbedTarget {
  videoId: string | null;
  listId: string | null;
}

export function parseYoutubeUrl(raw: string): YoutubeEmbedTarget | null {
  const text = raw.trim();
  // URL() normalises ":443" away and hides userinfo tricks, so check the raw authority too.
  const authority = /^https:\/\/([^/?#]*)/i.exec(text)?.[1] ?? "";
  if (!authority || authority.includes("@") || authority.includes(":")) return null;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port || !HOSTS.has(url.hostname)) {
    return null;
  }
  const segments = url.pathname.split("/").filter(Boolean);
  let videoId: string | null = null;
  if (url.hostname.endsWith("youtu.be")) {
    videoId = segments[0] ?? null;
  } else if (segments[0] === "watch") {
    videoId = url.searchParams.get("v");
  } else if (["shorts", "embed", "live"].includes(segments[0] ?? "")) {
    videoId = segments[1] ?? null;
  } else if (segments[0] !== "playlist") {
    return null;
  }
  const list = url.searchParams.get("list");
  const validVideo = videoId && VIDEO_ID.test(videoId) ? videoId : null;
  const validList = list && LIST_ID.test(list) ? list : null;
  if (!validVideo && !validList) return null;
  return { videoId: validVideo, listId: validList };
}

export function youtubeEmbedUrl(raw: string): string | null {
  const target = parseYoutubeUrl(raw);
  if (!target) return null;
  const params = new URLSearchParams({ rel: "0", playsinline: "1", autoplay: "1" });
  if (target.listId) params.set("list", target.listId);
  const path = target.videoId ? `/embed/${target.videoId}` : "/embed/videoseries";
  return `${EMBED_ORIGIN}${path}?${params.toString()}`;
}
