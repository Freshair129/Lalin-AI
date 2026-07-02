"""สร้างไอคอน placeholder สำหรับ Tauri (ใช้ stdlib ล้วน ไม่ต้องมี PIL)

สร้างรูปสี่เหลี่ยมสีไล่ตามธีม (น้ำเงิน) พร้อมจุดไมโครโฟนกลาง ๆ พอเป็นพิธี
ภายหลังแทนที่ด้วยโลโก้จริงได้ด้วย:  npm run tauri icon path\\to\\logo.png
"""
import struct
import zlib
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "frontend" / "src-tauri" / "icons"
OUT.mkdir(parents=True, exist_ok=True)

BG = (74, 107, 255)   # accent
DOT = (230, 232, 238)


def _px(w, h):
    buf = bytearray()
    cx, cy, r = w / 2, h / 2, w * 0.18
    for y in range(h):
        buf.append(0)  # filter type 0
        for x in range(w):
            inside = (x - cx) ** 2 + (y - cy) ** 2 <= r * r
            buf += bytes(DOT if inside else BG)
    return bytes(buf)


def make_png(w, h) -> bytes:
    raw = _px(w, h)

    def chunk(tag, data):
        c = tag + data
        return struct.pack(">I", len(data)) + c + struct.pack(">I", zlib.crc32(c) & 0xFFFFFFFF)

    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)  # 8-bit RGB
    return sig + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")


def make_ico(png_256: bytes) -> bytes:
    # ICO ที่ฝัง PNG (รองรับ Windows Vista+)
    header = struct.pack("<HHH", 0, 1, 1)
    entry = struct.pack("<BBBBHHII", 0, 0, 0, 0, 1, 32, len(png_256), 22)
    return header + entry + png_256


sizes = {"32x32.png": 32, "128x128.png": 128, "128x128@2x.png": 256, "icon.png": 512}
for name, s in sizes.items():
    (OUT / name).write_bytes(make_png(s, s))
    print("wrote", name)

(OUT / "icon.ico").write_bytes(make_ico(make_png(256, 256)))
print("wrote icon.ico")
print("→", OUT)
