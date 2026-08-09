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
# @req FR-04b — remix pipeline: stem split / BPM-key sync / FX / master
# @spec deps GPL (psola/pedalboard) เป็น optional/BYOM เท่านั้น — ดู docs/product/ROADMAP_MUSIC.md
from __future__ import annotations

import subprocess
import sys
from importlib.util import find_spec
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


def parse_key_override(value: str | None) -> tuple[str, str, int] | None:
    if not value:
        return None
    raw = value.strip()
    if not raw:
        return None
    parts = raw.replace("-", " ").split()
    if len(parts) != 2:
        raise ValueError("key_override ต้องอยู่ในรูปแบบเช่น 'C maj' หรือ 'A min'")
    tonic, mode = parts[0].upper(), parts[1].lower()
    if tonic not in _NOTES:
        raise ValueError(f"ไม่รองรับคีย์ {tonic}")
    if mode not in ("maj", "min"):
        raise ValueError("mode ของ key_override ต้องเป็น maj หรือ min")
    return tonic, mode, _NOTES.index(tonic)


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
#  1) แยก stem (Demucs) — คืน path ของ vocals/drums/bass/other (+ instrumental รวม)
# ════════════════════════════════════════════════════════════

# ชื่อ stem ทั้ง 4 ที่ htdemucs แยกให้ (ลำดับ default ของ demucs)
STEM_NAMES = ("vocals", "drums", "bass", "other")


def _optional_install_hint(packages: str) -> str:
    return (
        f"ติดตั้งเพิ่มด้วย `uv pip install {packages}` "
        f"หรือรัน `..\\scripts\\setup_windows.ps1 -InstallOptionalRemixDeps`"
    )


def _require_optional_module(module_name: str, *, packages: str, feature: str) -> None:
    if find_spec(module_name) is not None:
        return
    raise RuntimeError(
        f"ยังไม่ได้ติดตั้ง {module_name} สำหรับ {feature} — {_optional_install_hint(packages)}"
    )


def separate_stems(audio: str, out_dir: str, *, device: str | None = None,
                    full: bool = False) -> dict:
    """แยกเสียงด้วย Demucs (htdemucs).

    full=False (ดีฟอลต์, ใช้ใน run_remix): แยกแบบ two-stems=vocals
        → คืน {"vocals", "instrumental"} เท่านั้น (เร็วกว่า ใช้พอสำหรับ remix vocal↔beat)
    full=True: แยกเต็ม 4 stem (vocals/drums/bass/other) สำหรับ per-stem mixer
        → คืน {"vocals","drums","bass","other","instrumental"} (instrumental = drums+bass+other รวมกัน)
    """
    try:
        import torch  # noqa: F401
    except ImportError as e:  # noqa: BLE001
        raise RuntimeError(
            "ยังไม่ได้ติดตั้ง torch — รัน scripts/setup_windows.ps1 ก่อน"
        ) from e
    _require_optional_module(
        "demucs",
        packages="demucs",
        feature="การแยก stem ของ Remix",
    )
    import torch

    dev = device or ("cuda" if torch.cuda.is_available() else "cpu")
    sep_root = Path(out_dir) / "_sep"
    name = Path(audio).stem

    if full:
        try:
            subprocess.run(
                [sys.executable, "-m", "demucs", "-d", dev,
                 "-o", str(sep_root), audio],
                check=True,
            )
        except subprocess.CalledProcessError as e:
            raise RuntimeError(
                "Demucs รันไม่สำเร็จระหว่างแยก stem เต็ม 4 ทาง"
            ) from e
        torch.cuda.empty_cache()  # ปล่อย VRAM ก่อนขั้นถัดไป
        base = sep_root / "htdemucs" / name
        result = {stem: str(base / f"{stem}.wav") for stem in STEM_NAMES}
        result["instrumental"] = _sum_stems(
            [result["drums"], result["bass"], result["other"]],
            str(base / "no_vocals.wav"),
        )
        return result

    try:
        subprocess.run(
            [sys.executable, "-m", "demucs", "--two-stems=vocals", "-d", dev,
             "-o", str(sep_root), audio],
            check=True,
        )
    except subprocess.CalledProcessError as e:
        raise RuntimeError(
            "Demucs รันไม่สำเร็จระหว่างแยก vocals/instrumental"
        ) from e
    torch.cuda.empty_cache()  # ปล่อย VRAM ก่อนขั้นถัดไป
    base = sep_root / "htdemucs" / name
    return {
        "vocals": str(base / "vocals.wav"),
        "instrumental": str(base / "no_vocals.wav"),
    }


