#!/usr/bin/env python3
"""Google Meet active-speaker ring detector (offline eval helper, outside the voice-worker scope — see docs/architecture/MEETING_TRANSCRIPT_PIPELINE.md §4a).
Usage: python meet_ring_gate.py <video> <out.json> [fps]  (env GG_SS / GG_T = seek/duration for probes)
Run in apps/api/.venv-diar. TILES maps each participant's avatar colour (sampled once from a frame) to the name on the tile.

Original note: — streams frames from ffmpeg at FPS, finds avatar tiles by their solid
colour, checks the brightness of the 3-px band just outside each tile (Meet draws a light ring around the loudest
speaker), and writes one row per frame. Deterministic; no model."""
import json, subprocess, sys, time
import numpy as np
from scipy import ndimage
import imageio_ffmpeg

video, out, fps = sys.argv[1], sys.argv[2], float(sys.argv[3]) if len(sys.argv) > 3 else 2.0
W, H = 960, 540
# avatar tile background colours sampled from frames (RGB) -> participant name read from the tile label
TILES = {
    "Wannapa Prajaktip":            (110, 7, 60),
    "Etoh Cols Group":              (74, 31, 121),
    "Phavida Rattanamongkolkul":    (53, 87, 27),
    "FreshAir iBozz":               (24, 45, 72),
}
TOL = 28
MIN_AREA = 900          # px at 960x540 (PiP tiles are ~55x60 = 3300 px; strip tiles far bigger)
ff = imageio_ffmpeg.get_ffmpeg_exe()
import os
seek = ["-ss", os.environ["GG_SS"]] if os.environ.get("GG_SS") else []
dur = ["-t", os.environ["GG_T"]] if os.environ.get("GG_T") else []
cmd = [ff, "-hide_banner", "-loglevel", "error", *seek, "-i", video, *dur, "-vf", f"fps={fps},scale={W}:{H}", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]
proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, bufsize=W * H * 3 * 4)
rows = []
i = 0
t0 = time.time()
luma_w = np.array([0.299, 0.587, 0.114])
while True:
    buf = proc.stdout.read(W * H * 3)
    if len(buf) < W * H * 3:
        break
    frame = np.frombuffer(buf, np.uint8).reshape(H, W, 3).astype(np.int16)
    luma = frame @ luma_w
    seen = {}
    for name, rgb in TILES.items():
        mask = (np.abs(frame - np.array(rgb)).max(axis=2) <= TOL)
        lab, n = ndimage.label(mask)
        if n == 0:
            continue
        sizes = ndimage.sum(mask, lab, range(1, n + 1))
        k = int(np.argmax(sizes)) + 1
        if sizes[k - 1] < MIN_AREA:
            continue
        ys, xs = np.where(lab == k)
        y0, y1, x0, x1 = ys.min(), ys.max(), xs.min(), xs.max()
        bw, bh = x1 - x0, y1 - y0
        if bw < 30 or bh < 30 or sizes[k - 1] < 0.35 * bw * bh:   # not a solid rectangle
            continue
        # ring band 2..5 px outside the bbox (clamped)
        pad_in, pad_out = 2, 6
        Y0, Y1, X0, X1 = max(y0 - pad_out, 0), min(y1 + pad_out, H - 1), max(x0 - pad_out, 0), min(x1 + pad_out, W - 1)
        band = []
        if y0 - pad_out >= 0: band.append(luma[Y0:y0 - pad_in + 1, x0 + 10:x1 - 10].ravel())
        if y1 + pad_out < H: band.append(luma[y1 + pad_in:Y1 + 1, x0 + 10:x1 - 10].ravel())
        if x0 - pad_out >= 0: band.append(luma[y0 + 10:y1 - 10, X0:x0 - pad_in + 1].ravel())
        if x1 + pad_out < W: band.append(luma[y0 + 10:y1 - 10, x1 + pad_in:X1 + 1].ravel())
        if not band:
            continue
        ring = np.concatenate(band)
        seen[name] = {"box": [int(x0), int(y0), int(x1), int(y1)], "ring_p75": float(np.percentile(ring, 75)), "ring_mean": float(ring.mean())}
    t = i / fps
    active = None
    if seen:
        cand = max(seen.items(), key=lambda kv: kv[1]["ring_p75"])
        # relative rule: the recorder's own tile glows dimmer (~120) than others (~197); quiet tiles sit at ~17
        second = sorted(v["ring_p75"] for v in seen.values())[-2] if len(seen) > 1 else 0
        if cand[1]["ring_p75"] >= 80 and cand[1]["ring_p75"] >= 2 * max(second, 17):
            active = cand[0]
    rows.append({"t": round(t, 2), "tiles": {k: round(v["ring_p75"]) for k, v in seen.items()}, "active": active})
    i += 1
    if i % 1200 == 0:
        print(f"{t/60:.0f} min processed, {time.time()-t0:.0f}s elapsed", flush=True)
proc.wait()
json.dump(rows, open(out, "w", encoding="utf-8"), ensure_ascii=False)
vis = sum(1 for r in rows if r["tiles"]); act = sum(1 for r in rows if r["active"])
print(f"frames {len(rows)}  tiles visible {vis} ({100*vis/len(rows):.1f}%)  active ring seen {act} ({100*act/len(rows):.1f}%)  took {time.time()-t0:.0f}s")
