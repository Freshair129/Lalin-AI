# @req FR-09 — render arrangement ของ timeline เป็นไฟล์เดียว (mixdown)
"""Render — แปลง project (tracks/clips) เป็นแผน แล้ว mix ลงไฟล์

แยกเป็นสองครึ่งโดยตั้งใจ:
  build_render_plan()  บริสุทธิ์ ไม่แตะเสียง — ตัดสินใจว่าอะไรถูกเล่นบ้าง (mute/solo/asset)
  render_plan()        อ่านไฟล์จริง แล้ว mix ตามแผน

ครึ่งแรกเทสต์ได้เร็วมากโดยไม่ต้องมีไฟล์เสียงจริง; ครึ่งหลังเทสต์ด้วย golden file
"""
from __future__ import annotations

import math
import shutil
import subprocess
import tempfile
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

from ..services.bundle import resolve_asset

DEFAULT_SR = 48000


class MissingAssetError(RuntimeError):
    """โปรเจกต์อ้างไฟล์ที่ไม่มีบนเครื่องนี้ — ผู้ใช้ต้อง import bundle หรือ relink"""


@dataclass
class RenderClip:
    path: str
    start: float       # ตำแหน่งบน timeline (วินาที)
    offset: float      # จุดเริ่มในไฟล์ต้นฉบับ
    duration: float
    gain: float
    fade_in: float
    fade_out: float


@dataclass
class RenderTrack:
    pan: float
    clips: list[RenderClip] = field(default_factory=list)


@dataclass
class RenderPlan:
    sample_rate: int
    duration: float
    tracks: list[RenderTrack] = field(default_factory=list)


def _clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


def build_render_plan(project: dict, sample_rate: int = DEFAULT_SR) -> RenderPlan:
    """แปลง project dict เป็นแผน render — ตัด clip/track ที่ไม่ดังออกตั้งแต่ตรงนี้

    กติกาให้ตรงกับ preview (ClipTimeline.play):
      • track ที่ muted ข้าม
      • ถ้ามี track ใดตั้ง solo → เล่นเฉพาะ track ที่ solo
      • clip ที่ muted หรือไม่มี assetId ข้าม
      • fade ที่รวมกันยาวเกิน clip → ย่อตามสัดส่วน (preview จะกระโดด เราทำให้นิ่ง)
    """
    assets = project.get("assets") or {}
    tracks_in = project.get("tracks") or []
    any_solo = any(t.get("solo") for t in tracks_in)

    out_tracks: list[RenderTrack] = []
    duration = 0.0

    for t in tracks_in:
        if t.get("muted"):
            continue
        if any_solo and not t.get("solo"):
            continue

        clips: list[RenderClip] = []
        for c in t.get("clips") or []:
            if c.get("muted"):
                continue
            aid = c.get("assetId")
            if not aid:
                continue
            ref = assets.get(aid)
            if ref is None:
                raise MissingAssetError(f"ไม่พบข้อมูล asset {aid} ในโปรเจกต์")
            try:
                path = resolve_asset(ref.get("kind", "upload"), ref.get("name", ""))
            except (FileNotFoundError, ValueError) as e:
                raise MissingAssetError(
                    f"ไม่พบไฟล์เสียง '{ref.get('name')}' บนเครื่องนี้ "
                    "— นำเข้า bundle (.gmp) หรืออัปโหลดไฟล์นี้อีกครั้งก่อน render"
                ) from e

            dur = float(c.get("duration") or 0.0)
            if dur <= 0:
                continue
            fi = max(0.0, float(c.get("fadeIn") or 0.0))
            fo = max(0.0, float(c.get("fadeOut") or 0.0))
            if fi + fo > dur:                       # ย่อตามสัดส่วนให้พอดี clip
                scale = dur / (fi + fo)
                fi, fo = fi * scale, fo * scale

            start = max(0.0, float(c.get("start") or 0.0))
            clips.append(RenderClip(
                path=str(path), start=start, offset=max(0.0, float(c.get("offset") or 0.0)),
                duration=dur, gain=_clamp(float(c.get("gain", 1.0)), 0.0, 1.0),
                fade_in=fi, fade_out=fo,
            ))
            duration = max(duration, start + dur)

        # track ที่เหลือ clip=0 (ไม่ว่าเพราะ clip.muted, ไม่มี asset, หรือ duration<=0)
        # ถูกตัดทิ้งทั้งแทร็ก — ไม่มี track ว่างเปล่าไหนมีประโยชน์ต่อ mixer
        if clips:
            out_tracks.append(RenderTrack(pan=_clamp(float(t.get("pan") or 0.0), -1.0, 1.0), clips=clips))

    return RenderPlan(sample_rate=sample_rate, duration=duration, tracks=out_tracks)


def _ffmpeg() -> str:
    import imageio_ffmpeg
    return imageio_ffmpeg.get_ffmpeg_exe()


def decode_to_array(src: str, sample_rate: int, work: Path) -> np.ndarray:
    """แปลงไฟล์ใดก็ได้ (wav/mp3/m4a/webm/วิดีโอ) เป็น float32 ที่ sample_rate ที่ต้องการ

    ผ่าน ffmpeg เสมอ จึงไม่ต้องพึ่ง resampler library และรองรับทุกฟอร์แมตที่ import ได้
    **คงจำนวนช่องเดิมไว้** (ไม่ใส่ -ac) เพราะ mono กับ stereo เข้าสูตร pan คนละทาง
    cache ผลลัพธ์ตาม path ต้นทางไว้ใน work — เรียกซ้ำสำหรับไฟล์เดิม (เช่นจาก _channels_of
    แล้วจากลูป mix) จะไม่เรียก ffmpeg ซ้ำ
    คืน shape (n, channels)
    """
    import soundfile as sf

    work.mkdir(parents=True, exist_ok=True)
    dst = work / f"dec_{abs(hash(src)) % (10 ** 10)}.wav"
    if not dst.exists():
        subprocess.run(
            [_ffmpeg(), "-y", "-i", src, "-vn", "-ar", str(sample_rate), "-c:a", "pcm_f32le", str(dst)],
            capture_output=True, check=True,
        )
    data, _ = sf.read(dst, dtype="float32", always_2d=True)
    return data