def _sum_stems(paths: list[str], out_path: str) -> str:
    """รวมไฟล์ wav หลายไฟล์เข้าด้วยกัน (สำหรับสร้าง instrumental รวมจาก drums+bass+other)."""
    import soundfile as sf

    mix = None
    sr = SR
    for p in paths:
        data, sr = sf.read(p)
        if data.ndim == 1:
            data = np.stack([data, data], axis=1)
        mix = data if mix is None else mix[:min(len(mix), len(data))] + data[:min(len(mix), len(data))]
    if mix is None:
        raise ValueError("ไม่มีไฟล์ stem ให้รวม")
    sf.write(out_path, mix, sr)
    return out_path


def apply_stem_gains(stems: dict[str, str], gains: dict[str, float], out_dir: str) -> dict[str, str]:
    """โหลดแต่ละ stem, คูณด้วย gain (0..1.5 ต่อ stem), เขียนกลับเป็นไฟล์ใหม่.

    gains: dict ของ {"vocals":1.0, "drums":1.0, "bass":1.0, "other":1.0} — ค่าไหนไม่ระบุ = 1.0 (ไม่เปลี่ยน)
    คืน dict path ของ stem ที่ปรับ gain แล้ว (คีย์เดิมของ STEM_NAMES) — ไม่แก้ "instrumental" ตรงๆ
    (instrumental รวมใหม่จะถูกคำนวณใหม่จาก drums/bass/other ที่ปรับ gain แล้วถ้ามีครบ)
    """
    import soundfile as sf

    out_paths: dict[str, str] = {}
    for stem in STEM_NAMES:
        path = stems.get(stem)
        if not path or not Path(path).exists():
            continue
        gain = float(gains.get(stem, 1.0))
        data, sr = sf.read(path)
        if abs(gain - 1.0) > 1e-6:
            data = data * gain
            gained_path = str(Path(out_dir) / f"_gain_{stem}.wav")
            sf.write(gained_path, data, sr)
            out_paths[stem] = gained_path
        else:
            out_paths[stem] = path

    # ถ้ามี drums/bass/other ครบ (มาจาก full=True) → รวมเป็น instrumental ใหม่หลังปรับ gain
    if all(s in out_paths for s in ("drums", "bass", "other")):
        out_paths["instrumental"] = _sum_stems(
            [out_paths["drums"], out_paths["bass"], out_paths["other"]],
            str(Path(out_dir) / "_gain_instrumental.wav"),
        )
    elif "instrumental" in stems:
        out_paths.setdefault("instrumental", stems["instrumental"])

    return out_paths


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
def autotune(vocal_stereo: np.ndarray, key_idx: int, mode: str, *, strength: float = 1.0) -> np.ndarray:
    """Snap เสียงร้องเข้าคีย์ด้วย psola. ถ้าไม่มี psola (optional/GPL dep) →
    คืนเสียงต้นฉบับโดยไม่แก้พิตช์ (ข้ามขั้น auto-tune) พร้อม log แจ้งเตือน."""
    import librosa

    mix = float(np.clip(strength, 0.0, 1.0))
    if mix <= 0:
        return vocal_stereo

    try:
        import psola
    except ImportError:
        print(
            "⚠️ ไม่พบ psola — ข้ามขั้น auto-tune "
            f"({_optional_install_hint('psola')})"
        )
        return vocal_stereo

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
    tuned = np.stack([
        psola.vocode(vocal_stereo[c].astype(np.float64), sample_rate=SR,
                     target_pitch=target, fmin=fmin, fmax=fmax)
        for c in range(vocal_stereo.shape[0])
    ]).astype(np.float32)
    if mix >= 1:
        return tuned
    return ((vocal_stereo.astype(np.float32) * (1.0 - mix)) + (tuned * mix)).astype(np.float32)


