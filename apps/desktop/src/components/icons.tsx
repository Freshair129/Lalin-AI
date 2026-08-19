// @req NFR-04 — ชุดไอคอนของ rail/nav
// ชุด line icon โมเดิร์น (stroke=currentColor) สำหรับ rail/nav
type IconName = "voices" | "tts" | "dubbing" | "mastering" | "remix" | "market" | "brain"
  | "files" | "folder" | "audio" | "doc" | "save" | "saveAs" | "play" | "stop"
  | "record" | "search" | "undo" | "redo" | "loop" | "metro" | "grid" | "spark";

const PATHS: Record<IconName, React.ReactNode> = {
  // microphone
  voices: (<>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0" />
    <line x1="12" y1="18" x2="12" y2="21" /><line x1="8.5" y1="21" x2="15.5" y2="21" />
  </>),
  // text lines (read text)
  tts: (<>
    <line x1="4" y1="7" x2="20" y2="7" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="17" x2="13" y2="17" />
  </>),
  // film strip (dubbing)
  dubbing: (<>
    <rect x="4" y="5" width="16" height="14" rx="2" />
    <path d="M4 9h16M4 15h16M9 5v14M15 5v14" />
  </>),
  // mixer sliders (mastering)
  mastering: (<>
    <line x1="6" y1="4" x2="6" y2="20" /><line x1="12" y1="4" x2="12" y2="20" /><line x1="18" y1="4" x2="18" y2="20" />
    <circle cx="6" cy="9" r="2" /><circle cx="12" cy="14" r="2" /><circle cx="18" cy="8" r="2" />
  </>),
  // waveform (remix)
  remix: (<>
    <line x1="4" y1="10" x2="4" y2="14" /><line x1="8" y1="6" x2="8" y2="18" />
    <line x1="12" y1="9" x2="12" y2="15" /><line x1="16" y1="4" x2="16" y2="20" /><line x1="20" y1="8" x2="20" y2="16" />
  </>),
  // shopping bag (marketplace)
  market: (<>
    <path d="M6 8h12l-1 11a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1L6 8z" />
    <path d="M9 8V6.5a3 3 0 0 1 6 0V8" />
  </>),
  // cpu chip (brain)
  brain: (<>
    <rect x="7" y="7" width="10" height="10" rx="2" />
    <path d="M10 7V4M14 7V4M10 20v-3M14 20v-3M7 10H4M7 14H4M20 10h-3M20 14h-3" />
  </>),
  // folder (files nav)
  files: (<>
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  </>),
  folder: (<>
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  </>),
  // audio file (note)
  audio: (<>
    <path d="M9 18V6l10-2v12" />
    <circle cx="6" cy="18" r="2.5" /><circle cx="16" cy="16" r="2.5" />
  </>),
  // document (project)
  doc: (<>
    <path d="M6 3h8l4 4v14a0 0 0 0 1 0 0H6a0 0 0 0 1 0 0z" />
    <path d="M14 3v4h4M9 13h6M9 17h6" />
  </>),
  save: (<>
    <path d="M5 4h11l3 3v13H5z" />
    <path d="M8 4v6h8V4M9 18h6" />
  </>),
  saveAs: (<>
    <path d="M5 4h11l3 3v13H5z" />
    <path d="M8 4v6h8V4M9 18h6" />
    <path d="M15 13l4 4M19 13v4h-4" />
  </>),
  play: (<>
    <path d="M8 6l10 6-10 6z" />
  </>),
  stop: (<>
    <rect x="7" y="7" width="10" height="10" rx="1.5" />
  </>),
  record: (<>
    <circle cx="12" cy="12" r="5" />
  </>),
  search: (<>
    <circle cx="11" cy="11" r="6" />
    <path d="M20 20l-4.2-4.2" />
  </>),
  undo: (<>
    <path d="M9 7L5 11l4 4" />
    <path d="M6 11h7a5 5 0 1 1 0 10h-1" />
  </>),
  redo: (<>
    <path d="M15 7l4 4-4 4" />
    <path d="M18 11h-7a5 5 0 1 0 0 10h1" />
  </>),
  loop: (<>
    <path d="M7 7h10v4" />
    <path d="M17 17H7v-4" />
    <path d="M17 7l2 2-2 2" />
    <path d="M7 17l-2-2 2-2" />
  </>),
  metro: (<>
    <path d="M10 4h4l3 15H7z" />
    <path d="M12 8v4" />
    <path d="M9 20h6" />
  </>),
  grid: (<>
    <rect x="5" y="5" width="14" height="14" rx="2" />
    <path d="M10 5v14M14 5v14M5 10h14M5 14h14" />
  </>),
  spark: (<>
    <path d="M4 15c2.2 0 2.8-6 5-6s2.8 10 5 10 2.8-12 6-12" />
  </>),
};

export function Icon({ name, size = 19 }: { name: string; size?: number }) {
  const p = PATHS[name as IconName];
  if (!p) return null;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      {p}
    </svg>
  );
}
