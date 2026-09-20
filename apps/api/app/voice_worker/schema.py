"""JSON Schema export for the voice worker contract — decision D12.

pydantic models ใน ``contract.py`` เป็น source of truth เสมอ — ไฟล์นี้แค่ประกอบ schema เดียว
(draft 2020-12) จากโมเดลเหล่านั้น แล้วเขียนไปที่ ``packages/contracts/schemas/lalin-voice-worker.schema.json``
ห้ามแก้ไฟล์ ``.schema.json`` นั้นด้วยมือ — แก้ ``contract.py`` แล้วรัน ``--write`` ใหม่เสมอ

ใช้งาน::

    python -m app.voice_worker.schema --check   # CI/เทสต์: fail ถ้าไฟล์ที่ commit ไม่ตรงกับโมเดลปัจจุบัน
    python -m app.voice_worker.schema --write    # regenerate หลังแก้ contract.py
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from pydantic import TypeAdapter

from . import contract

SCHEMA_ID = "https://lalin.ai/schemas/lalin-voice-worker.schema.json"
SCHEMA_TITLE = f"Lalin Voice Worker Contract {contract.CONTRACT_VERSION}"

# apps/api/app/voice_worker/schema.py → parents[4] = repo root (เหมือน settings.py:_repo_root)
REPO_ROOT = Path(__file__).resolve().parents[4]
SCHEMA_PATH = REPO_ROOT / "packages" / "contracts" / "schemas" / "lalin-voice-worker.schema.json"

# ชื่อ def → โมเดล; ต้องครบตามที่ D12 ระบุ (InvocationEnvelope ประกอบแยกต่างหากด้านล่างเพราะเป็น
# discriminated union ไม่ใช่ BaseModel เดี่ยว)
_TOP_LEVEL_MODELS: tuple[tuple[str, Any], ...] = (
    ("OperationStatus", contract.OperationStatus),
    ("CancelResponse", contract.CancelResponse),
    ("ErasePayloadResponse", contract.ErasePayloadResponse),
    ("ErrorResponse", contract.ErrorResponse),
    ("DescribeResponse", contract.DescribeResponse),
    ("ReadinessResponse", contract.ReadinessResponse),
)


def build_schema() -> dict[str, Any]:
    """ประกอบ schema เดียวจากโมเดล pydantic — deterministic (เรียกซ้ำได้ผลเหมือนเดิมทุกครั้ง)."""
    defs: dict[str, Any] = {}

    # discriminated union AsrEnvelope|TtsEnvelope (discriminator "kind") → $defs/InvocationEnvelope
    envelope_schema = TypeAdapter(contract.Envelope).json_schema()
    defs.update(envelope_schema.pop("$defs", {}))
    defs["InvocationEnvelope"] = envelope_schema

    for name, model in _TOP_LEVEL_MODELS:
        model_schema = model.model_json_schema()
        defs.update(model_schema.pop("$defs", {}))
        defs[name] = model_schema

    return {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$id": SCHEMA_ID,
        "title": SCHEMA_TITLE,
        "$defs": dict(sorted(defs.items())),
    }


def _serialize(schema: dict[str, Any]) -> str:
    return json.dumps(schema, indent=2, sort_keys=True, ensure_ascii=False) + "\n"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Build/verify packages/contracts/schemas/lalin-voice-worker.schema.json")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--check", action="store_true", help="exit 1 if the committed schema is out of sync with contract.py")
    group.add_argument("--write", action="store_true", help="regenerate the committed schema file")
    args = parser.parse_args(argv)

    text = _serialize(build_schema())
    if args.write:
        SCHEMA_PATH.parent.mkdir(parents=True, exist_ok=True)
        SCHEMA_PATH.write_text(text, encoding="utf-8")
        print(f"wrote {SCHEMA_PATH}")
        return 0

    assert args.check
    if not SCHEMA_PATH.is_file() or SCHEMA_PATH.read_text(encoding="utf-8") != text:
        print(
            f"{SCHEMA_PATH} is out of sync with app/voice_worker/contract.py — "
            "run `python -m app.voice_worker.schema --write` and commit the result",
            file=sys.stderr,
        )
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())


__all__ = ["REPO_ROOT", "SCHEMA_ID", "SCHEMA_PATH", "SCHEMA_TITLE", "build_schema", "main"]