# ════════════════════════════════════════════════════════════
#  4) Vocal FX chain (pedalboard)
# ════════════════════════════════════════════════════════════
def vocal_fx(vocal_stereo: np.ndarray, *, reverb: float = 0.16,
             delay: float = 0.12, comp_ratio: float = 3.5,
             air_db: float = 3.0) -> np.ndarray:
    """EQ → gate → compress → ความใส → delay → reverb (ปรับความแรงได้).

    ถ้าไม่มี pedalboard (optional/GPL dep) → คืนเสียงต้นฉบับโดยไม่ใส่ FX
    (ข้ามขั้นนี้) พร้อม log แจ้งเตือนภาษาไทย.
    """
    try:
        from pedalboard import (Compressor, Delay, Gain, HighpassFilter,
                                HighShelfFilter, LowShelfFilter, NoiseGate,
                                Pedalboard, Reverb)
    except ImportError:
        print(
            "⚠️ ไม่พบ pedalboard — ข้ามขั้นใส่เอฟเฟกต์เสียงร้อง (vocal FX) "
            f"({_optional_install_hint('pedalboard')})"
        )
        return vocal_stereo

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
    """Normalize ไปยัง target LUFS แล้วกันพีคด้วย brickwall limiter (pedalboard.Limiter).

    ลำดับ: วัด LUFS ต้นทาง → ใส่ gain ให้เข้าใกล้ target LUFS (ไม่ scale ตามพีคแบบเดิม
    ที่บีบ dynamics) → ผ่าน limiter เพื่อกัน sample peak เกิน ceiling_db →
    วัด LUFS ผลลัพธ์อีกครั้งเพื่อรายงาน/log.

    ถ้าไม่มี pedalboard (optional/GPL dep) → fallback เป็น peak-scaling แบบเดิม
    (ปลอดภัยแต่ dynamics ถูกบีบกว่า) พร้อม log แจ้งเตือนภาษาไทย.
    """
    import pyloudnorm as pyln

    meter = pyln.Meter(sample_rate)
    ceiling = 10 ** (ceiling_db / 20)
    mastered = stereo_mix.astype(np.float32, copy=True)

    # 1) วัด LUFS ต้นทาง แล้วใส่ gain มุ่งสู่ target (ไม่ยุ่งกับพีคตรงนี้ —
    #    ปล่อยให้ limiter จัดการพีคทีหลัง เพื่อไม่บีบ dynamics ก่อนเวลา)
    loudness_in = float(meter.integrated_loudness(mastered))
    # กันกรณี input เงียบ/เบากว่า gating threshold → pyloudnorm คืน -inf (หรือ nan)
    # ถ้าไม่กัน target_gain_db จะเป็น +inf → mastered *= inf กลายเป็น nan ทั้งไฟล์
    # (np.clip ไม่ล้าง nan) ทำให้ sf.write ได้ไฟล์เสีย — ข้าม gain แล้วปล่อยเงียบต่อ
    if np.isfinite(loudness_in):
        target_gain_db = target_lufs - loudness_in
        mastered *= 10 ** (target_gain_db / 20)

    # 2) กันพีคด้วย brickwall limiter (pedalboard) — เก็บ dynamics ไว้ได้ดีกว่า
    #    peak-scaling หยาบๆ ที่ลดทั้งเพลงตามจุดพีคจุดเดียว
    try:
        from pedalboard import Limiter, Pedalboard

        board = Pedalboard([
            Limiter(threshold_db=ceiling_db, release_ms=100),
        ])
        # pedalboard ต้องการ shape (channels, samples) — stereo_mix ที่รับเข้ามาเป็น
        # (samples, channels) (เช่นจาก mix.T ใน run_remix ที่จะ sf.write ตรงๆ)
        # จึง transpose เข้า/ออกรอบเรียก board() เพื่อความชัดเจนไม่เดา shape
        is_samples_first = mastered.ndim == 2 and mastered.shape[1] in (1, 2) and mastered.shape[0] != mastered.shape[1]
        board_input = np.ascontiguousarray(mastered.T if is_samples_first else mastered)
        board_output = board(board_input, sample_rate)
        mastered = np.ascontiguousarray(board_output.T if is_samples_first else board_output)
    except ImportError:
        # pedalboard ไม่มี (optional/GPL dep) → fallback peak-scale แบบเดิมกันพังตรงนี้
        print(
            "⚠️ ไม่พบ pedalboard — ใช้ peak-scaling สำรองแทน brickwall limiter "
            f"({_optional_install_hint('pedalboard')})"
        )
        peak = float(np.max(np.abs(mastered)))
        if peak > ceiling:
            mastered *= ceiling / peak

    # กันพีคหลุดเพดานแบบ hard-clip เผื่อกรณี extreme (safety net)
    # Limiting can move integrated loudness away from the target, so correct
    # once after limiting and then enforce the configured peak ceiling.
    loudness_after_limit = float(meter.integrated_loudness(mastered))
    if np.isfinite(loudness_after_limit):
        correction_db = target_lufs - loudness_after_limit
        mastered *= 10 ** (correction_db / 20)

    peak = float(np.max(np.abs(mastered)))
    if peak > ceiling:
        mastered *= ceiling / peak

    # Final safety clip at the requested ceiling, not full scale.
    np.clip(mastered, -ceiling, ceiling, out=mastered)

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
    autotune_strength: float = 1.0,
    key_override: str | None = None,
    do_fx: bool = True,
    phrase_bars: int = 0,
    offset_ms: float | None = None,   # None = auto phase-sync, ตัวเลข = กำหนดเอง
    beat_gain_db: float = -2.0,
    vocal_gain: float = 0.95,
    reverb: float = 0.16,
    delay: float = 0.12,
    stem_gains: dict[str, float] | None = None,   # {"vocals","drums","bass","other"} 0..1.5 ต่อ stem, ดีฟอลต์ 1.0
    progress=None,   # callable(frac: float, msg: str) — รายงานความคืบหน้า (optional)
) -> dict:
    """แยกเสียงร้องจาก source → autotune/FX → วางบน beat → มาสเตอร์.

    offset_ms: เลื่อนเสียงร้อง (มิลลิวินาที). None = หา phase อัตโนมัติ.
               ค่าบวก = เลื่อนช้าลง (ขวา). ใช้ปรับ manual ให้เนียนสุด.
    stem_gains: ถ้าระบุ (dict ใดๆ ที่ไม่ว่าง) → แยก stem เต็ม 4 ทาง (vocals/drums/bass/other)
                แล้วคูณ gain แต่ละ stem ก่อนรวมเป็น instrumental/vocal สำหรับมิกซ์ต่อ.
                ถ้าไม่ระบุ (None หรือ {}) → ใช้ two-stems=vocals แบบเดิม (เร็วกว่า, ไม่มี per-stem control)
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

    # 1) แยก stem — ถ้ามี stem_gains ระบุมา ให้แยกเต็ม 4 ทาง (vocals/drums/bass/other)
    #    เพื่อคูณ gain แยกแต่ละ stem ได้ (per-stem mixer, WP 3.4) ไม่งั้นใช้ two-stems แบบเดิม (เร็วกว่า)
    want_full = bool(stem_gains)
    _p(0.15, "กำลังแยกเสียงร้อง (Demucs)…" if not want_full else "กำลังแยก stem (Demucs, เต็ม 4 ทาง)…")
    stems = separate_stems(src_wav, str(work), device=settings.tts_device, full=want_full)

    if want_full:
        stems = apply_stem_gains(stems, stem_gains or {}, str(work))

    voc_path = stems["vocals"]

    # 2) วิเคราะห์ BPM/Key
    _p(0.55, "วิเคราะห์ BPM / คีย์…")
    bpm_b, bpm_v = detect_bpm(beat_wav), detect_bpm(src_wav)
    key_b = detect_key(beat_wav)
    target_key = parse_key_override(key_override) or key_b
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

    # 4) auto-tune เข้าคีย์ beat (ถ้าไม่มี psola จะข้ามขั้นนี้ให้อัตโนมัติ — ดู autotune())
    autotune_strength = float(np.clip(autotune_strength, 0.0, 1.0))
    if do_autotune and autotune_strength > 0:
        _p(0.65, "ปรับเสียงเข้าคีย์ (auto-tune)…")
        v = autotune(v, target_key[2], target_key[1], strength=autotune_strength)

    # 5) vocal FX (ถ้าไม่มี pedalboard จะข้ามขั้นนี้ให้อัตโนมัติ — ดู vocal_fx())
    if do_fx:
        _p(0.8, "ใส่เอฟเฟกต์เสียงร้อง…")
        v = vocal_fx(v, reverb=reverb, delay=delay)

    # 6) ตัด silence หัว
    mono = librosa.to_mono(v)
    nz = np.where(np.abs(mono) > 0.01)[0]
    if len(nz):
        v = v[:, nz[0]:]

    # 7) offset: auto phase-sync หรือกำหนดเอง
    phrase_bars = max(0, int(phrase_bars))
    phrase_offset = int(phrase_bars * 4 * (60.0 / bpm_b) * SR)
    if offset_ms is None:
        offset = auto_phase_offset(beat_wav, src_wav, bpm_b) + phrase_offset
    else:
        offset = int(offset_ms / 1000.0 * SR) + phrase_offset

    # 8) มิกซ์
    _p(0.9, "มิกซ์เสียงร้องกับ beat + มาสเตอร์…")
    b, _ = sf.read(beat_wav)
    b = (np.stack([b, b], axis=1).T if b.ndim == 1 else b.T)
    source_inst_active = bool(stem_gains) and any(
        abs(float((stem_gains or {}).get(name, 1.0)) - 1.0) > 1e-6
        for name in ("drums", "bass", "other")
    )
    if source_inst_active and stems.get("instrumental"):
        src_inst, _ = sf.read(stems["instrumental"])
        src_inst = (np.stack([src_inst, src_inst], axis=1).T if src_inst.ndim == 1 else src_inst.T).astype(np.float32)
        total_len = max(b.shape[1], src_inst.shape[1])
        beat_mix = np.zeros((2, total_len), dtype=np.float32)
        beat_mix[:, :b.shape[1]] += b.astype(np.float32)
        beat_mix[:, :src_inst.shape[1]] += src_inst
        b = beat_mix
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
        "key": {
            "beat": f"{key_b[0]} {key_b[1]}",
            "target": f"{target_key[0]} {target_key[1]}",
            "override": key_override,
        },
        "offset_ms": round(offset / SR * 1000, 1),
        "phrase_bars": phrase_bars,
        "lufs": round(final_lufs, 1),
        "autotune": do_autotune,
        "autotune_strength": autotune_strength,
        "fx": do_fx,
        "stem_gains": stem_gains or None,
        "source_instrumental_layered": source_inst_active,
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
    """เบค master FX (reverb/echo/compressor) ลงไฟล์ → out_path.

    ถ้าไม่มี pedalboard (optional/GPL dep) → ข้ามการใส่ FX ทั้งหมด แล้วคัดลอก
    ไฟล์ต้นฉบับไปยัง out_path ตรงๆ พร้อม log แจ้งเตือนภาษาไทย.
    """
    import numpy as np
    import soundfile as sf

    data, sr = sf.read(input_path)
    if data.ndim == 1:
        data = np.stack([data, data], axis=1)

    want_fx = comp or echo > 0 or reverb > 0
    if not want_fx:
        sf.write(out_path, data, sr)
        return out_path

    try:
        from pedalboard import Pedalboard, Reverb, Delay, Compressor
    except ImportError:
        print(
            "⚠️ ไม่พบ pedalboard — ข้ามการใส่ master FX (reverb/echo/compressor) "
            f"({_optional_install_hint('pedalboard')}) — คัดลอกไฟล์ต้นฉบับแทน"
        )
        sf.write(out_path, data, sr)
        return out_path

    audio = data.T.astype("float32")  # pedalboard wants shape (channels, samples)

    chain = []
    if comp:
        chain.append(Compressor(threshold_db=-18, ratio=3, attack_ms=5, release_ms=180))
    if echo > 0:
        chain.append(Delay(delay_seconds=0.3, feedback=0.32, mix=float(echo) * 0.6))
    if reverb > 0:
        chain.append(Reverb(room_size=0.5, wet_level=float(reverb) * 0.6, dry_level=1.0))

    board = Pedalboard(chain)
    out = board(audio, sr)
    sf.write(out_path, out.T, sr)
    return out_path
