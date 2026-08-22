# -*- mode: python ; coding: utf-8 -*-
# spec ของ sidecar — ไฟล์นี้ track ไว้ใน git และ build_sidecar.ps1 ต้องใช้ตัวนี้
# (ห้ามลบทิ้งแล้วให้ PyInstaller สร้างใหม่ ไม่งั้น hiddenimports ด้านล่างหายหมด)
#
# uvicorn/fastapi โหลด protocol implementation แบบ dynamic → PyInstaller มองไม่เห็น
# ต้องประกาศเอง; app/* ก็ถูก import ผ่านสตริงใน uvicorn.run("app.main:app")
#
# excludes = ML stack ทั้งหมด — sidecar ที่ ship คือ **lite runtime**
# ผู้ใช้ติดตั้ง torch/whisper/f5-tts/demucs เองผ่านแท็บปลั๊กอิน (BYOM, ดู risk R-001)
import os
import sys

from PyInstaller.utils.hooks import collect_data_files, collect_submodules

# collect_submodules("app") runs here, before Analysis(pathex=['.']) is even
# constructed below -- pathex only affects PyInstaller's own module graph once
# Analysis() actually builds it, it does NOT retroactively put apps/api on
# sys.path for code that already ran earlier in this file. Without this
# explicit insert, pyinstaller.exe's own interpreter never has "app" importable
# at this point (its sys.path is just venv/Scripts + site-packages), so
# collect_submodules("app") silently returns [] and nothing under app/ -- not
# even FastAPI/pydantic, since they're only reachable by following app's own
# imports -- ever gets analyzed or bundled. The resulting exe still "builds"
# successfully; it just crashes at runtime with ModuleNotFoundError: No module
# named 'app'. Found this the hard way after PR #9 moved backend/ -> apps/api/.
sys.path.insert(0, os.path.abspath(SPECPATH))

hiddenimports = (
    collect_submodules("app")
    + collect_submodules("uvicorn")
    + [
        "anyio._backends._asyncio",
        "websockets.legacy",
        "websockets.legacy.server",
    ]
)

datas = collect_data_files("imageio_ffmpeg")  # ffmpeg.exe ที่ฝังมากับ wheel

a = Analysis(
    ['sidecar_entry.py'],
    pathex=['.'],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    # หมายเหตุ: **ห้ามใส่ scipy** ใน excludes — pyloudnorm (auto-mastering, FR-04.2)
    # ต้องใช้ scipy และ auto-mastering คือฟีเจอร์ของ lite runtime
    #
    # PyInstaller ตาม import ที่อยู่ "ในฟังก์ชัน" ด้วย — `cached_path` ที่ tts.py
    # import แบบ lazy จึงลาก boto3/botocore/huggingface_hub เข้ามาทั้งชุด (~100MB
    # ของ JSON service model ที่ lite runtime ไม่มีวันได้ใช้) ต้องตัดทิ้งที่นี่
    # ผลลัพธ์: เรียก TTS/ASR บน lite build → RuntimeError ภาษาไทยบอกวิธีติดตั้ง
    # ตามที่ pipeline ออกแบบไว้อยู่แล้ว (NFR-02.1)
    excludes=[
        # ML stack — ผู้ใช้ติดตั้งเองผ่านแท็บปลั๊กอิน (BYOM)
        'torch', 'torchaudio', 'demucs', 'f5_tts', 'TTS',
        'matchering', 'pedalboard', 'psola', 'librosa',
        'faster_whisper', 'ctranslate2',
        # ตัวโหลดโมเดล + deps ของมัน (มาทาง cached_path ใน tts.py)
        'cached_path', 'huggingface_hub', 'boto3', 'botocore',
        's3transfer', 'transformers', 'datasets',
        # ตัวใหญ่ที่ตามเข้ามาทาง numba/pandas แต่ lite runtime ไม่แตะเลย
        # (วัดจาก build จริง 2026-08-19: llvmlite 102MB, pyarrow 79MB, pandas 13MB, PIL 13MB)
        'numba', 'llvmlite', 'pyarrow', 'pandas', 'PIL', 'Pillow',
        # อื่น ๆ ที่ไม่เกี่ยว
        'matplotlib', 'IPython', 'notebook', 'pytest',
    ],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='g-music-backend',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='g-music-backend',
)
