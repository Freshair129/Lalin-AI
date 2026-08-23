---
version: "0.1.0b"
created_at: "2026-08-23T16:51:15+07:00,LALIN (ลลิน),uncommitted"
last_update: "2026-08-23T17:45:00+07:00,LALIN (ลลิน)"
status: "beta"
attributes:
  domain: "release-validation"
  scope: "Clean Windows VM acceptance for the lite NSIS installer"
---

# Clean-VM Acceptance Checklist (Task 18 / R-006)

รันบน Windows 10/11 x64 ที่ isolated จริงเท่านั้น: fresh VM หรือเครื่องสำรองที่ไม่มี
Python, Node, Rust, CUDA, Visual C++ Redistributable หรือ .NET ที่ติดตั้งเพิ่มเอง
ห้ามใช้ dev workstation นี้เป็นหลักฐาน เพราะผลที่ผ่านจะพิสูจน์ dependency isolation ไม่ได้

> Gate boundary: checklist นี้พิสูจน์ **lite installer / sidecar / R-006** เท่านั้น
> ไม่พิสูจน์ G-09/G-06/G-07 ของ full ML runtime และห้ามนำผลไปอ้างข้าม profile

## 1. Artifact provenance

ใช้ installer จาก:

```text
apps/desktop/src-tauri/target/release/bundle/nsis/G-Music_0.1.0_x64-setup.exe
```

กรอกก่อน copy เข้า VM:

| Field | Actual |
|---|---|
| Commit/tag | `672aa186479a03ac702566358de38751f388f87a` / `v0.1.0-rc1-dirty` (Phase 1 changes uncommitted) |
| Filename | `G-Music_0.1.0_x64-setup.exe` |
| Byte size | `74,190,264` |
| SHA-256 | `C41D59B041480C778334BEE80EBBA2533C335A1CFFE63CF5A68FADF894C1192F` |
| Build profile | `lite` |
| Windows edition/build | `________________` |
| VM snapshot/image ID | `________________` |
| Tester/date/time (ICT) | artifact built by LALIN, `2026-08-23T17:44:46+07:00`; clean-VM tester pending |
| Test audio provenance | `________________` (ผู้ทดสอบมีสิทธิ์ใช้) |

Copy เฉพาะ installer และไฟล์ WAV/MP3 ทดสอบสั้น ๆ เข้า VM ผ่าน USB/shared folder หรือ
download URL ที่บันทึกไว้ ห้ามติดตั้ง dev dependency เพิ่มเพื่อทำให้แถวใดผ่าน

## 2. Checklist

บันทึก actual result ทุกแถว ไม่ใช่แค่ทำเครื่องหมาย

| # | Action | Expected | PASS/FAIL | Actual result / evidence |
|---|---|---|---|---|
| 1 | รัน installer ด้วย Windows user ปกติ | ติดตั้งได้โดยไม่ขอ Python/Node/Rust/.NET/VC++ เพิ่ม | `____` | `________________` |
| 2 | เปิดจาก Start menu | หน้าต่างเปิด; badge `CONNECTING` → `READY` ภายใน 60 วินาที | `____` | `________________` |
| 3 | เปิด Library → Plugins | pedalboard/psola/matchering เป็น `ยังไม่ติดตั้ง`, แสดง license และคำสั่งติดตั้ง | `____` | `________________` |
| 4 | เปิด Library → Files | workspace ว่างและไม่มี error | `____` | `________________` |
| 5 | เปิด Arrange แล้วโหลดไฟล์ผ่าน Source | waveform/clip แสดง; Space เล่น/หยุดได้ | `____` | `________________` |
| 6 | ตั้ง fade และ pan แล้วกด `⬇ WAV` | ได้ไฟล์ที่เล่นได้และได้ยิน fade/pan ตามที่ตั้ง | `____` | `________________` |
| 7 | เปิด Voice Studio → Text to speech | แสดงข้อความไทยว่า Lite runtime ยังไม่รวมโมเดลสร้างเสียง, ปุ่มถูก disable, ไม่มี stack trace และแอปยังใช้ต่อได้ | `____` | `________________` |
| 8 | Save project, ปิดแอป แล้วดู Task Manager | ไม่มี `g-music-backend*.exe` ค้าง | `____` | `________________` |
| 9 | เปิดแอปใหม่และ Open project ที่บันทึก | backend กลับเป็น `READY`; project/clip/fade/pan เหมือนเดิม | `____` | `________________` |

## 3. Failure rule

ถ้าแถวใด fail ให้หยุด gate และบันทึก:

- เลขแถว + exact action
- สิ่งที่คาดกับสิ่งที่เห็นจริง
- screenshot/video และเวลาที่เกิด
- Windows Event Viewer/App log/sidecar process state ถ้ามี
- SHA-256 ของ installer ที่ใช้

ห้ามเฉลี่ยผล ห้ามแก้ VM ด้วยการลง dependency แล้วนับใหม่ว่า pass และห้ามใช้ local dev smoke
แทน clean-VM evidence; fail เพียงหนึ่งแถวหมายถึง R-006 ยังเปิด

## 4. Promotion after all nine rows pass

เมื่อมี actual evidence ครบจึง:

1. เปลี่ยน R-006 ใน `docs/appendices/E-risk-matrix.md` เป็น MITIGATED พร้อม commit/tag,
   SHA-256, Windows build และ checklist result
2. อัปเดต `docs/operations/PACKAGING_SIDECAR.md` จาก local-only เป็น clean-VM validated
3. เปลี่ยน status เอกสารนี้จาก beta เป็น stable หรือ active ตาม release decision

ห้ามกรอก PASS หรือลด risk ล่วงหน้า

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---|---|---|---|---|---|
| 0.1.0b | 2026-08-23 | beta | Approved current-path checklist; separated lite-installer evidence from full-runtime Phase 1 evidence and recorded the fresh local NSIS artifact provenance. | uncommitted | LALIN (ลลิน) |
