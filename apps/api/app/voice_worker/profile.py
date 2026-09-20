"""Approved profile manifest — LVP-REQ-007/008/017 (fail-closed).

worker เริ่มได้เฉพาะเมื่อ manifest ผ่านทุกข้อ:
  • ``device`` explicit (``cpu`` หรือ ``cuda:N``) — ห้าม ``auto``
  • ``engine`` อยู่ใน allowlist (``stub``, ``faster-whisper``) — faster-whisper ต้อง kind=asr, compute_type ที่รู้จัก และ pin model.bin/config.json
  • assets ทุกชิ้นมี path + sha256 และตรวจตรง (ไม่มี network fetch)
  • TTS preset ทุกตัวมี ``ref_text`` ไม่ว่าง (กัน hidden reference-ASR) และ ``rights_status`` ที่รู้จัก
"""
from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from .contract import ID_PATTERN

ALLOWED_ENGINES = frozenset({"stub", "faster-whisper"})  # Slice B TTS จะเพิ่ม "f5" หลัง D9
FASTER_WHISPER_COMPUTE_TYPES = frozenset({"int8", "int8_float16", "float16", "float32"})
FASTER_WHISPER_REQUIRED_ASSETS = ("model.bin", "config.json")
DEVICE_RE = re.compile(r"^(cpu|cuda:\d+)$")
ID_RE = re.compile(ID_PATTERN)
ASR_LANGUAGES = frozenset({"th", "en", "auto"})
TTS_LANGUAGES = frozenset({"th", "en"})
RIGHTS_STATUSES = frozenset({"approved", "stub-synthetic"})
DEFAULT_ASR_FORMATS = ("audio/wav", "audio/x-wav", "audio/mpeg", "audio/ogg", "audio/flac", "audio/mp4")
DEFAULT_TTS_OUTPUT_FORMATS = ("wav",)


class ProfileError(ValueError):
    """manifest ไม่ผ่าน → process ต้อง exit non-zero ไม่ fallback."""


@dataclass(frozen=True)
class Limits:
    max_audio_bytes: int = 10 * 1024 * 1024
    max_audio_seconds: float = 60.0
    max_text_code_points: int = 800
    max_output_seconds: float = 60.0
    speed_min: float = 1.0
    speed_max: float = 1.0

    def as_dict(self) -> dict[str, Any]:
        return {
            "max_audio_bytes": self.max_audio_bytes,
            "max_audio_seconds": self.max_audio_seconds,
            "max_text_code_points": self.max_text_code_points,
            "max_output_seconds": self.max_output_seconds,
            "speed_min": self.speed_min,
            "speed_max": self.speed_max,
        }


@dataclass(frozen=True)
class VoicePreset:
    preset_id: str
    revision: str
    language: str
    ref_text: str
    rights_status: str
    ref_audio: str | None = None

    def public(self) -> dict[str, Any]:
        # ไม่เผย ref_text/ref_audio path ผ่าน describe (data minimization)
        return {
            "voice_preset_id": self.preset_id,
            "voice_revision": self.revision,
            "language": self.language,
            "rights_status": self.rights_status,
        }


@dataclass(frozen=True)
class AssetPin:
    role: str
    path: str
    sha256: str


@dataclass(frozen=True)
class ProfileManifest:
    profile_id: str
    profile_revision: str
    kind: str
    runtime_id: str
    physical_resource_id: str
    device: str
    engine: str
    engine_options: dict[str, Any] = field(default_factory=dict)
    languages: tuple[str, ...] = ()
    accepted_audio_formats: tuple[str, ...] = ()
    output_formats: tuple[str, ...] = ()
    limits: Limits = field(default_factory=Limits)
    max_concurrency: int = 1
    voices: tuple[VoicePreset, ...] = ()
    assets: tuple[AssetPin, ...] = ()
    manifest_sha256: str = ""
    source_path: str | None = None

    def voice(self, preset_id: str, revision: str) -> VoicePreset | None:
        for voice in self.voices:
            if voice.preset_id == preset_id and voice.revision == revision:
                return voice
        return None

    def describe(self) -> dict[str, Any]:
        return {
            "profile_id": self.profile_id,
            "profile_revision": self.profile_revision,
            "kind": self.kind,
            "engine": self.engine,
            "languages": list(self.languages),
            "accepted_audio_formats": list(self.accepted_audio_formats) if self.kind == "asr" else [],
            "output_formats": list(self.output_formats) if self.kind == "tts" else [],
            "limits": self.limits.as_dict(),
            "max_concurrency": self.max_concurrency,
            "voices": [voice.public() for voice in self.voices],
            "assets": [{"role": asset.role, "sha256": asset.sha256} for asset in self.assets],
            "manifest_sha256": self.manifest_sha256,
        }


