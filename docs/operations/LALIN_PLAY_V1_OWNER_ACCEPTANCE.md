---
version: "0.1.0b"
created_at: "2026-11-08T00:00:00+07:00,Claude"
last_update: "2026-11-08T00:00:00+07:00,Claude"
status: "beta"
attributes:
  domain: "lalin-play"
  doc_type: "owner-acceptance-checklist"
  scope: "Lalin Play v1.0 owner acceptance session (roadmap P1.6): clean VM, signed draft installer, audible and persistence checks"
---

# Lalin Play v1.0 — owner acceptance checklist (P1.6)

เอกสารนี้คือรายการที่ **เจ้าของ (owner) ต้องทดสอบเอง** ก่อนอนุมัติ publish (P1.7)
ทุกข้อเป็นสิ่งที่ agent ทดสอบไม่ได้: เครื่องสะอาด, เสียงที่ได้ยินจริง, อุปกรณ์จริง,
การ restart อัตโนมัติหลัง update และการ install บน identifier จริง `ai.lalin.play`.
ผลอัตโนมัติและผล QA ของ lead อยู่ใน
[LALIN_PLAY_TRACEABILITY.md](../validation/LALIN_PLAY_TRACEABILITY.md) และ
[P1.5 evidence](../validation/evidence/play-v1-p15/README.md).
Scope ที่ใช้ตัดสินคือ [LALIN_PLAY_V1_RELEASE_SCOPE.md](../product/LALIN_PLAY_V1_RELEASE_SCOPE.md) §2.

กรอกผลแต่ละข้อเป็น **PASS / FAIL / N/A** + หมายเหตุสั้นๆ แล้ว comment สรุปลง issue #47
(หรือส่งให้ lead บันทึกให้). FAIL ข้อไหนก็ตามใน §3–§6 = ยังไม่ publish; lead จะเปิดงานแก้แล้ว build ใหม่.

## 0. สิ่งที่ต้องทำก่อน (owner เท่านั้น)

