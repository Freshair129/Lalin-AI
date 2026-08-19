# @req FR-09 — render arrangement ของ timeline เป็นไฟล์เดียว (mixdown)
"""Render — แปลง project (tracks/clips) เป็นแผน แล้ว mix ลงไฟล์

แยกเป็นสองครึ่งโดยตั้งใจ:
  build_render_plan()  บริสุทธิ์ ไม่แตะเสียง — ตัดสินใจว่าอะไรถูกเล่นบ้าง (mute/solo/asset)
  render_plan()        อ่านไฟล์จริง แล้ว mix ตามแผน

ครึ่งแรกเทสต์ได้เร็วมากโดยไม่ต้องมีไฟล์เสียงจริง; ครึ่งหลังเทสต์ด้วย golden file
"""
from __future__ import annotations

from dataclasses import dataclass, field

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
