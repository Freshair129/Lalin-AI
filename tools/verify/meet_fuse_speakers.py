#!/usr/bin/env python3
"""Usage: python meet_fuse_speakers.py transcript.json diar.json ring.json out.txt  (offline eval helper; pipeline §4b)

Fuse: pyannote turns (audio) + Meet ring gate (video, authoritative where visible) + whisper transcript.
Outputs: coverage stats, S-label -> name mapping by overlap, and a speaker-named transcript with evidence tags:
  [V] ring seen for this segment   [A] pyannote only (Meet not visible)   [R] speech but no ring while Meet visible -> recorder (inferred)
"""
import json, sys, io
from collections import Counter, defaultdict
tr = json.load(io.open(sys.argv[1], encoding="utf-8"))["segments"]
turns = json.load(io.open(sys.argv[2], encoding="utf-8"))
glow = json.load(io.open(sys.argv[3], encoding="utf-8"))
out = sys.argv[4]
fps = 2.0
# per-frame arrays
n = len(glow)
vis = [bool(g["tiles"]) for g in glow]
act = [g["active"] for g in glow]
def frames(a, b):
    i0, i1 = max(int(a * fps), 0), min(int(b * fps) + 1, n)
    return range(i0, i1)
# 1) coverage
print(f"frames {n}  Meet visible {100*sum(vis)/n:.1f}%  ring active {100*sum(1 for a in act if a)/n:.1f}%")
# 2) S-label -> name: for each pyannote turn, tally ring names seen during the turn (only when visible)
tally = defaultdict(Counter); vis_time = Counter(); noring_time = Counter()
for t in turns:
    for i in frames(t["start"], t["end"]):
        if vis[i]:
            vis_time[t["speaker"]] += 1
            if act[i]: tally[t["speaker"]][act[i]] += 1
            else: noring_time[t["speaker"]] += 1
print("\npyannote label -> ring names seen while that label was speaking (frames):")
mapping = {}
for spk in sorted(vis_time):
    c = tally[spk]; total = vis_time[spk]
    top = c.most_common(3)
    share = {k: f"{100*v/total:.0f}%" for k, v in top}
    nor = f"{100*noring_time[spk]/total:.0f}%"
    print(f"  {spk}: visible {total/fps/60:.1f} min  ring={share}  no-ring={nor}")
    if top and top[0][1] / total >= 0.5: mapping[spk] = top[0][0]
    elif noring_time[spk] / total >= 0.5: mapping[spk] = "RECORDER (inferred: speech, Meet visible, no ring)"
    else: mapping[spk] = "AMBIGUOUS"
print("\nmapping:", json.dumps(mapping, ensure_ascii=False, indent=1))
# 3) transcript with evidence
def spk_for(a, b):
    ov = Counter()
    for t in turns:
        o = min(b, t["end"]) - max(a, t["start"])
        if o > 0: ov[t["speaker"]] += o
    return (ov.most_common(1)[0][0], ov.most_common(1)[0][1] / max(b - a, 1e-6)) if ov else (None, 0)
lines, prev, stats = [], None, Counter()
for s in tr:
    fr = list(frames(s["start"], s["end"]))
    ring = Counter(act[i] for i in fr if act[i]); visible = any(vis[i] for i in fr)
    a_spk, conf = spk_for(s["start"], s["end"])
    if ring and ring.most_common(1)[0][1] >= 0.4 * len(fr):
        name, tag = ring.most_common(1)[0][0], "V"
    elif visible and a_spk and mapping.get(a_spk, "").startswith("RECORDER"):
        name, tag = "RECORDER", "R"
    elif visible and not ring:
        name, tag = "RECORDER?", "R"
    else:
        name, tag = (mapping.get(a_spk, a_spk) if a_spk else "UNKNOWN"), "A"
        if conf < 0.5: name += "?"
    stats[tag] += 1
    mm, ss = divmod(int(s["start"]), 60); hh, mm = divmod(mm, 60)
    if name != prev: lines.append(""); prev = name
    lines.append(f"[{hh:02d}:{mm:02d}:{ss:02d}] [{tag}] {name}: {s['text']}")
io.open(out, "w", encoding="utf-8").write("\n".join(lines).lstrip("\n") + "\n")
print("\nsegments by evidence:", dict(stats), "->", out)
