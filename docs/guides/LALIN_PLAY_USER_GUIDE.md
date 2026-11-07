---
version: "0.1.4b"
created_at: "2026-09-20T22:40:00+07:00,LALIN,f5a6681"
last_update: "2026-11-07T00:00:00+07:00,Codex"
status: "beta"
superseded_by: null
attributes:
  domain: "support"
  doc_type: "user-guide"
  scope: "Windows standalone Play v1.0.0 install and manual updater instructions; publication remains owner-gated"
---

# คู่มือ Lalin Play — ติดตั้งและอัปเดต v1.0.0

คู่มือนี้ใช้กับ Lalin Play standalone ไม่ใช่ Studio player หรือ Lalin Cast
และบันทึกวิธีติดตั้ง Windows NSIS รุ่น `1.0.0` กับการตรวจอัปเดตด้วยตนเอง
ตัว installer/release ยังต้องผ่านการตรวจและเผยแพร่โดย owner; Dashboard, RustFS,
cache และ Genesis graph/vector recommendations ยังอยู่ระหว่างทำ
ดู [สถานะและเอกสารทั้งหมด](../product/LALIN_PLAY_DOCUMENTATION.md)

หมายเหตุ S3: Studio มีคำสั่งส่งไฟล์ไป standalone Play แยกจากปุ่มเล่นเดิม
การเล่นปกติใน Studio ยังคงใช้ playback owner เดิมจนกว่าจะตรวจ parity ครบ

## เริ่มใช้งาน

1. หลัง owner เผยแพร่ release ให้ดาวน์โหลด `Lalin-Play_1.0.0_x64-setup.exe`
   จาก release `play-v1.0.0` ใน `Freshair129/Lalin-AI` และตรวจ hash กับ
   `SHA256SUMS.txt` ใน release เดียวกันก่อนเปิด installer อย่าใช้ asset จาก draft
   หรือแหล่ง mirror ที่ไม่ยืนยัน
2. NSIS ติดตั้งสำหรับ user ปัจจุบันโดยไม่ต้องใช้สิทธิ์ Administrator และมี
   WebView2 bootstrapper; การติดตั้ง WebView2 อาจต้องใช้อินเทอร์เน็ต
3. ตัว installer ไม่ได้เซ็นด้วยใบรับรอง Windows code-signing ดังนั้น SmartScreen
   อาจแจ้ง `Unknown publisher` ก่อนเปิดต่อ ให้ตรวจแหล่งดาวน์โหลดและ SHA256 ก่อน
   ตัดสินใจเองว่าจะเปิดไฟล์ที่ตรวจแล้วหรือไม่
4. เปิด `lalin-play.exe` ที่ติดตั้งแล้ว นักพัฒนาใช้
   [README](../../apps/play-desktop/README.md) เพื่อ build; หน้า Vite ใน browser
   อย่างเดียวไม่สามารถแทน native file picker/การอ่านไฟล์ของแอปได้
5. ใน Full กด `นำเข้าไว้ฟังออฟไลน์` หรือ `นำเข้าโฟลเดอร์` แล้วเลือกสื่อ หรือ
   drag/drop เข้าแอป Play สร้าง managed copy ใน app-data เพื่อให้ไฟล์ที่นำเข้า
   เปิดฟังได้เมื่อไม่มีอินเทอร์เน็ต; ไฟล์ต้นฉบับไม่ถูกย้ายหรือแก้ไข
6. กดชื่อรายการเพื่อเล่น ข้อมูล title/artist/album ใช้ metadata ที่อ่านได้จริง
   ถ้าไม่มีจะแสดงชื่อไฟล์/ไม่ระบุศิลปิน ไม่ได้ดาวน์โหลดปกหรือข้อมูลจาก Spotify
7. หน้า Home แสดงฟังล่าสุด, ฟังบ่อย และคำแนะนำจากประวัติ/เพลงโปรดในเครื่อง;
   ประวัติจะเพิ่มเมื่อได้ยินต่อเนื่องถึง 30 วินาที (หรือครึ่งหนึ่งของเพลงที่สั้นกว่า
   30 วินาที). กดดาวที่เพลงเพื่อเก็บ Favorites และเลือกกรองจากแถบด้านข้างได้
8. รายการเพลงแสดง `USER` สำหรับไฟล์ที่ผู้ใช้นำเข้า และ `OFFLINE` เมื่อมี managed
   copy ที่อยู่ในเครื่อง; สองป้ายแสดงร่วมกันได้
9. `YouTube links` เก็บลิงก์ไว้เปิดใน YouTube ทางการเท่านั้น; Lalin Play ไม่ดาวน์โหลด
   ไม่แยกเสียง และไม่เล่นหรือ cache เสียง YouTube
10. ใช้ช่องค้นหา และหมวดเพลง/ศิลปิน/อัลบั้ม จัด playlist ใน Full ได้
   สร้างชื่อ playlist ก่อน แล้วเลือก Playlist… ที่รายการเพื่อเพิ่มไฟล์

จาก Studio บน Windows ใช้เมนูคลิกขวา `Play in standalone Lalin Play`,
`Play Next in standalone Lalin Play` หรือ `Add to standalone Lalin Play queue`
เมื่อต้องการทดสอบ handoff แบบ native; คำสั่ง Play เดิมยังเปิด player ของ Studio
ไฟล์ที่ส่งต้องอยู่ใน Workspace, uploads หรือ outputs ที่ Studio อนุญาต

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

### ภาษา, Mixer และเสียงรอบทิศทาง