def _require(data: dict[str, Any], key: str, kind: type | tuple[type, ...]) -> Any:
    if key not in data:
        raise ProfileError(f"manifest ขาดฟิลด์ '{key}'")
    value = data[key]
    if not isinstance(value, kind):
        raise ProfileError(f"ฟิลด์ '{key}' ต้องเป็นชนิด {kind}")
    return value


def _id(data: dict[str, Any], key: str) -> str:
    value = _require(data, key, str)
    if not ID_RE.match(value):
        raise ProfileError(f"ฟิลด์ '{key}' ต้องตรง pattern {ID_PATTERN}")
    return value


def _limits(raw: Any) -> Limits:
    if raw is None:
        return Limits()
    if not isinstance(raw, dict):
        raise ProfileError("'limits' ต้องเป็น object")
    defaults = Limits()
    values: dict[str, Any] = {}
    for name in ("max_audio_bytes", "max_text_code_points"):
        value = raw.get(name, getattr(defaults, name))
        if not isinstance(value, int) or isinstance(value, bool) or value <= 0:
            raise ProfileError(f"limits.{name} ต้องเป็นจำนวนเต็มบวก")
        values[name] = value
    for name in ("max_audio_seconds", "max_output_seconds", "speed_min", "speed_max"):
        value = raw.get(name, getattr(defaults, name))
        if isinstance(value, bool) or not isinstance(value, (int, float)) or value <= 0:
            raise ProfileError(f"limits.{name} ต้องเป็นจำนวนบวก")
        values[name] = float(value)
    if values["max_audio_bytes"] > Limits.max_audio_bytes:
        raise ProfileError("limits.max_audio_bytes เกินเพดาน PRP 10 MiB")
    if values["max_audio_seconds"] > Limits.max_audio_seconds:
        raise ProfileError("limits.max_audio_seconds เกินเพดาน PRP 60 s")
    if values["max_text_code_points"] > Limits.max_text_code_points:
        raise ProfileError("limits.max_text_code_points เกินเพดาน PRP 800")
    if values["max_output_seconds"] > Limits.max_output_seconds:
        raise ProfileError("limits.max_output_seconds เกินเพดาน PRP 60 s")
    if not (0.5 <= values["speed_min"] <= values["speed_max"] <= 1.5):
        raise ProfileError("limits.speed_min/speed_max ต้องอยู่ใน 0.5–1.5 และ min ≤ max (FR-02.6)")
    return Limits(**values)


def _voices(raw: Any, languages: frozenset[str]) -> tuple[VoicePreset, ...]:
    if not isinstance(raw, list) or not raw:
        raise ProfileError("profile kind=tts ต้องมี 'voices' อย่างน้อยหนึ่ง preset")
    voices: list[VoicePreset] = []
    seen: set[tuple[str, str]] = set()
    for item in raw:
        if not isinstance(item, dict):
            raise ProfileError("voices[] ต้องเป็น object")
        preset_id = _id(item, "voice_preset_id")
        revision = _require(item, "voice_revision", str)
        if not revision:
            raise ProfileError(f"preset {preset_id} ขาด voice_revision")
        language = _require(item, "language", str)
        if language not in languages:
            raise ProfileError(f"preset {preset_id} ใช้ภาษา {language} ที่ profile ไม่รองรับ")
        ref_text = _require(item, "ref_text", str)
        if not ref_text.strip():
            raise ProfileError(
                f"preset {preset_id} มี ref_text ว่าง — profile ไม่ qualify (ห้าม reference-ASR แอบเพิ่ม, LVP-REQ-017)"
            )
        rights = _require(item, "rights_status", str)
        if rights not in RIGHTS_STATUSES:
            raise ProfileError(f"preset {preset_id} rights_status '{rights}' ไม่รู้จัก — ต้องเป็น {sorted(RIGHTS_STATUSES)}")
        ref_audio = item.get("ref_audio")
        if ref_audio is not None and not isinstance(ref_audio, str):
            raise ProfileError(f"preset {preset_id} ref_audio ต้องเป็น path string")
        key = (preset_id, revision)
        if key in seen:
            raise ProfileError(f"preset {preset_id}@{revision} ซ้ำ")
        seen.add(key)
        voices.append(VoicePreset(preset_id, revision, language, ref_text, rights, ref_audio))
    return tuple(voices)