| # | งาน | วิธี | เสร็จ |
|---|---|---|---|
| 0.1 | สร้าง updater key จริง | รัน `powershell -NoProfile -ExecutionPolicy Bypass -File tools/build/new_play_updater_key.ps1` จาก root repo ([runbook R0](LALIN_PLAY_RELEASE_RUNBOOK.md#owner-key-ceremony)) แล้ว commit เฉพาะ public key ใน `tauri.conf.json` | ☐ |
| 0.2 | ตั้ง GitHub secrets | `PLAY_TAURI_SIGNING_PRIVATE_KEY` และ `PLAY_TAURI_SIGNING_PRIVATE_KEY_PASSWORD` ใน repo `Freshair129/Lalin-AI` | ☐ |
| 0.3 | สำรอง key แบบ offline | เลือกที่เก็บ (เช่น USB ที่เข้ารหัส) สำหรับ private key + password แล้วทดลองเปิดอ่านได้จริง | ☐ |
| 0.4 | GitHub Actions billing | ตรวจว่า Actions รันได้ (billing ไม่ติด) | ☐ |
| 0.5 | Draft build | push tag `play-v1.0.0` → workflow `Release Lalin Play` สร้าง **draft** release (ยังไม่ publish, `latest-play.json` ยังไม่ถูก promote). บอก lead ได้ ให้ lead push tag หลังข้อ 0.1–0.4 เสร็จ | ☐ |
| 0.6 | เตรียมเครื่องทดสอบ | Windows 11 (หรือ 10 22H2+) x64 ที่สะอาด: VM ใหม่หรือเครื่องสำรอง ไม่มี Node/Rust/Python/Lalin Studio. ถ่าย snapshot ก่อนเริ่ม | ☐ |
| 0.7 | ไฟล์ทดสอบ | เพลงที่มีสิทธิ์ใช้: MP3/FLAC/WAV อย่างละ ≥1, วิดีโอ MP4 1 ไฟล์, และไฟล์บนไดรฟ์ที่ 2 หรือ USB (สำหรับ relink) | ☐ |

กรอก provenance ก่อนเริ่ม:

| Field | Actual |
|---|---|
| Draft release / tag | `play-v1.0.0` @ `________` |
| Installer filename | `Lalin-Play_1.0.0_x64-setup.exe` |
| SHA-256 (ตรงกับ `SHA256SUMS.txt`) | `________________` |
| Windows edition / build | `________________` |
| VM snapshot / เครื่อง | `________________` |
| หูฟัง / ลำโพง / output device | `________________` |
| ผู้ทดสอบ / วันที่ (ICT) | `________________` |

## 1. Install บนเครื่องสะอาด (PLAY-10, R2)

| # | ขั้นตอน | ผลที่ต้องได้ | ผล |
|---|---|---|---|
| 1.1 | ดาวน์โหลด installer จาก draft แล้วตรวจ SHA-256 | ตรงกับ `SHA256SUMS.txt` | |
| 1.2 | ดับเบิลคลิก installer | SmartScreen "Unknown publisher" (คาดไว้แล้ว — unsigned v1.0) → More info → Run anyway; **ไม่มี UAC prompt** (currentUser install) | |
| 1.3 | ติดตั้งจนจบ แล้วเปิดจาก Start menu | แอปเปิด, ภาษาเริ่มต้นเป็น English, ไม่มี error banner, ไม่ต้องลง Studio/Python/Node | |
| 1.4 | Settings → About | เวอร์ชัน 1.0.0, มี license MIT + third-party notices, ข้อความ privacy (ไม่เก็บ telemetry) | |
| 1.5 | Settings → Check for updates | "Lalin Play is up to date." (draft ยังไม่ promote metadata) หรือ error ที่อ่านเข้าใจได้ — **ไม่ crash** | |

## 2. Import, library, relink (PLAY-01/02/08/18)

| # | ขั้นตอน | ผลที่ต้องได้ | ผล |
|---|---|---|---|
| 2.1 | Import offline → เลือก MP3/FLAC/WAV หลายไฟล์ | ทุกไฟล์ขึ้นใน library พร้อม badge OFFLINE/USER, **แอปไม่ปิดเอง** (regression ของ P0 stack overflow) | |
| 2.2 | ลาก (drag-drop) ไฟล์เข้าหน้าต่าง | import ได้เหมือน 2.1 | |
| 2.3 | สร้าง playlist, ใส่ 2–3 เพลง, กด favorite 1 เพลง, ใช้ filter favorites | playlist/favorite/filter ถูกต้อง | |
| 2.4 | Import ไฟล์จากไดรฟ์ที่ 2/USB แบบ linked แล้วปิดแอป → ถอด USB หรือย้ายไฟล์ → เปิดแอป → เล่นเพลงนั้น | แสดงเหตุผล (missing/moved) + ให้เลือกไฟล์ใหม่; queue เดิมยังอยู่ | |
| 2.5 | เลือกไฟล์ใหม่ (relink) แล้วเล่น | เล่นได้จากตำแหน่งใหม่ | |
| 2.6 | ไฟล์ที่ไม่รองรับ (เช่น .txt เปลี่ยนนามสกุลเป็น .mp3) | แจ้งว่าไม่รองรับ, แอปยังใช้งานได้ | |

## 3. เล่นเพลงและเสียงที่ได้ยินจริง (PLAY-01/04/11/12/25/26)

ใส่หูฟังสำหรับข้อ 3.5 เป็นต้นไป

| # | ขั้นตอน | ผลที่ต้องได้ | ผล |
|---|---|---|---|
| 3.1 | Play / Pause / Stop / Next / Prev / seek | ได้ยินเสียงถูกต้อง, ตำแหน่งตรง | |
| 3.2 | Repeat (off/all/one) + Shuffle ตลอด queue 3+ เพลง | ลำดับตรงกับโหมด, ไม่ข้าม/ไม่ซ้ำผิด | |
| 3.3 | EQ 10-band: preset Flat → Bass Boost → Treble → ปรับเอง | ได้ยินความต่างชัดเจน, ไม่มีเสียงแตก/clip ที่ volume ปกติ | |
| 3.4 | Mixer MEDIA / MASTER | แต่ละ channel ปรับเสียงได้จริง, ไม่มี pop/click | |
| 3.5 | Spatial: Stereo ↔ Virtual 7.1 | Virtual 7.1 ฟังกว้างกว่า, ไม่มี artifact/ดีเลย์ผิดปกติ; Stereo กลับมาปกติ | |
| 3.6 | Crossfade Off ↔ Smooth ข้ามเพลง | Smooth ค่อยๆ เฟด, Off ตัดตรง; ไม่มีเสียงซ้อนค้าง | |
| 3.7 | Manual DJ / Medley (cue-in) | เข้าเพลงที่ตำแหน่ง cue, หยุด/ยกเลิกกลางคันแล้วไม่ค้าง | |
| 3.8 | เปลี่ยน output device ใน Windows ระหว่างเล่น (เช่น หูฟัง ↔ ลำโพง) | เสียงย้ายตามหรือแจ้งเหตุผล, แอปไม่ค้าง | |
| 3.9 | ปุ่ม media บนคีย์บอร์ด/หูฟัง (ถ้ามี) | Play/Pause/Next ทำงาน (ไม่มีให้ใส่ N/A) | |

## 4. หน้าจอ, วิดีโอ, ภาษา (PLAY-03/13, V/C)

| # | ขั้นตอน | ผลที่ต้องได้ | ผล |
|---|---|---|---|
| 4.1 | Full ↔ Compact ระหว่างเล่น | เพลง/queue/ตำแหน่ง/volume/EQ คงเดิม, เสียงไม่สะดุด | |
| 4.2 | เล่น MP4 แล้วกด fullscreen แล้วออก | ภาพ+เสียงตรงกัน (A/V sync ด้วยสายตา), ออก fullscreen ได้ | |
| 4.3 | Settings → ภาษา ไทย | UI เป็นไทยทั้งหมด, ไม่มีข้อความล้น/ทับกัน (known: error banner ของ updater อาจเป็นอังกฤษ — บันทึกได้แต่ไม่ใช่ FAIL) | |
| 4.4 | DPI 100% / 150% (และจอที่ 2 ถ้ามี) | ไม่เบลอ ไม่ล้นจอ ลากข้ามจอได้ | |
| 4.5 | ใช้คีย์บอร์ดอย่างเดียว (Tab/Enter/Space) | เข้าถึงปุ่มหลักได้ | |

## 5. Restart, persistence, single instance, tray (PLAY-05/06/07/14)

| # | ขั้นตอน | ผลที่ต้องได้ | ผล |
|---|---|---|---|
| 5.1 | เล่นเพลง 2–3 เพลงจนจบ แล้ว Quit จาก tray แล้วเปิดใหม่ | library, playlist, favorite, EQ, ภาษา คงอยู่; Dashboard แสดง recent/most played; **ไม่ autoplay** | |
| 5.2 | Restart Windows แล้วเปิดแอป | เหมือน 5.1 | |
| 5.3 | เปิด "Restore queue next time the app opens" ใน Settings แล้วปิด/เปิดใหม่ | queue กลับมาแต่ **ไม่ autoplay** | |
| 5.4 | ปิดหน้าต่าง (X) ระหว่างเล่น | ยังเล่นต่อใน tray; คลิก tray เพื่อเปิดกลับ; Quit จาก tray ปิดจริง | |
| 5.5 | เปิดแอปซ้ำขณะเปิดอยู่ / คลิกขวาไฟล์เพลง → Open with → Choose another app → เลือก `lalin-play.exe` (v1.0 ไม่ลงทะเบียน file association) | ไม่มีหน้าต่างที่ 2; ไฟล์ถูกส่งเข้าแอปเดิม | |
| 5.6 | ลิงก์ YouTube (ถ้ามีใน UI) | เปิดในเบราว์เซอร์ภายนอก, ไม่เข้า queue | |
| 5.7 | ฟีเจอร์ deferred (Smart Medley, mobile remote, YouTube playlist import) | ซ่อนหรือติดป้าย "coming later", กดแล้วไม่ทำให้ข้อมูลเสีย | |

## 6. Update และ uninstall บนเครื่องสะอาด (PLAY-10, R2 ที่ lead ทดสอบไม่ได้)

### 6A. Auto-restart หลัง update (QA build)

ใช้ชุด QA (identifier `ai.lalin.play.qa`, key ชั่วคราว) — lead build A 1.0.0 / B 1.0.1 ให้ด้วย
`tools/verify/play_updater_ab.ps1` แล้วส่ง installer + `server.mjs` ให้ คู่กับคำสั่งรัน server ที่ `127.0.0.1:39347`.
ไม่กระทบ `ai.lalin.play` จริงบนเครื่อง.

| # | ขั้นตอน | ผลที่ต้องได้ | ผล |
|---|---|---|---|
| 6A.1 | ติดตั้ง QA A, import 1 เพลง, ตั้ง EQ | ปกติ | |
| 6A.2 | รัน server (โหมด ok) → Settings → Check for updates → Install update | ดาวน์โหลด, ตัวติดตั้งรันแบบ passive, **แอปเปิดใหม่เองเป็น 1.0.1** | |
| 6A.3 | ตรวจข้อมูลหลัง restart | เพลง + EQ คงอยู่, ไม่ autoplay | |
| 6A.4 | ระหว่าง install (ข้อ 6A.2 รอบใหม่ด้วย build 1.0.2 ที่ lead เตรียม) ปิด installer จาก Task Manager | เวอร์ชันเดิมยังเปิดได้ หรือรัน installer ซ้ำแล้วซ่อมได้; ข้อมูลไม่หาย | |
| 6A.5 | Uninstall QA แบบ interactive พร้อมติ๊ก "Delete app data" | `%APPDATA%\ai.lalin.play.qa` ถูกลบ; ไฟล์เพลงต้นฉบับไม่ถูกแตะ | |

### 6B. Uninstall / reinstall ตัวจริง

| # | ขั้นตอน | ผลที่ต้องได้ | ผล |
|---|---|---|---|
| 6B.1 | Settings → Apps → Lalin Play → Uninstall (ไม่ติ๊ก Delete app data) | ลบโปรแกรม; `%APPDATA%\ai.lalin.play` ยังอยู่ | |
| 6B.2 | ติดตั้ง draft installer ใหม่ | library/playlist/favorite กลับมา; เล่นได้ | |

## 7. สรุปผลและการตัดสิน

| ส่วน | PASS | FAIL | N/A | หมายเหตุ |
|---|---:|---:|---:|---|
| §1 Install | | | | |
| §2 Import/relink | | | | |
| §3 Audio | | | | |
| §4 UI/video/locale | | | | |
| §5 Persistence | | | | |
| §6 Update/uninstall | | | | |

- **อนุมัติ publish** (P1.7) ได้เมื่อ §1–§6 ไม่มี FAIL และข้อ 0.1–0.4 เสร็จ.
- FAIL → แจ้ง lead พร้อมข้อ, ภาพหน้าจอ และ log (`%APPDATA%\ai.lalin.play` ห้ามส่งไฟล์เพลงหรือข้อมูลส่วนตัว).
  Lead จะแก้, ลบ draft/tag ที่ล้มเหลวเมื่อได้รับอนุญาต แล้ว build เวอร์ชันใหม่.

Owner decision: ☐ Approve publish  ☐ Fix first — signature/วันที่: `________________`

## Known limitations ที่ไม่ใช่ FAIL

- Installer ไม่ได้ code-sign (SmartScreen เตือน) — ตัดสินแล้วสำหรับ v1.0.
- Error banner ของ updater แสดงข้อความภาษาอังกฤษดิบจาก plugin (PLAY-13 follow-up).
- Volume ไม่ถูกจำข้าม restart (ไม่ใช่ persisted setting ใน v1.0).
- Power-loss durability ของ Studio→Play import (PLAY-09) เป็น known limitation.

## CHANGELOG

| Version | Date | Status | Change | Base | Author |
|---|---|---|---|---|---|
| 0.1.0b | 2026-11-08 | beta | Initial P1.6 owner acceptance checklist covering clean VM install, import/relink, audible checks, UI/locale/DPI, persistence, auto-restart after update, interrupted install and uninstall/reinstall | `51b84c7` | Claude |
