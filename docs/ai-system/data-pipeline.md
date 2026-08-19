# Data Pipeline — G-Music

| Field | Value |
|-------|-------|
| **Version** | 1.0.0 |
| **Status** | Draft |
| **Author** | Boss |
| **Created** | 2026-08-09 |
| **Last Updated** | 2026-08-09 |
| **Approved By** | — |

เส้นทางข้อมูลเสียง/ข้อความในแต่ละ pipeline + จุดจัดเก็บ ทั้งหมดเป็น **local-first**: ไฟล์เสียงไม่ออกนอกเครื่อง ยกเว้นข้อความที่ส่งให้ cloud brain เมื่อผู้ใช้เลือกโหมด cloud (ดู [ethics-governance](ethics-governance.md) AI-ETH-004)

## Flows หลัก

```
TTS:       text + voice(id) ──► F5-TTS ──► WAV 24kHz ──► JobProgress/download

Dubbing:   source(audio|video) ──► ASR (whisper) ──► segments+timestamps
           ──► translate ต่อ segment (Brain) ──► TTS clone ต่อ segment
           ──► stretch ให้ตรงเวลา ──► mix ลง timeline ──► WAV

Mastering: source [+ reference] ──► Matchering (reference mode)
                                └─► target LUFS + limiter (auto mode) ──► WAV/MP3

Remix:     source + beat ──► demucs แยก stem ──► BPM/key detect (librosa)
           ──► time-stretch + autotune (psola) ──► vocal FX (pedalboard)
           ──► mix (offset auto/manual) ──► master (LUFS) ──► output
           (DAG เต็ม + params: ดู BLUEPRINT.yaml § views.remix.nodes)
```

ทุก flow รันผ่าน `jobs.spawn()` + รายงาน progress ผ่าน WebSocket (FR-06)

## จุดจัดเก็บข้อมูล (DR)

| ID | ข้อมูล | ที่เก็บ | Schema |
|---|---|---|---|
| DR-001 | คลังเสียงอ้างอิง | `data/voices/` | `<id>.wav` + `<id>.json` (name, ref_text, language) — id = 12-char hex (FR-01.4/01.5) |
| DR-002 | ไฟล์งาน/ผลลัพธ์ job | ✏️ TODO ระบุ path output + อายุไฟล์ | ผูกกับ job_id |
| DR-003 | Runtime state (monorepo ใหม่) | `runtime/data/`, `runtime/state/` | ✏️ TODO ระบุ schema เมื่อ migration นิ่ง |

รายละเอียด schema เต็ม: [B-storage-schema.md](../appendices/B-storage-schema.md)

## นโยบายข้อมูล

- **Retention:** ✏️ TODO — กำหนดอายุไฟล์ upload/ผลลัพธ์ (ตอนนี้เก็บจนผู้ใช้ลบ)
- **ข้อมูลออกนอกเครื่อง:** เฉพาะ text → cloud LLM (โหมด cloud) และ telemetry ไม่มี (ไม่เก็บ)
- **ข้อมูลฝึกโมเดล:** G-Music **ไม่ได้ฝึกโมเดลเอง** — ใช้ pretrained ทั้งหมด (ดู [model-cards/](model-cards/)) จึงไม่มี training data pipeline

## Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2026-08-09 | Boss | สร้างผ่าน rwang:doc-architect |
