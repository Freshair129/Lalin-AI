"""TTS + Voice Cloning — สังเคราะห์เสียงพูดจากข้อความ โดยโคลนเสียงจากตัวอย่าง

เอนจิน:
  • f5   → F5-TTS (รองรับไทยดีมากผ่านโมเดล VIZINTZOR/F5-TTS-THAI) เป็นค่าเริ่มต้น
  • xtts → Coqui XTTS v2 (อังกฤษ/หลายภาษา; *ไม่รองรับไทยอย่างเป็นทางการ*)

โหลดโมเดลแบบ lazy + cache
"""
# @req FR-02 — เอนจิน F5-TTS หลัก + XTTS สำรอง + fallback ไทย (FR-02.3/02.4/02.5)
# @req NFR-01 — เป้า inference <= 15 วินาที/ประโยคบน GPU (NFR-01.2)
from __future__ import annotations

import gc
import importlib
from pathlib import Path

from ..config import get_settings
from ..runtime_devices import resolve_tts_runtime

_f5 = None
_xtts = None
CUDA_RELEASE_RESIDUAL_TOLERANCE_BYTES = 128 * 1024 * 1024


def selected_engine(language: str, engine: str | None = None) -> str:
    """Return the engine the synthesis path will actually use."""
    selected = engine or get_settings().tts_engine
    if language == "th" and selected == "xtts":
        return "f5"
    return selected


def has_cached_model(engine: str) -> bool:
    if engine == "f5":
        return _f5 is not None
    if engine == "xtts":
        return _xtts is not None
    raise ValueError(f"unsupported TTS engine: {engine}")


def cached_model_identity(engine: str) -> int | None:
    """Return an identity token without keeping another strong model reference."""
    if engine == "f5":
        model = _f5
    elif engine == "xtts":
        model = _xtts
    else:
        raise ValueError(f"unsupported TTS engine: {engine}")
    return id(model) if model is not None else None


def cuda_memory_allocated(*, torch_module=None) -> int | None:
    """Synchronize and snapshot current-device live allocations for release checks."""
    if torch_module is None:
        try:
            torch_module = importlib.import_module("torch")
        except ImportError:
            return None
    cuda = getattr(torch_module, "cuda", None)
    if cuda is None or not cuda.is_available():
        return None
    cuda.synchronize()
    return int(cuda.memory_allocated())


def verify_no_model_loaded_by_job(
    engine: str,
    baseline_allocated: int | None,
    *,
    torch_module=None,
    collect=gc.collect,
) -> dict[str, str | None]:
    """Verify a failed/short-circuited load left neither cache nor new CUDA allocations."""
    if has_cached_model(engine):
        return {"status": "unknown", "reason": "model_cache_still_populated"}

    cuda = None
    cuda_ready = False
    verification_error = None
    if torch_module is None:
        try:
            torch_module = importlib.import_module("torch")
        except ImportError:
            verification_error = "cuda_runtime_unavailable"

    if torch_module is not None:
        try:
            cuda = getattr(torch_module, "cuda", None)
            cuda_ready = cuda is not None and bool(cuda.is_available())
            if not cuda_ready:
                verification_error = "cuda_runtime_unavailable"
            else:
                cuda.synchronize()
        except Exception:  # noqa: BLE001
            verification_error = "cuda_release_verification_failed"

    try:
        collect()
    except Exception:  # noqa: BLE001
        verification_error = verification_error or "cuda_release_verification_failed"

    if cuda_ready:
        try:
            cuda.empty_cache()
            cuda.synchronize()
        except Exception:  # noqa: BLE001
            verification_error = verification_error or "cuda_release_verification_failed"

    try:
        if has_cached_model(engine):
            return {"status": "unknown", "reason": "model_cache_still_populated"}
        if verification_error is not None:
            return {"status": "unknown", "reason": verification_error}
        if baseline_allocated is None:
            return {"status": "unknown", "reason": "cuda_baseline_unavailable"}
        if (
            int(cuda.memory_allocated())
            > baseline_allocated + CUDA_RELEASE_RESIDUAL_TOLERANCE_BYTES
        ):
            return {"status": "unknown", "reason": "cuda_allocations_above_baseline"}
        return {"status": "not_applicable", "reason": "model_not_loaded_by_job"}
    except Exception:  # noqa: BLE001
        return {"status": "unknown", "reason": "cuda_release_verification_failed"}


