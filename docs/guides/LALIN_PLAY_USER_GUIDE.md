---
version: "0.1.0b"
created_at: "2026-09-20T22:40:00+07:00,LALIN,f5a6681"
last_update: "2026-09-20T22:40:00+07:00,LALIN"
status: "beta"
superseded_by: null
attributes:
  domain: "support"
  doc_type: "user-guide"
  scope: "Current Windows standalone Play candidate, not a released installer"
---

# คู่มือ Lalin Play — รุ่นทดสอบในเครื่อง

อ้างอิง source `f5a6681`, app `0.1.0` บน Windows ไม่ใช่คู่มือของ Studio player
หรือ Lalin Cast และยังไม่มี installer/update ที่ผ่าน release gate
ดู [สถานะและเอกสารทั้งหมด](../product/LALIN_PLAY_DOCUMENTATION.md)

## เริ่มใช้งาน

1. เปิด `lalin-play.exe` ที่ build จาก standalone candidate ไว้แล้ว นักพัฒนาใช้
   [README](../../apps/play-desktop/README.md) เพื่อ build; หน้า Vite ใน browser
   อย่างเดียวไม่สามารถแทน native file picker/การอ่านไฟล์ของแอปได้
2. ใน Full กด `+ ไฟล์` หรือ `+ โฟลเดอร์` แล้วเลือกสื่อ หรือ drag/drop เข้าแอป
   โปรแกรมเก็บรายการอ้างอิง ไม่ย้ายหรือคัดลอกไฟล์สื่อให้
3. กดชื่อรายการเพื่อเล่น ข้อมูล title/artist/album ใช้ metadata ที่อ่านได้จริง
   ถ้าไม่มีจะแสดงชื่อไฟล์/ไม่ระบุศิลปิน ไม่ได้ดาวน์โหลดปกหรือข้อมูลจาก Spotify
4. ใช้ช่องค้นหา และหมวดเพลง/ศิลปิน/อัลบั้ม จัด playlist ใน Full ได้
   สร้างชื่อ playlist ก่อน แล้วเลือก Playlist… ที่รายการเพื่อเพิ่มไฟล์

การเพิ่มโฟลเดอร์มีขอบเขต: ไม่เกิน 10,000 รายการในคลัง, depth 32 และไม่ตาม
symbolic links เลือกโฟลเดอร์ย่อยหากใหญ่เกินไป การรับ extension ไม่รับรอง codec
ทั้งหมด: picker รับ mp3/wav/flac/ogg/opus/m4a/aac/aif/aiff/wma/mp4/webm
หลักฐานเครื่องนี้มี WAV, H.264/AAC MP4, silent H.264 MP4 และ VP9/Opus WebM
ไม่รวม universal MKV/HEVC/AV1, subtitle หรือบริการ streaming/DRM

## Full, Compact และ Fullscreen

| โหมด/ปุ่ม | ใช้เมื่อ | พฤติกรรม |
|---|---|---|
| Full | จัดคลัง, playlist, queue, EQ และ settings | มี transport ชุดเต็ม |
| Compact | ดู/ฟังแบบหน้าต่างเล็ก | ไม่มีปุ่ม queue/EQ แต่ state ยังทำงานร่วมกับ Full |
| Fullscreen ใน Compact | ต้องการเต็มจอจริง | ปุ่ม ⛶ เข้า/ออก; Esc คืนหน้าต่างเดิม ไม่ใช่ TV Mode |
| กลับ Full ↗ | กลับจัดคลัง | ถ้าอยู่ fullscreen จะออกก่อน แล้วคืน Full layout |
| ขยายภาพใน Full | ให้ภาพใช้พื้นที่หน้าต่าง | เป็น expanded-in-window ไม่ใช่ native fullscreen |

Compact มี Play/Pause, ย้อน/ข้าม 10 วินาที, seek/time, mute/volume,
Fullscreen และกลับ Full. ปุ่ม ±10 อ้างตำแหน่งเล่นจริงและจำกัดช่วงไฟล์ ไม่เปลี่ยน
paused เป็น playing และไม่สั่ง next เมื่อกดใกล้ท้ายไฟล์ (ถ้ากำลังเล่น ไฟล์ยังจบ
ตามธรรมชาติได้) ปุ่มอาจ disabled ระหว่างโหลด, error, duration ไม่พร้อมหรือกำลังลาก

Hover timeline ของวิดีโอจะแสดงเฟรมตำแหน่งที่ชี้ ไม่ใช่ seek ตัวเล่นหลัก
ลากแล้วปล่อยจึง commit; Esc ระหว่างลากยกเลิก draft ก่อน กด Esc อีกครั้งจึงออก
fullscreen. Preview ที่ decode ไม่ได้แสดงข้อความ ไม่ใช่ภาพปลอม และ audio-only
ไม่มี thumbnail. Controls วิดีโอซ่อนหลัง playing idle 2.5 วินาที; ขยับ pointer
หรือ focus controls เพื่อแสดงอีกครั้ง ขณะ paused/audio จะคงแสดง

## คิว เสียง และการปิดโปรแกรม

- `เล่นถัดไป` แทรกหลังรายการปัจจุบัน; `เพิ่มเข้าคิว` ไม่เริ่มเล่นเอง
  ในหน้าคิวใช้ ↑ เลื่อนขึ้น, × นำออก หรือ “ล้างคิว (ไม่ลบไฟล์)”
- Full มี Previous/Next/Stop/Shuffle/Repeat; EQ มี 10 bands, preamp, bypass
  และ presets เป็นการปรับเสียงตอนเล่น ไม่แก้ไฟล์ต้นฉบับและไม่ใช่ Mastering