def _assets(raw: Any, base_dir: Path | None, verify: bool) -> tuple[AssetPin, ...]:
    if raw is None:
        return ()
    if not isinstance(raw, list):
        raise ProfileError("'assets' ต้องเป็น list")
    pins: list[AssetPin] = []
    for item in raw:
        if not isinstance(item, dict):
            raise ProfileError("assets[] ต้องเป็น object")
        role = _require(item, "role", str)
        path = _require(item, "path", str)
        digest = _require(item, "sha256", str).lower()
        if not re.fullmatch(r"[0-9a-f]{64}", digest):
            raise ProfileError(f"asset {role} sha256 ไม่ถูกต้อง")
        if verify:
            resolved = Path(path)
            if not resolved.is_absolute() and base_dir is not None:
                resolved = base_dir / resolved
            if not resolved.is_file():
                raise ProfileError(f"asset {role} ไม่พบที่ {resolved} (MODEL_UNAVAILABLE — ไม่ดาวน์โหลดเอง)")
            actual = hashlib.sha256(resolved.read_bytes()).hexdigest()
            if actual != digest:
                raise ProfileError(f"asset {role} checksum ไม่ตรง manifest (PROFILE_MISMATCH)")
            path = str(resolved)
        pins.append(AssetPin(role, path, digest))
    return tuple(pins)


def manifest_from_dict(
    data: dict[str, Any],
    *,
    manifest_sha256: str = "",
    source_path: str | None = None,
    base_dir: Path | None = None,
    verify_assets: bool = True,
) -> ProfileManifest:
    if not isinstance(data, dict):
        raise ProfileError("manifest ต้องเป็น JSON object")
    kind = _require(data, "kind", str)
    if kind not in {"asr", "tts"}:
        raise ProfileError("kind ต้องเป็น 'asr' หรือ 'tts'")
    device = _require(data, "device", str)
    if not DEVICE_RE.match(device):
        raise ProfileError("device ต้องเป็น 'cpu' หรือ 'cuda:N' อย่างชัดเจน — ห้าม 'auto' (LVP-REQ-011)")
    engine = _require(data, "engine", str)
    if engine not in ALLOWED_ENGINES:
        raise ProfileError(f"engine '{engine}' ไม่อยู่ใน allowlist {sorted(ALLOWED_ENGINES)}")
    engine_options = data.get("engine_options") or {}
    if not isinstance(engine_options, dict):
        raise ProfileError("engine_options ต้องเป็น object")
    languages_raw = _require(data, "languages", list)
    if not languages_raw or not all(isinstance(lang, str) for lang in languages_raw):
        raise ProfileError("languages ต้องเป็น list ของ string ที่ไม่ว่าง")
    allowed_langs = ASR_LANGUAGES if kind == "asr" else TTS_LANGUAGES
    bad = sorted(set(languages_raw) - allowed_langs)
    if bad:
        raise ProfileError(f"languages {bad} ไม่รองรับสำหรับ {kind}")
    max_concurrency = data.get("max_concurrency", 1)
    if not isinstance(max_concurrency, int) or isinstance(max_concurrency, bool) or max_concurrency < 1:
        raise ProfileError("max_concurrency ต้องเป็นจำนวนเต็ม ≥ 1")
    limits = _limits(data.get("limits"))
    accepted = tuple(data.get("accepted_audio_formats") or DEFAULT_ASR_FORMATS)
    outputs = tuple(data.get("output_formats") or DEFAULT_TTS_OUTPUT_FORMATS)
    if kind == "tts" and any(fmt not in {"wav", "mp3"} for fmt in outputs):
        raise ProfileError("output_formats รองรับเฉพาะ wav/mp3")
    voices = _voices(data.get("voices"), frozenset(languages_raw)) if kind == "tts" else ()
    assets = _assets(data.get("assets"), base_dir, verify_assets)
    if engine == "faster-whisper":
        _check_faster_whisper(kind, device, engine_options, assets)
    return ProfileManifest(
        profile_id=_id(data, "profile_id"),
        profile_revision=_require(data, "profile_revision", str) or _fail("profile_revision ว่าง"),
        kind=kind,
        runtime_id=_id(data, "runtime_id"),
        physical_resource_id=_id(data, "physical_resource_id"),
        device=device,
        engine=engine,
        engine_options=dict(engine_options),
        languages=tuple(languages_raw),
        accepted_audio_formats=accepted,
        output_formats=outputs,
        limits=limits,
        max_concurrency=max_concurrency,
        voices=voices,
        assets=assets,
        manifest_sha256=manifest_sha256,
        source_path=source_path,
    )


