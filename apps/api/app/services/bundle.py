# @req FR-10 — .gmp bundle: project + media ในไฟล์เดียว (ย้ายข้ามเครื่องได้)
"""Bundle service — รวมโปรเจกต์ + ไฟล์สื่อที่อ้างถึงเป็น .gmp (zip) ไฟล์เดียว

โครงสร้างใน zip:
  project.json    {"id", "name", "data"}   — snapshot ตามที่บันทึกไว้
  manifest.json   {"format","version","assets":[{id,kind,name,bytes,sha256,missing}]}
  media/<asset_id><ext>                    — ไฟล์จริงของแต่ละ asset

ไม่ใส่ timestamp ลงใน manifest โดยตั้งใจ — bundle เดิมต้องได้ bytes เดิมเสมอ (เทสต์ง่าย)
"""
from __future__ import annotations

import hashlib
import io
import json
import zipfile
from pathlib import Path

from ..config import get_settings

BUNDLE_VERSION = 1
_KIND_DIRS = {"upload": "uploads_dir", "output": "outputs_dir"}


def resolve_asset(kind: str, name: str) -> Path:
    """แปลง (kind, name) เป็น path จริง — กัน traversal และ kind ที่ไม่รู้จัก

    ใช้ร่วมกับ render pipeline (Phase C) ด้วย — จุดเดียวที่แปลง asset เป็นไฟล์จริง
    """
    attr = _KIND_DIRS.get(kind)
    if attr is None:
        raise ValueError(f"asset kind ไม่ถูกต้อง: {kind}")
    root = getattr(get_settings(), attr).resolve()
    p = (root / name).resolve()
    if p != root and root not in p.parents:
        raise ValueError(f"เส้นทางไม่ถูกต้อง: {name}")
    if not p.exists():
        raise FileNotFoundError(str(p))
    return p


def collect_assets(data: dict) -> list[dict]:
    """ดึงรายการ asset จาก snapshot (v3) — คืน list ว่างถ้าโปรเจกต์ยังไม่มี assets"""
    assets = ((data or {}).get("project") or {}).get("assets") or {}
    return [
        {"id": a.get("id") or aid, "kind": a.get("kind", "upload"), "name": a.get("name", "")}
        for aid, a in assets.items()
    ]


def write_bundle(project: dict, out_path: Path) -> Path:
    """เขียน .gmp — asset ที่หาไฟล์ไม่เจอจะถูกทำเครื่องหมาย missing แทนที่จะทำให้ทั้ง bundle ล้ม"""
    entries: list[dict] = []
    with zipfile.ZipFile(out_path, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("project.json", json.dumps(project, ensure_ascii=False))
        for a in collect_assets(project.get("data") or {}):
            entry = {**a, "bytes": 0, "sha256": None, "missing": False}
            try:
                src = resolve_asset(a["kind"], a["name"])
            except (ValueError, FileNotFoundError):
                entry["missing"] = True
                entries.append(entry)
                continue
            raw = src.read_bytes()
            arc = f"media/{a['id']}{Path(a['name']).suffix}"
            zf.writestr(arc, raw)
            entry["bytes"] = len(raw)
            entry["sha256"] = hashlib.sha256(raw).hexdigest()
            entry["arc"] = arc
            entries.append(entry)
        zf.writestr(
            "manifest.json",
            json.dumps({"format": "gmp", "version": BUNDLE_VERSION, "assets": entries}, ensure_ascii=False),
        )
    return out_path


def read_bundle(raw: bytes) -> tuple[dict, dict[str, bytes]]:
    """แกะ .gmp → (project dict, {asset_id: bytes}) — โยน ValueError ถ้าไม่ใช่ bundle ที่ถูกต้อง"""
    try:
        zf = zipfile.ZipFile(io.BytesIO(raw))
        project = json.loads(zf.read("project.json"))
        manifest = json.loads(zf.read("manifest.json"))
    except (zipfile.BadZipFile, KeyError, json.JSONDecodeError) as e:
        raise ValueError("ไฟล์นี้ไม่ใช่ bundle .gmp ที่ถูกต้อง") from e

    if manifest.get("format") != "gmp":
        raise ValueError("ไฟล์นี้ไม่ใช่ bundle .gmp ที่ถูกต้อง")

    media: dict[str, bytes] = {}
    for a in manifest.get("assets", []):
        arc = a.get("arc")
        if a.get("missing") or not arc:
            continue
        media[a["id"]] = zf.read(arc)
    return project, media


def install_bundle(raw: bytes) -> tuple[dict, dict[str, str]]:
    """เขียนสื่อลง uploads/outputs แล้วคืน (project ที่แก้ชื่อ asset แล้ว, {ชื่อเดิม: ชื่อใหม่})

    ถ้าปลายทางมีไฟล์ชื่อเดียวกัน:
      • เนื้อหาเหมือนกัน (sha256 ตรง) → ใช้ไฟล์เดิม ไม่เขียนซ้ำ
      • เนื้อหาต่างกัน                → เขียนเป็นชื่อใหม่ แล้วอัปเดต asset.name ใน project
    ไม่มีทางที่ import จะทับไฟล์เดิมของผู้ใช้
    """
    project, media = read_bundle(raw)
    settings = get_settings()
    settings.ensure_dirs()
    assets = ((project.get("data") or {}).get("project") or {}).get("assets") or {}
    renamed: dict[str, str] = {}

    for aid, ref in assets.items():
        blob = media.get(aid)
        if blob is None:
            continue
        root = getattr(settings, _KIND_DIRS.get(ref.get("kind", "upload"), "uploads_dir"))
        original = Path(ref.get("name", aid)).name
        target = root / original

        if target.exists():
            if hashlib.sha256(target.read_bytes()).hexdigest() == hashlib.sha256(blob).hexdigest():
                continue                                   # ไฟล์เดียวกันอยู่แล้ว
            stem, suffix = Path(original).stem, Path(original).suffix
            target = root / f"{stem}__{aid[-6:]}{suffix}"
            renamed[original] = target.name
            ref["name"] = target.name

        target.write_bytes(blob)

    return project, renamed