- Settings มี output device ตามที่ runtime แสดง ถ้าเลือกไม่ได้ใช้ Windows
  default พร้อมข้อความ ไม่ถือว่ามีเสียงออกจริงเพียงเพราะเวลาเดิน
  มีตัวเลือกความเร็ว 0.5×–2× และปุ่มตรวจอุปกรณ์เสียงอีกครั้งด้วย
- เปิด “คืนคิวเมื่อเปิดแอปครั้งถัดไป” หากต้องการ resume รายการ; ไม่ autoplay
  และไม่รับรองการคืนตำแหน่งเล่นล่าสุดระหว่าง restart
- ปุ่ม X ของหน้าต่างซ่อนไป tray เพลงอาจยังเล่น ใช้ tray เปิดกลับ
  หรือ Settings → “ออกจาก Lalin Play” / เมนู Quit ที่ tray เพื่อออกจริง
- อัปเดตในแอปยังไม่เปิดใช้ ไม่ต้องตั้งค่า firewall เพื่อเล่นไฟล์ในเครื่อง
  Play ไม่ใช่ YouTube TV receiver และไม่มีรหัสจับคู่มือถือแบบ Cast

## แก้ปัญหาเบื้องต้นอย่างไม่ทำลายข้อมูล

| อาการ | สิ่งที่ทำได้ตอนนี้ / ข้อจำกัด |
|---|---|
| ไฟล์ย้าย/หาย | กลับ Full เพิ่มไฟล์จากตำแหน่งใหม่; relink ที่รักษา reference เดิมยังไม่มี อย่าลบ profile เพื่อแก้ |
| ลบรายการแล้วไฟล์ยังอยู่ | ถูกต้อง: ลบจากคลัง/playlist/queue ไม่ใช่ลบไฟล์บนดิสก์ |
| codec/decode error | ตรวจว่าไฟล์อ่านได้ ลอง fixture ที่ทดสอบแล้ว เก็บ error/container/codec; ไม่อ้างว่าทุก MP4 เล่นได้ |
| เวลาเดินแต่ไม่ได้ยิน | ตรวจ mute/volume ของแอปและ Windows output; ไม่เพิ่ม volume/EQ จนสุดหรืออ้าง output สำเร็จจาก meter |
| Preview ไม่พร้อม | ยัง seek/play ได้ตามความสามารถของไฟล์; เก็บข้อความ error อย่าติดตั้ง decoder แปลก ๆ ตามคำเดา |
| ภาพ paused เล็กชั่วคราวหลัง resize | เป็นข้อจำกัดที่พบ; ลอง seek หรือเล่นต่อเพื่อให้มีเฟรมใหม่ ไม่ถือว่าแก้สาเหตุแล้ว |
| จบไฟล์แล้วเวลา 0:00 แต่ภาพสุดท้ายค้าง | เป็นข้อสังเกตที่บันทึกไว้ในรุ่นทดสอบ ไม่ใช่การเริ่มวิดีโอใหม่ |
| เปิดคลัง/playlist เดิมไม่ได้ | เก็บไฟล์/state เดิมไว้และรายงาน error; ไม่มีคำแนะนำให้ล้าง app-data หรือ WebView |
| ส่งจาก Studio ไม่เข้า standalone | Native handoff ยังไม่ทำ เปิดไฟล์ผ่าน Play เองชั่วคราว; อย่าถือ legacy Studio window เป็น standalone |
| กด X แล้วโปรแกรมยังอยู่ | ปิด surface เป็น hide-to-tray; ใช้คำสั่งออกจริงเมื่อต้องการหยุด |

## ข้อมูลที่เก็บและการแจ้งปัญหา

คลัง native อยู่ใน app-data ของ `ai.lalin.play` เป็น `library-v1.json`;
playlist/queue/EQ อยู่ใน WebView storage ของ Play แยกจาก Studio/Cast.
ข้อมูลนี้อาจมีชื่อและ absolute path ของไฟล์ส่วนตัว ไม่ส่งทั้ง profile/library
ขึ้น GitHub โดยไม่ตรวจและปิดบังข้อมูลก่อน ไม่แก้ไฟล์ persistence ขณะแอปทำงาน
และไม่ copy profile ข้ามโปรดัคเพื่อย้ายข้อมูล (เครื่องมือ migration ยังไม่ทำ)

แจ้ง version/source SHA, Windows/WebView2, mode, ชนิดไฟล์/codec, ขั้นตอนทำซ้ำ,
expected/actual, ข้อความ error และภาพที่ปิดข้อมูลส่วนตัวแล้ว หากต้องส่งไฟล์
ทดสอบ ใช้ไฟล์ที่มีสิทธิ์แชร์และตัวอย่างสั้น ไม่แนบ keys/cookies/voice หรือ media
ส่วนตัวโดยอัตโนมัติ ช่องทางรับปัญหาของ repo แยกยังไม่ได้จัดตั้งในรอบนี้

DPI 150%, multi-monitor, touch, physical A/V sync และ output-device recovery
ยังไม่มีหลักฐานรับรองครบ ดู [ข้อจำกัดล่าสุด](../validation/LALIN_PLAY_FULLSCREEN_SKIP.md)
ก่อนตีความผลทดสอบว่าใช้ได้ทุกเครื่อง

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---|---|---|---|---|---|
| 0.1.0b | 2026-09-20 | beta | Document current controls, files, persistence and non-destructive troubleshooting | based on f5a6681 | LALIN |
