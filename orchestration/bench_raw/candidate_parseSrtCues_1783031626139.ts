code block. No prose. Pure function, no imports.

Implement EXACTLY this signature in frontend/src/dubbing/parseSrtCues.ts:
export function parseSrtCues(srt: string): { start: number; end: number; text: string }[]

Rules:
- SRT format: blocks separated by one or more blank lines; each block = index line, then time line "HH:MM:SS,mmm --> HH:MM:SS,mmm", then 1+ text lines (join multiple text lines with "\n").
- start/end are seconds (number).
- handle both \n and \r\n line endings; trim each line.
- skip malformed blocks (no valid time line) instead of throwing.
- empty or whitespace-only input -> [].

Acceptance: parseSrtCues("1\n00:00:01,000 --> 00:00:02,500\nhello\n\n2\n00:00:03,000 --> 00:00:04,000\nworld a\nworld b") -> [{start:1,end:2.5,text:"hello"},{start:3,end:4,text:"world a\nworld b"}]. parseSrtCues("") -> [].
Output ONLY the