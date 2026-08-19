# @req FR-04 — validate_audio(): ตรวจ artifact ก่อนถือว่า render สำเร็จ
import numpy as np
import pytest
import soundfile as sf

SR = 48000


def _write(p, arr):
    sf.write(p, arr.astype(np.float32), SR, subtype="FLOAT")
    return str(p)


def test_healthy_file_passes(tmp_path):
    from app.utils.validate import validate_audio

    t = np.linspace(0, 1, SR, endpoint=False)
    tone = np.stack([np.sin(2 * np.pi * 440 * t) * 0.3] * 2, axis=1)
    r = validate_audio(_write(tmp_path / "a.wav", tone))
    assert r["ok"] is True
    assert r["issues"] == []
    assert r["channels"] == 2
    assert r["sample_rate"] == SR
    assert r["duration"] == pytest.approx(1.0, abs=0.01)


def test_all_silence_is_flagged(tmp_path):
    from app.utils.validate import validate_audio

    r = validate_audio(_write(tmp_path / "s.wav", np.zeros((SR, 2))))
    assert r["ok"] is False
    assert any("เงียบ" in i for i in r["issues"])


def test_nan_is_flagged(tmp_path):
    from app.utils.validate import validate_audio

    arr = np.zeros((SR, 2)); arr[10] = np.nan
    r = validate_audio(_write(tmp_path / "n.wav", arr))
    assert r["ok"] is False
    assert any("NaN" in i for i in r["issues"])


def test_dc_offset_is_flagged(tmp_path):
    from app.utils.validate import validate_audio

    r = validate_audio(_write(tmp_path / "d.wav", np.full((SR, 2), 0.4)))
    assert r["ok"] is False
    assert any("DC" in i for i in r["issues"])


def test_zero_length_is_flagged(tmp_path):
    from app.utils.validate import validate_audio

    r = validate_audio(_write(tmp_path / "z.wav", np.zeros((0, 2))))
    assert r["ok"] is False
    assert any("ความยาว" in i for i in r["issues"])
