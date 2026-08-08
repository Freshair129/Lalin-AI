# Appendix A — API Specification

| Field | Value |
|-------|-------|
| **Version** | 1.0.0 |
| **Status** | Draft |
| **Author** | Boss |
| **Created** | 2026-08-09 |
| **Last Updated** | 2026-08-09 |
| **Approved By** | — |

> Source of truth ระหว่างพัฒนา = Swagger ที่ `http://127.0.0.1:8756/docs` และ `BLUEPRINT.yaml § api`
> ไฟล์นี้คือ snapshot + จุดจดพฤติกรรมที่ Swagger ไม่บอก (semantics, job flow)

Base: `http://127.0.0.1:8756` · WS: `ws://127.0.0.1:8756`

## Endpoints หลัก (สถานะ: ใช้งานจริง)

| Method | Path | หน้าที่ | หมายเหตุ |
|---|---|---|---|
| GET | `/health` | สถานะ server | UI ใช้โชว์ "เชื่อมต่อแล้ว" |
| GET/POST | `/brain/config` | อ่าน/สลับ provider·model สด | ไม่ต้องรีสตาร์ต (FR-05.3) |
| POST | `/brain/chat` | chat (รองรับ stream) | messages, temperature, max_tokens |
| POST | `/brain/translate` | แปลข้อความ | ใช้ใน dubbing ต่อ segment |
| GET/POST | `/voices` · DELETE `/voices/{id}` | คลังเสียง | POST = multipart (name, ref_text, language, file) |
| POST | `/files/upload` · GET `/files/download/{name}` | ไฟล์เข้า/ออก | |
| POST | `/tts` | สังเคราะห์เสียง → `job_id` | text, voice_id, language, speed |
| POST | `/dubbing` | พากย์ → `job_id` | source_audio, voice_id, target_lang, translate |
| POST | `/mastering` | มาสเตอร์ → `job_id` | source, reference?, lufs, format |
| POST | `/music/remix` | remix → `job_id` | ตาม DAG ใน BLUEPRINT § views.remix |

**Job flow:** ทุก endpoint ที่คืน `job_id` → ติดตาม progress ผ่าน WebSocket (FR-06, FR-02.7)

## Routers ที่เพิ่มใน Wave หลัง (✏️ TODO — จด endpoint + schema)

`backend/app/routers/`: `agent.py` · `fs.py` · `jobs.py` · `packs.py` · `plugins.py` · `projects.py`

| Router | หน้าที่ (คาด) | สถานะเอกสาร |
|---|---|---|
| agent.py | Workspace agent (AI-AGT-001) | ✏️ TODO |
| projects.py | จัดการโปรเจกต์ workspace/timeline | ✏️ TODO |
| plugins.py + packs.py | Plugin manager / BYOM packs (Wave 5.1) | ✏️ TODO |
| fs.py | เข้าถึงไฟล์ระบบสำหรับ workspace | ✏️ TODO |
| jobs.py | คิว/สถานะงาน + batch queue (Wave 3.5) | ✏️ TODO |

> ⚠️ ตรวจแล้ว (2026-08-09): `apps/api` มีแต่ `.pyc` bytecode — **ไม่มี source จริง** · source of truth คือ `backend/app` ที่เดียว (ดู [E-risk R-009](E-risk-matrix.md))

## Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2026-08-09 | Boss | สร้างผ่าน rwang:doc-architect (จาก BLUEPRINT.yaml + สแกน routers) |
