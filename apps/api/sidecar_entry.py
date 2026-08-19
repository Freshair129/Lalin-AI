"""จุดเริ่มของ g-music-backend.exe — รัน uvicorn แบบฝังในตัว

แยกเป็นไฟล์จริงที่ track ใน git (ไม่ใช่สร้างตอน build) เพื่อให้ .spec อ้างถึงได้
และ review ได้ว่า sidecar บูตอะไรจริง ๆ

data_dir ชี้ไปที่โฟลเดอร์ข้าง ๆ ตัว .exe เพื่อไม่ให้เขียนลง Program Files
(ผู้ใช้ override ได้ด้วย env DATA_DIR ตามเดิม)
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

if __name__ == "__main__":
    base = Path(sys.executable).parent if getattr(sys, "frozen", False) else Path(__file__).parent
    os.environ.setdefault("DATA_DIR", str(base / "data"))

    import uvicorn

    uvicorn.run("app.main:app", host="127.0.0.1", port=8756, log_level="info")
