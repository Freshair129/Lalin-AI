"""Music remix/finishing — "Suno finishing studio"

ต่อยอดจากเพลงที่ผู้ใช้สร้างเอง (เช่นจาก Suno) หรือเดโม่ของตัวเอง:
  • แยก stem (vocal/ดนตรี) ด้วย Demucs
  • วางเสียงร้องบน beat อื่น พร้อม BPM-sync + key-match + auto-tune
  • ใส่ vocal FX chain (EQ/comp/reverb/delay) ด้วย pedalboard
  • มาสเตอร์ปิดท้าย

⚠️ deps เพิ่มเติม (lazy import — ลงแยก, เป็น optional/GPL บางตัว):
    uv pip install demucs psola pedalboard      # librosa/pyloudnorm/soundfile มีอยู่แล้ว
  license: demucs(MIT), psola(MIT→parselmouth GPL), pedalboard(GPLv3)
  → ถ้าขายเชิงพาณิชย์ ใช้แบบ BYOM/optional component (ดู docs/ROADMAP_MUSIC.md)

⚠️ ทุกฟังก์ชันโหลดโมเดล/ประมวลผลทีละขั้น แล้วปล่อย VRAM (3060 12GB พอ ถ้าไม่โหลดพร้อมกัน)
"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

import numpy as np

from ..config import get_settings
from ..utils.ids import short_id

SR = 44100

# โปรไฟล์คีย์ Krumhansl–Schmuckler (major/minor)
_NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
_MAJ = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
_MIN = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])
_SCALE = {"maj": [0, 2, 4, 5, 7, 9, 11], "min": [0, 2, 3, 5, 7, 8, 10]}


# ════════════════════════════════════════════════════════════
#  Helpers: โหลดเสียง (รองรับ mp3/mp4/wav ผ่าน ffmpeg)
# ════════════════════════════════════════════════════════════
def _ffmpeg() -> str:
    import imageio_ffmpeg
    return imageio_ffmpeg.get_ffmpeg_exe()


def _to_wav(src: str, dst: str) -> str:
    """แตกเสียงจากไฟล์ใดๆ (mp3/mp4/...) เป็น wav 44.1k stereo."""
    subprocess.run(
        [_ffmpeg(), "-y", "-i", src, "-vn", "-ac", "2", "-ar", str(SR),
         "-acodec", "pcm_s16le", dst],
        capture_output=True, check=True,
    )
    return dst


# ════════════════════════════════════════════════════════════
#  1) แยก stem (Demucs) — คืน path ของ vocals.wav + no_vocals.wav
# ════════════════════════════════════════════════════════════
def separate_stems(audio: str, out_dir: str, *, device: str | None = None) -> dict:
    """แยกเสียงร้อง/ดนตรีด้วย Demucs (htdemucs, two-stems=vocals)."""
    try:
        import torch  # noqa: F401
    except ImportError as e:  # noqa: BLE001
        raise RuntimeError("ยังไม่ได้ติดตั้ง torch") from e
    import torch

    dev = device or ("cuda" if torch.cuda.is_available() else "cpu")
    sep_root = Path(out_dir) / "_sep"
    name = Path(audio).stem
    subprocess.run(
        [sys.executable, "-m", "demucs", "--two-stems=vocals", "-d", dev,
         "-o", str(sep_root), audio],
        check=True,
    )
    torch.cuda.empty_cache()  # ปล่อย VRAM ก่อนขั้นถัดไป
    base = sep_root / "htdemucs" / name
    return {
        "vocals": str(base / "vocals.wav"),
        "instrumental": str(base / "no_vocals.wav"),
    }


# ════════════════════════════════════════════════════════════
#  2) วิเคราะห์ BPM / Key
# ════════════════════════════════════════════════════════════
def detect_bpm(path: str) -> float:
    import librosa
    y, _ = librosa.load(path, sr=SR, mono=True)
    t = librosa.beat.beat_track(y=y, sr=SR)[0]
    return float(np.atleast_1d(t)[0])


def detect_key(path: str) -> tuple[str, str, int]:
    """คืน (tonic, mode, tonic_index) เช่น ('F', 'maj', 5)."""
    import librosa
    y, _ = librosa.load(path, sr=SR, mono=True)
    prof = librosa.feature.chroma_cqt(y=y, sr=SR).mean(axis=1)
    best = None
    for mode, tmpl in (("maj", _MAJ), ("min", _MIN)):
        for i in range(12):
            score = np.corrcoef(prof, np.roll(tmpl, i))[0, 1]
            if best is None or score > best[0]:
                best = (score, _NOTES[i], mode, i)
    return best[1], best[2], best[3]


# ════════════════════════════════════════════════════════════
#  3) Auto-tune (psola) — snap เข้าสเกลของ target key
# ════════════════════════════════════════════════════════════
def autotune(vocal_stereo: np.ndarray, key_idx: int, mode: str) -> np.ndarray:
    import librosa
    import psola

    allowed = np.array(sorted({(key_idx + s) % 12 for s in _SCALE[mode]}))
    fmin, fmax = librosa.note_to_hz("C2"), librosa.note_to_hz("C6")
    mono = librosa.to_mono(vocal_stereo)
    f0, _, _ = librosa.pyin(mono, fmin=fmin, fmax=fmax, sr=SR,
                            frame_length=2048, hop_length=512)

    def _snap(f):
        if np.isnan(f) or f <= 0:
            return f
        midi = librosa.hz_to_midi(f)
        pc = int(round(midi)) % 12
        _, tgt = min((min((a - pc) % 12, (pc - a) % 12), a) for a in allowed)
        d = tgt - pc
        d = d - 12 if d > 6 else (d + 12 if d < -6 else d)
        return librosa.midi_to_hz(round(midi) + d)

    target = np.array([_snap(f) for f in f0])
    target = np.where(np.isnan(target), f0, target)
    return np.stack([
        psola.vocode(vocal_stereo[c].astype(np.float64), sample_rate=SR,
                     target_pitch=target, fmin=fmin, fmax=fmax)
        for c in range(vocal_stereo.shape[0])
    ]).astype(np.float32)


# ════════════════════════════════════════════════════════════
#  4) Vocal FX chain (pedalboard)
# ════════════════════════════════════════════════════════════
def vocal_fx(vocal_stereo: np.ndarray, *, reverb: float = 0.16,
             delay: float = 0.12, comp_ratio: float = 3.5,
             air_db: float = 3.0) -> np.ndarray:
    """EQ → gate → compress → ความใส → delay → reverb (ปรับความแรงได้)."""
    from pedalboard import (Compressor, Delay, Gain, HighpassFilter,
                            HighShelfFilter, LowShelfFilter, NoiseGate,
                            Pedalboard, Reverb)
    board = Pedalboard([
        NoiseGate(threshold_db=-45, ratio=2.0, release_ms=150),
        HighpassFilter(cutoff_frequency_hz=90),
        LowShelfFilter(cutoff_frequency_hz=200, gain_db=-2),
        Compressor(threshold_db=-20, ratio=comp_ratio, attack_ms=5, release_ms=120),
        HighShelfFilter(cutoff_frequency_hz=8000, gain_db=air_db),
        Gain(gain_db=2),
        Delay(delay_seconds=0.23, feedback=0.18, mix=delay),
        Reverb(room_size=0.32, damping=0.5, wet_level=reverb,
               dry_level=1.0 - reverb, width=1.0),
    ])
    return board(vocal_stereo, SR)


# ════════════════════════════════════════════════════════════
#  5) Beat-sync: หา phase offset อัตโนมัติ (BPM ตรง) — หรือกำหนดเอง
# ════════════════════════════════════════════════════════════
def auto_phase_offset(beat_path: str, source_path: str, bpm: float) -> int:
    """คืน offset (samples) ที่ทำให้ onset grid ของ source ตรงกับ beat ที่สุด.

    ใช้ source ที่มี beat เดิม (เช่นเพลงต้นฉบับก่อนแยก stem) เพื่อหา phase
    เพราะ vocal เปล่า onset ไม่ชัด
    """
    import librosa
    hop = 256
    yb, _ = librosa.load(beat_path, sr=SR, mono=True)
    yr, _ = librosa.load(source_path, sr=SR, mono=True)
    ob = librosa.onset.onset_strength(y=yb, sr=SR, hop_length=hop)
    orf = librosa.onset.onset_strength(y=yr, sr=SR, hop_length=hop)
    L = min(len(ob), len(orf))
    ob_ = ob[:L] - ob[:L].mean()
    orf_ = orf[:L] - orf[:L].mean()
    period = (60.0 / bpm) * SR / hop  # 1 จังหวะ = กี่ frame
    best = None
    for frac in np.linspace(0, period, 48, endpoint=False):
        lag = int(round(frac))
        shifted = orf_ if lag == 0 else np.concatenate([np.zeros(lag), orf_])[:L]
        score = float(np.dot(ob_, shifted))
        if best is None or score > best[0]:
            best = (score, lag)
    return int(best[1] * hop)


def _mix_with_offset(
    beat_stereo: np.ndarray,
    vocal_stereo: np.ndarray,
    offset_samples: int,
    *,
    beat_gain_db: float,
    vocal_gain: float,
) -> np.ndarray:
    """Mix vocal onto beat while supporting both positive and negative offsets."""
    beat = beat_stereo.astype(np.float32) * (10 ** (beat_gain_db / 20))
    vocal = vocal_stereo.astype(np.float32) * vocal_gain

    beat_start = max(0, -offset_samples)
    vocal_start = max(0, offset_samples)
    total_len = max(beat_start + beat.shape[1], vocal_start + vocal.shape[1])

    mix = np.zeros((2, total_len), dtype=np.float32)
    mix[:, beat_start:beat_start + beat.shape[1]] += beat
    mix[:, vocal_start:vocal_start + vocal.shape[1]] += vocal
    return mix


def _master_to_target(
    stereo_mix: np.ndarray,
    *,
    sample_rate: int,
    target_lufs: float,
    ceiling_db: float = -1.0,
) -> tuple[np.ndarray, float]:
    """Normalize toward target LUFS while respecting available headroom."""
    import pyloudnorm as pyln

    meter = pyln.Meter(sample_rate)
    ceiling = 10 ** (ceiling_db / 20)
    mastered = stereo_mix.astype(np.float32, copy=True)

    peak = float(np.max(np.abs(mastered)))
    if peak > ceiling:
        mastered *= ceiling / peak

    loudness_in = float(meter.integrated_loudness(mastered))
    target_gain_db = target_lufs - loudness_in

    peak = float(np.max(np.abs(mastered)))
    if peak > 0:
        max_gain_db = 20 * np.log10(ceiling / peak)
        applied_gain_db = min(target_gain_db, max_gain_db)
        mastered *= 10 ** (applied_gain_db / 20)

    loudness_out = float(meter.integrated_loudness(mastered))
    return mastered, loudness_out


# ════════════════════════════════════════════════════════════
#  Orchestrator: vocal → beat (remix เต็มขั้น)
# ════════════════════════════════════════════════════════════
def run_remix(
    *,
    source_audio: str,       # เพลง/เดโม่ต้นทาง (มีเสียงร้อง) — mp3/mp4/wav
    beat_audio: str,         # beat ปลายทาง — mp3/mp4/wav
    target_lufs: float = -14.0,
    do_autotune: bool = True,
    do_fx: bool = True,
    offset_ms: float | None = None,   # None = auto phase-sync, ตัวเลข = กำหนดเอง
    beat_gain_db: float = -2.0,
    vocal_gain: float = 0.95,
    reverb: float = 0.16,
    delay: float = 0.12,
    progress=None,   # callable(frac: float, msg: str) — รายงานความคืบหน้า (optional)
) -> dict:
    """แยกเสียงร้องจาก source → autotune/FX → วางบน beat → มาสเตอร์.

    offset_ms: เลื่อนเสียงร้อง (มิลลิวินาที). None = หา phase อัตโนมัติ.
               ค่าบวก = เลื่อนช้าลง (ขวา). ใช้ปรับ manual ให้เนียนสุด.
    """
    import librosa
    import pyloudnorm as pyln
    import soundfile as sf

    def _p(frac: float, msg: str) -> None:
        if progress:
            progress(frac, msg)

    settings = get_settings()
    work = settings.outputs_dir / f"remix_{short_id()}"
    work.mkdir(parents=True, exist_ok=True)

    # เตรียมไฟล์ wav
    _p(0.05, "กำลังเตรียมไฟล์เสียง…")
    src_wav = _to_wav(source_audio, str(work / "_src.wav"))
    beat_wav = _to_wav(beat_audio, str(work / "_beat.wav"))

    # 1) แยก stem
    _p(0.15, "กำลังแยกเสียงร้อง (Demucs)…")
    stems = separate_stems(src_wav, str(work), device=settings.tts_device)
    voc_path = stems["vocals"]

    # 2) วิเคราะห์ BPM/Key
    _p(0.55, "วิเคราะห์ BPM / คีย์…")
    bpm_b, bpm_v = detect_bpm(beat_wav), detect_bpm(src_wav)
    key_b = detect_key(beat_wav)
    ratio = bpm_b / bpm_v
    while ratio > 1.4:
        ratio /= 2
    while ratio < 0.7:
        ratio *= 2

    # โหลด vocal stereo
    v, _ = librosa.load(voc_path, sr=SR, mono=False)
    if v.ndim == 1:
        v = np.stack([v, v])

    # 3) time-stretch ให้ BPM ตรง (ถ้าต่าง)
    if abs(ratio - 1.0) > 0.01:
        v = np.stack([librosa.effects.time_stretch(v[c], rate=ratio) for c in range(2)])

    # 4) auto-tune เข้าคีย์ beat
    if do_autotune:
        _p(0.65, "ปรับเสียงเข้าคีย์ (auto-tune)…")
        v = autotune(v, key_b[2], key_b[1])

    # 5) vocal FX
    if do_fx:
        _p(0.8, "ใส่เอฟเฟกต์เสียงร้อง…")
        v = vocal_fx(v, reverb=reverb, delay=delay)

    # 6) ตัด silence หัว
    mono = librosa.to_mono(v)
    nz = np.where(np.abs(mono) > 0.01)[0]
    if len(nz):
        v = v[:, nz[0]:]

    # 7) offset: auto phase-sync หรือกำหนดเอง
    if offset_ms is None:
        offset = auto_phase_offset(beat_wav, src_wav, bpm_b)
    else:
        offset = int(offset_ms / 1000.0 * SR)

    # 8) มิกซ์
    _p(0.9, "มิกซ์เสียงร้องกับ beat + มาสเตอร์…")
    b, _ = sf.read(beat_wav)
    b = (np.stack([b, b], axis=1).T if b.ndim == 1 else b.T)
    mix = _mix_with_offset(
        b,
        v,
        offset,
        beat_gain_db=beat_gain_db,
        vocal_gain=vocal_gain,
    )

    # 9) มาสเตอร์ (LUFS + peak limit)
    raw = mix.T
    norm, final_lufs = _master_to_target(raw, sample_rate=SR, target_lufs=target_lufs)

    out_path = str(settings.outputs_dir / f"remix_{short_id()}.wav")
    sf.write(out_path, norm, SR)

    return {
        "output": out_path,
        "bpm": {"beat": round(bpm_b, 1), "vocal": round(bpm_v, 1), "stretch": round(ratio, 3)},
        "key": {"beat": f"{key_b[0]} {key_b[1]}"},
        "offset_ms": round(offset / SR * 1000, 1),
        "lufs": round(final_lufs, 1),
        "autotune": do_autotune,
        "fx": do_fx,
    }


# ════════════════════════════════════════════════════════════
#  เบค master FX ลงไฟล์สำเร็จรูป (reverb / echo / compressor)
# ════════════════════════════════════════════════════════════
def apply_master_fx(
    *,
    input_path: str,
    out_path: str,
    reverb: float = 0.0,   # 0..1 wet
    echo: float = 0.0,     # 0..1 delay mix
    comp: bool = False,
) -> str:
    """เบค master FX (reverb/echo/compressor) ลงไฟล์ → out_path."""
    import numpy as np
    import soundfile as sf
    from pedalboard import Pedalboard, Reverb, Delay, Compressor

    data, sr = sf.read(input_path)
    if data.ndim == 1:
        data = np.stack([data, data], axis=1)
    audio = data.T.astype("float32")  # pedalboard wants shape (channels, samples)

    chain = []
    if comp:
        chain.append(Compressor(threshold_db=-18, ratio=3, attack_ms=5, release_ms=180))
    if echo > 0:
        chain.append(Delay(delay_seconds=0.3, feedback=0.32, mix=float(echo) * 0.6))
    if reverb > 0:
        chain.append(Reverb(room_size=0.5, wet_level=float(reverb) * 0.6, dry_level=1.0))
    if not chain:
        # ไม่มี fx → คัดลอกตรงๆ
        sf.write(out_path, data, sr)
        return out_path

    board = Pedalboard(chain)
    out = board(audio, sr)
    sf.write(out_path, out.T, sr)
    return out_path