- ใน top bar ของ Full ใช้ `ENG | TH` เพื่อเปลี่ยนภาษาทันที ภาษาเริ่มต้นเป็น ENG
  และจำค่าที่เลือกไว้; Compact ใช้ภาษาเดียวกัน แต่เปลี่ยนภาษาจาก top bar ไม่ได้
- หน้า `Mixer` แสดงเฉพาะช่อง `MEDIA` และ `MASTER` ของ Lalin Play ไม่มีช่อง Game,
  Chat, Aux หรือ Mic เพราะ Play ยังไม่มี stream แยกเหล่านั้น
- Fader/Mute ของ MEDIA คุมเสียงของสื่อที่ Play เล่นและทำงานก่อน EQ; fader/Mute
  MASTER ใช้ volume/output controls ของ player เดิม จึงตรงกับ volume ด้านล่าง
- `Stereo` เป็นค่าเริ่มต้น; `Virtual 7.1` ใช้ input stereo มาจำลอง virtual speakers
  และ HRTF render เป็น stereo สำหรับหูฟัง เป็นเสียงจำลอง ไม่ใช่ true 7.1 decode,
  output 8-channel หรือการปรับเสียงของแอปอื่นทั้ง Windows
- หากระบบสร้าง HRTF graph ไม่ได้ Play กลับไป Stereo และแจ้งสถานะ การฟังเปรียบเทียบ
  และคุณภาพเสียงบน Windows headphone endpoint ยังรอ native acceptance

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
- Settings มี `Check for updates` สำหรับตรวจรุ่นใหม่ด้วยตนเองเท่านั้น เมื่อพบรุ่น
  ให้ตรวจ version แล้วกด `Install update` และยืนยันก่อนติดตั้ง Play จะปิดระหว่าง
  update; ไม่มีการตรวจหรือติดตั้งอัตโนมัติเมื่อเปิดแอป
- เปิด “คืนคิวเมื่อเปิดแอปครั้งถัดไป” หากต้องการ resume รายการ; ไม่ autoplay
  และไม่รับรองการคืนตำแหน่งเล่นล่าสุดระหว่าง restart
- ปุ่ม X ของหน้าต่างซ่อนไป tray เพลงอาจยังเล่น ใช้ tray เปิดกลับ
  หรือ Settings → “ออกจาก Lalin Play” / เมนู Quit ที่ tray เพื่อออกจริง
- ไม่ต้องตั้งค่า firewall เพื่อเล่นไฟล์ในเครื่อง; update check ติดต่อ endpoint
  ของ release `play-updates` เฉพาะเมื่อผู้ใช้กดตรวจอัปเดต
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
| ส่งจาก Studio ไม่เข้า standalone | ตั้ง `LALIN_PLAY_EXECUTABLE` ให้ชี้ absolute path ของ `lalin-play.exe` ใน Studio dev process; หากผลเป็น unknown ให้กด “ตรวจสถานะเครื่องเล่น” ก่อนส่งใหม่ และอย่ากดซ้ำอัตโนมัติ |
| กด X แล้วโปรแกรมยังอยู่ | ปิด surface เป็น hide-to-tray; ใช้คำสั่งออกจริงเมื่อต้องการหยุด |

## ข้อมูลที่เก็บและการแจ้งปัญหา

Lalin Play ไม่มี telemetry และไม่ส่ง library, file path, media, queue หรือข้อมูล
การฟังออกจากเครื่องผ่านระบบอัปเดต การเชื่อมต่อเครือข่ายที่ Play เริ่มเองมีเพียง
การตรวจอัปเดตเมื่อผู้ใช้กดปุ่ม และการเปิดลิงก์ YouTube ภายนอกเมื่อผู้ใช้เลือก
เปิดลิงก์ ข้อมูลที่เว็บไซต์ YouTube เก็บเมื่อเปิดผ่าน browser อยู่ภายใต้นโยบาย
ของ YouTube/browser นั้นเอง

คลัง metadata ใหม่ใช้ GenesisBlockDB ใน app-data ของ `ai.lalin.play`; ไฟล์
`library-v1.json` เดิมยังเก็บไว้เพื่อ migration/recovery. Managed media copies
อยู่ใน app-data แยกจาก metadata; RustFS S3 adapter และ authenticated streaming
ยังไม่พร้อมใช้. Playlist/queue/EQ ยังอยู่ใน WebView storage ของ Play แยกจาก
Studio/Cast.
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
| 0.1.4b | 2026-11-07 | beta | Add v1.0.0 per-user installer, unsigned SmartScreen notice, manual signed updater and privacy instructions; publication remains owner-gated | working tree | Codex |
| 0.1.3b | 2026-10-20 | beta | Document partial CR-007 dashboard, history, favorite, badges, offline-copy and YouTube-link behavior; list storage/recommendation gaps | working tree | Codex |
| 0.1.2b | 2026-10-20 | beta | Document approved CR-006 mixer, ENG/TH switch and stereo-derived virtual-surround limits; native audio evidence remains open | working tree | Codex |
| 0.1.1b | 2026-09-25 | beta | Document explicit Studio-to-standalone actions and keep Studio playback as default pending parity | uncommitted | Codex |
| 0.1.0b | 2026-09-20 | beta | Document current Windows standalone candidate usage and data boundaries | based on f5a6681 | LALIN |

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---|---|---|---|---|---|
| 0.1.0b | 2026-09-20 | beta | Document current controls, files, persistence and non-destructive troubleshooting | based on f5a6681 | LALIN |
