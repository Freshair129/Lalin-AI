# @req FR-09 — offline mixdown: RenderPlan -> ไฟล์จริง (golden-file, ล็อก parity กับ preview)
import math

import numpy as np
import pytest
import soundfile as sf

SR = 48000
AMP = 0.25   # เตี้ยพอที่ pan สุดข้างจะไม่เกิน 1.0 หลังรวม L+R


@pytest.fixture()
def flat(data_dir):
    """ไฟล์ stereo 2 วินาที ค่าคงที่ AMP ทุก sample — ทำให้คำนวณค่าที่คาดหวังได้ตรง ๆ"""
    p = data_dir / "uploads" / "flat.wav"
    sf.write(p, np.full((SR * 2, 2), AMP, dtype=np.float32), SR, subtype="FLOAT")
    return p


def _plan(clips, pan=0.0, sr=SR):
    from app.pipelines.render import RenderPlan, RenderTrack
    duration = max((c.start + c.duration for c in clips), default=0.0)
    return RenderPlan(sample_rate=sr, duration=duration, tracks=[RenderTrack(pan=pan, clips=clips)])


def _clip(path, **kw):
    from app.pipelines.render import RenderClip
    base = dict(path=str(path), start=0.0, offset=0.0, duration=1.0,
                gain=1.0, fade_in=0.0, fade_out=0.0)
    base.update(kw)
    return RenderClip(**base)


def _read(p):
    data, sr = sf.read(p, dtype="float32", always_2d=True)
    return data, sr


def test_clip_lands_at_its_start_time(flat, data_dir, tmp_path):
    from app.pipelines.render import render_plan

    out = tmp_path / "o.wav"
    render_plan(_plan([_clip(flat, start=1.0, duration=1.0)]), str(out))
    data, sr = _read(out)

    assert sr == SR
    assert data.shape[0] == pytest.approx(SR * 2, abs=2)
    assert np.allclose(data[: SR - 1], 0.0, atol=1e-6)            # ก่อน start = เงียบ
    assert np.allclose(data[SR + 10 : SR * 2 - 10], AMP, atol=1e-4)


def test_gain_scales_the_samples(flat, tmp_path):
    from app.pipelines.render import render_plan

    out = tmp_path / "o.wav"
    render_plan(_plan([_clip(flat, gain=0.5)]), str(out))
    data, _ = _read(out)
    assert np.allclose(data[100:-100], AMP * 0.5, atol=1e-4)


def test_offset_reads_from_inside_the_source(flat, tmp_path):
    from app.pipelines.render import render_plan

    out = tmp_path / "o.wav"
    render_plan(_plan([_clip(flat, offset=1.0, duration=0.5)]), str(out))
    data, _ = _read(out)
    assert data.shape[0] == pytest.approx(SR // 2, abs=2)
    assert np.allclose(data[100:-100], AMP, atol=1e-4)


def test_fade_in_is_linear(flat, tmp_path):
    from app.pipelines.render import render_plan

    out = tmp_path / "o.wav"
    render_plan(_plan([_clip(flat, duration=1.0, fade_in=1.0)]), str(out))
    data, _ = _read(out)
    assert data[0, 0] == pytest.approx(0.0, abs=1e-4)
    assert data[SR // 2, 0] == pytest.approx(AMP * 0.5, abs=2e-3)
    assert data[SR - 2, 0] == pytest.approx(AMP, abs=2e-3)


def test_fade_out_is_linear(flat, tmp_path):
    from app.pipelines.render import render_plan

    out = tmp_path / "o.wav"
    render_plan(_plan([_clip(flat, duration=1.0, fade_out=1.0)]), str(out))
    data, _ = _read(out)
    assert data[0, 0] == pytest.approx(AMP, abs=2e-3)
    assert data[SR // 2, 0] == pytest.approx(AMP * 0.5, abs=2e-3)
    assert data[SR - 2, 0] == pytest.approx(0.0, abs=2e-3)


def test_overlapping_clips_sum(flat, tmp_path):
    from app.pipelines.render import render_plan

    out = tmp_path / "o.wav"
    render_plan(_plan([_clip(flat, duration=1.0), _clip(flat, duration=1.0)]), str(out))
    data, _ = _read(out)
    assert np.allclose(data[100:-100], AMP * 2, atol=1e-4)


def test_pan_hard_left_matches_the_w3c_stereo_panner(flat, tmp_path):
    """pan=-1 → x=0 → gainL=cos(0)=1, gainR=sin(0)=0 → L = inL + inR, R = 0"""
    from app.pipelines.render import render_plan

    out = tmp_path / "o.wav"
    render_plan(_plan([_clip(flat, duration=1.0)], pan=-1.0), str(out))
    data, _ = _read(out)
    assert np.allclose(data[100:-100, 0], AMP * 2, atol=1e-4)
    assert np.allclose(data[100:-100, 1], 0.0, atol=1e-6)


def test_pan_centre_is_the_identity(flat, tmp_path):
    from app.pipelines.render import render_plan

    out = tmp_path / "o.wav"
    render_plan(_plan([_clip(flat, duration=1.0)], pan=0.0), str(out))
    data, _ = _read(out)
    assert np.allclose(data[100:-100, 0], AMP, atol=1e-4)
    assert np.allclose(data[100:-100, 1], AMP, atol=1e-4)


def test_apply_pan_matches_the_spec_formula():
    from app.pipelines.render import apply_pan

    mono = np.full((4, 1), 0.5, dtype=np.float32)
    out = apply_pan(mono, 0.0)
    assert out.shape == (4, 2)
    # mono: x = (pan+1)/2 = 0.5 → gainL = gainR = cos/sin(π/4) = √2/2
    assert out[0, 0] == pytest.approx(0.5 * math.cos(math.pi / 4), abs=1e-6)
    assert out[0, 1] == pytest.approx(0.5 * math.sin(math.pi / 4), abs=1e-6)


def test_result_reports_the_true_pre_clip_peak_and_flags_clipping(flat, tmp_path):
    """5 คลิป AMP=0.25 รวมกันใน track เดียว pan=0 (identity) -> peak จริงก่อน clip = 1.25
    ต้องรายงานค่าจริง (ไม่ใช่ค่าที่ถูก clip เหลือ 1.0) ผู้ใช้ถึงจะรู้ว่าเกินไปเท่าไหร่"""
    from app.pipelines.render import render_plan

    out = tmp_path / "o.wav"
    res = render_plan(_plan([_clip(flat, duration=1.0, gain=1.0)] * 5), str(out))
    assert res["peak"] == pytest.approx(1.25, abs=1e-4)
    assert res["clipped"] is True
    assert res["clips"] == 5

    # ไฟล์ที่เขียนจริงต้องถูก clip ไว้ที่ 1.0 เสมอ (กัน sample หลุดช่วง -1..1)
    data, _ = _read(out)
    assert float(np.max(np.abs(data))) == pytest.approx(1.0, abs=1e-6)


def test_result_reports_no_clipping_when_under_ceiling(flat, tmp_path):
    from app.pipelines.render import render_plan

    out = tmp_path / "o.wav"
    res = render_plan(_plan([_clip(flat, duration=1.0, gain=0.5)]), str(out))
    assert res["clipped"] is False
    assert res["peak"] < 1.0


def test_empty_plan_writes_a_short_silent_file(tmp_path, data_dir):
    from app.pipelines.render import RenderPlan, render_plan

    out = tmp_path / "o.wav"
    res = render_plan(RenderPlan(sample_rate=SR, duration=0.0, tracks=[]), str(out))
    data, _ = _read(out)
    assert res["clips"] == 0
    assert np.allclose(data, 0.0)
