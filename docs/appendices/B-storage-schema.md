# Appendix B — Storage Schema

| Field | Value |
|-------|-------|
| **Version** | 1.0.0 |
| **Status** | Draft |
| **Author** | Boss |
| **Created** | 2026-08-09 |
| **Last Updated** | 2026-08-09 |
| **Approved By** | — |

> v0.1 **ไม่มี SQL database** — state ทั้งหมดเป็นไฟล์บนดิสก์ (local-first) ไฟล์นี้คือ schema ของมัน

## คลังเสียง (DR-001)

```
data/voices/
├─ <id>.wav      # เสียงอ้างอิง (id = 12-char hex, FR-01.5)
└─ <id>.json     # metadata: { name, ref_text, language: "th"|"en" }
```

## งาน (Jobs) + ผลลัพธ์ (DR-002)

- Job spawn ผ่าน `app/jobs/` → progress ผ่าน WebSocket → ผลลัพธ์เป็นไฟล์ให้ download
- ✏️ TODO — จด path output จริง + โครง job record (id, type, status, error) + นโยบายลบไฟล์เก่า

## Runtime (monorepo ใหม่ — DR-003)

```
runtime/
├─ data/      # ✏️ TODO — schema เมื่อ Wave migration นิ่ง
└─ state/     # ✏️ TODO — เช่น project/timeline state ของ workspace
```

## ฝั่ง dev-time (ไม่ ship)

- `orchestration/ledger_vec.json` — vector/ledger ของ swarm dispatch (คู่กับ [LOCAL_MODEL_LEDGER.md](../LOCAL_MODEL_LEDGER.md))
- `orchestration/bench_raw/` — ผล bench ดิบ

## Config

- `backend/.env` — BRAIN_PROVIDER, OLLAMA_*, CLOUD_* (API key ไม่เข้า git; UI แสดง masked)
- `keys/` — Tauri updater signing key (**gitignored — ห้าม commit**)

## Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2026-08-09 | Boss | สร้างผ่าน rwang:doc-architect |