def _fail(message: str) -> str:
    raise ProfileError(message)


def _check_faster_whisper(kind: str, device: str, options: dict[str, Any], assets: tuple[AssetPin, ...]) -> None:
    if kind != "asr":
        raise ProfileError("engine faster-whisper รองรับเฉพาะ kind=asr")
    compute = options.get("compute_type")
    if compute not in FASTER_WHISPER_COMPUTE_TYPES:
        raise ProfileError(f"engine_options.compute_type ต้องเป็นหนึ่งใน {sorted(FASTER_WHISPER_COMPUTE_TYPES)} (ห้ามว่าง/auto)")
    if device == "cpu" and compute in {"float16", "int8_float16"}:
        raise ProfileError(f"compute_type {compute} ใช้บน cpu ไม่ได้ — ใช้ int8 หรือ float32")
    beam = options.get("beam_size", 5)
    if not isinstance(beam, int) or isinstance(beam, bool) or not (1 <= beam <= 10):
        raise ProfileError("engine_options.beam_size ต้องเป็นจำนวนเต็ม 1–10")
    threads = options.get("cpu_threads", 0)
    if not isinstance(threads, int) or isinstance(threads, bool) or threads < 0:
        raise ProfileError("engine_options.cpu_threads ต้องเป็นจำนวนเต็ม ≥ 0")
    roles = {asset.role for asset in assets}
    missing = [role for role in FASTER_WHISPER_REQUIRED_ASSETS if role not in roles]
    if missing:
        raise ProfileError(f"engine faster-whisper ต้อง pin assets {missing} (MODEL_UNAVAILABLE — ไม่ดาวน์โหลดเอง)")
    parents = {str(Path(asset.path).parent) for asset in assets}
    if len(parents) != 1:
        raise ProfileError("assets ของ faster-whisper ต้องอยู่ใน directory เดียวกัน (CTranslate2 โหลดทั้งโฟลเดอร์)")


def load_manifest(path: Path | str | None, *, verify_assets: bool = True) -> ProfileManifest:
    if path is None:
        raise ProfileError("ไม่ได้ตั้ง LALIN_VOICE_WORKER_PROFILE_PATH — worker ไม่มี default profile (fail-closed)")
    manifest_path = Path(path)
    if not manifest_path.is_file():
        raise ProfileError(f"ไม่พบ profile manifest ที่ {manifest_path}")
    raw = manifest_path.read_bytes()
    try:
        data = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ProfileError(f"profile manifest ไม่ใช่ JSON ที่อ่านได้: {exc.__class__.__name__}") from None
    return manifest_from_dict(
        data,
        manifest_sha256=hashlib.sha256(raw).hexdigest(),
        source_path=str(manifest_path),
        base_dir=manifest_path.parent,
        verify_assets=verify_assets,
    )


__all__ = [
    "ALLOWED_ENGINES",
    "FASTER_WHISPER_COMPUTE_TYPES",
    "AssetPin",
    "Limits",
    "ProfileError",
    "ProfileManifest",
    "VoicePreset",
    "load_manifest",
    "manifest_from_dict",
]