def release_cached_model(
    engine: str,
    expected_identity: int,
    baseline_allocated: int | None,
    *,
    torch_module=None,
    collect=gc.collect,
) -> dict[str, str | None]:
    """Drop only the expected Lalin cache entry and verify CUDA live memory."""
    global _f5, _xtts

    if cached_model_identity(engine) != expected_identity:
        return {"status": "unknown", "reason": "model_cache_changed"}

    cuda = None
    cuda_ready = False
    verification_error = None
    if torch_module is None:
        try:
            torch_module = importlib.import_module("torch")
        except ImportError:
            verification_error = "cuda_runtime_unavailable"

    if torch_module is not None:
        try:
            cuda = getattr(torch_module, "cuda", None)
            cuda_ready = cuda is not None and bool(cuda.is_available())
            if not cuda_ready:
                verification_error = "cuda_runtime_unavailable"
            else:
                cuda.synchronize()
        except Exception:  # noqa: BLE001
            verification_error = "cuda_release_verification_failed"

    # Check identity again immediately before clearing in case another caller
    # changed the module cache while CUDA synchronization ran.
    if cached_model_identity(engine) != expected_identity:
        return {"status": "unknown", "reason": "model_cache_changed"}
    if engine == "f5":
        _f5 = None
    elif engine == "xtts":
        _xtts = None
    else:
        return {"status": "unknown", "reason": "unsupported_engine"}

    try:
        collect()
    except Exception:  # noqa: BLE001
        verification_error = verification_error or "cuda_release_verification_failed"

    if cuda_ready:
        try:
            cuda.empty_cache()
            cuda.synchronize()
        except Exception:  # noqa: BLE001
            verification_error = verification_error or "cuda_release_verification_failed"

    try:
        if has_cached_model(engine):
            return {"status": "unknown", "reason": "model_cache_still_populated"}
        if verification_error is not None:
            return {"status": "unknown", "reason": verification_error}
        if baseline_allocated is None:
            return {"status": "unknown", "reason": "cuda_baseline_unavailable"}
        allocated = int(cuda.memory_allocated())
        residual = allocated - baseline_allocated
        if residual > CUDA_RELEASE_RESIDUAL_TOLERANCE_BYTES:
            return {"status": "unknown", "reason": "cuda_allocations_above_baseline"}
        reason = "cuda_runtime_residual_within_tolerance" if residual > 0 else None
        return {"status": "released", "reason": reason}
    except Exception:  # noqa: BLE001
        return {"status": "unknown", "reason": "cuda_release_verification_failed"}


# ════════════════════════════════════════════════════════════
#  F5-TTS (เสียงไทย/อังกฤษ — แนะนำ)
# ════════════════════════════════════════════════════════════
def _get_f5():
    """โหลดโมเดล F5-TTS ไทย (VIZINTZOR/F5-TTS-THAI) — รองรับทั้งไทยและอังกฤษ

    โมเดลต่อยอดจาก SWivid/F5-TTS → สถาปัตยกรรม F5TTS_Base (vocos)
    ดาวน์โหลด checkpoint (~1.3GB) + vocab อัตโนมัติครั้งแรกผ่าน cached_path
    """
    global _f5
    if _f5 is None:
        try:
            from cached_path import cached_path
            from f5_tts.api import F5TTS
        except ImportError as e:  # noqa: BLE001
            raise RuntimeError(
                "ยังไม่ได้ติดตั้ง f5-tts — ดู scripts/setup_windows.ps1"
            ) from e
        s = get_settings()
        device = resolve_tts_runtime(s.tts_device).effective
        repo = s.f5_model_repo  # VIZINTZOR/F5-TTS-THAI
        ckpt = str(cached_path(f"hf://{repo}/model_1000000.pt"))
        vocab = str(cached_path(f"hf://{repo}/vocab.txt"))
        _f5 = F5TTS(
            model="F5TTS_Base",
            ckpt_file=ckpt,
            vocab_file=vocab,
            device=device,
        )
    return _f5


def _f5_synth(
    text: str, ref_audio: str, ref_text: str, out_path: str, speed: float
) -> str:
    model = _get_f5()
    model.infer(
        ref_file=ref_audio,
        ref_text=ref_text,      # ข้อความที่ตรงกับ ref_audio ("" = ให้ ASR เดาเอง)
        gen_text=text,
        file_wave=out_path,
        speed=speed,
        remove_silence=True,
    )
    return out_path


# ════════════════════════════════════════════════════════════
#  XTTS v2 (fallback หลายภาษา)
# ════════════════════════════════════════════════════════════
def _get_xtts():
    global _xtts
    if _xtts is None:
        try:
            from TTS.api import TTS
        except ImportError as e:  # noqa: BLE001
            raise RuntimeError("ยังไม่ได้ติดตั้ง TTS (Coqui) — ดู setup script") from e
        s = get_settings()
        device = resolve_tts_runtime(s.tts_device).effective
        _xtts = TTS("tts_models/multilingual/multi-dataset/xtts_v2").to(device)
    return _xtts


def _xtts_synth(
    text: str, ref_audio: str, out_path: str, language: str, speed: float
) -> str:
    model = _get_xtts()
    # XTTS ใช้รหัสภาษา ISO; ไม่มี th → เตือนผู้เรียก
    lang = "en" if language not in _XTTS_LANGS else language
    model.tts_to_file(
        text=text, speaker_wav=ref_audio, language=lang,
        file_path=out_path, speed=speed,
    )
    return out_path


_XTTS_LANGS = {
    "en", "es", "fr", "de", "it", "pt", "pl", "tr", "ru", "nl",
    "cs", "ar", "zh-cn", "ja", "hu", "ko", "hi",
}


# ════════════════════════════════════════════════════════════
#  Public API
# ════════════════════════════════════════════════════════════
def synthesize(
    text: str,
    out_path: str,
    *,
    ref_audio: str,
    ref_text: str = "",
    language: str = "th",
    speed: float = 1.0,
    engine: str | None = None,
) -> str:
    """สังเคราะห์เสียง 1 ประโยค/ก้อน คืน path ไฟล์ wav

    ref_audio = ตัวอย่างเสียงที่จะโคลน (สำคัญที่สุด, 6-15 วินาทีกำลังดี)
    """
    Path(out_path).parent.mkdir(parents=True, exist_ok=True)
    engine = selected_engine(language, engine)

    if engine == "f5":
        return _f5_synth(text, ref_audio, ref_text, out_path, speed)
    return _xtts_synth(text, ref_audio, out_path, language, speed)