def apply_pan(audio: np.ndarray, pan: float) -> np.ndarray:
    """W3C StereoPannerNode — ทำตามสเปกตรงตัวเพื่อให้ render ตรงกับ preview

    mono   : x = (pan+1)/2 ; L = in*cos(xπ/2) , R = in*sin(xπ/2)
    stereo : pan<=0 → x = pan+1 ; L = inL + inR*cos(xπ/2) , R = inR*sin(xπ/2)
             pan>0  → x = pan   ; L = inL*cos(xπ/2)        , R = inR + inL*sin(xπ/2)
    """
    n, ch = audio.shape
    out = np.zeros((n, 2), dtype=np.float32)

    if ch == 1:
        x = (pan + 1.0) / 2.0
        out[:, 0] = audio[:, 0] * math.cos(x * math.pi / 2)
        out[:, 1] = audio[:, 0] * math.sin(x * math.pi / 2)
        return out

    left, right = audio[:, 0], audio[:, 1]
    x = pan + 1.0 if pan <= 0 else pan
    g_l, g_r = math.cos(x * math.pi / 2), math.sin(x * math.pi / 2)
    if pan <= 0:
        out[:, 0] = left + right * g_l
        out[:, 1] = right * g_r
    else:
        out[:, 0] = left * g_l
        out[:, 1] = right + left * g_r
    return out


def _envelope(n: int, sr: int, gain: float, fade_in: float, fade_out: float) -> np.ndarray:
    """gain คงที่ + linear ramp หัว/ท้าย — ตรงกับ linearRampToValueAtTime ของ Web Audio"""
    env = np.full(n, gain, dtype=np.float32)
    fi = int(round(fade_in * sr))
    if fi > 0:
        env[:fi] *= np.linspace(0.0, 1.0, min(fi, n), endpoint=False, dtype=np.float32)[: min(fi, n)]
    fo = int(round(fade_out * sr))
    if fo > 0:
        tail = min(fo, n)
        env[n - tail:] *= np.linspace(1.0, 0.0, tail, endpoint=False, dtype=np.float32)
    return env


def _channels_of(track: RenderTrack, work: Path, sr: int) -> int:
    """จำนวนช่องของ track = มากสุดในบรรดา clip ของมัน (mono ล้วน → 1, มี stereo → 2)"""
    ch = 1
    for c in track.clips:
        ch = max(ch, decode_to_array(c.path, sr, work).shape[1])
    return ch


def render_plan(plan: RenderPlan, out_path: str, progress=None) -> dict:
    """mix ตามแผนแล้วเขียนไฟล์ — คืนสถิติของ artifact ที่ผลิตได้

    peak ที่รายงานคือค่า "ก่อน" clip เสมอ (ค่าจริงที่เกิน ไม่ใช่ 1.0 ที่ถูกตัดแล้ว)
    เพื่อให้ผู้ใช้รู้ว่าเกินไปเท่าไหร่ — ตัวไฟล์ที่เขียนจริงถูก clip ไว้ที่ -1..1 เสมอ
    """
    import soundfile as sf

    sr = plan.sample_rate
    total = max(1, int(round(plan.duration * sr)))
    master = np.zeros((total, 2), dtype=np.float32)
    work = Path(tempfile.mkdtemp(prefix="render_"))
    n_clips = sum(len(t.clips) for t in plan.tracks)
    done = 0

    try:
        for track in plan.tracks:
            bus = np.zeros((total, max(1, _channels_of(track, work, sr))), dtype=np.float32)
            for c in track.clips:
                audio = decode_to_array(c.path, sr, work)
                start_i = int(round(c.offset * sr))
                length = int(round(c.duration * sr))
                seg = audio[start_i : start_i + length]
                if seg.shape[0] < length:                       # clip ยาวกว่าไฟล์ → เติมเงียบ
                    seg = np.pad(seg, ((0, length - seg.shape[0]), (0, 0)))
                if seg.shape[1] != bus.shape[1]:                # mono/stereo ปนกันใน track เดียว
                    seg = np.repeat(seg, 2, axis=1)[:, : bus.shape[1]] if seg.shape[1] == 1 \
                          else seg.mean(axis=1, keepdims=True)

                seg = seg * _envelope(seg.shape[0], sr, c.gain, c.fade_in, c.fade_out)[:, None]

                at = int(round(c.start * sr))
                end = min(total, at + seg.shape[0])
                if end > at:
                    bus[at:end] += seg[: end - at]

                done += 1
                if progress and n_clips:
                    progress(0.1 + 0.8 * done / n_clips, f"มิกซ์ {done}/{n_clips} คลิป…")

            master += apply_pan(bus, track.pan)

        peak = float(np.max(np.abs(master))) if master.size else 0.0
        clipped = bool(peak > 1.0)
        np.clip(master, -1.0, 1.0, out=master)
        sf.write(out_path, master, sr, subtype="FLOAT")
    finally:
        shutil.rmtree(work, ignore_errors=True)

    return {
        "output": out_path,
        "duration": round(total / sr, 3),
        "peak": round(peak, 6),
        "clipped": clipped,
        "tracks": len(plan.tracks),
        "clips": n_clips,
    }
