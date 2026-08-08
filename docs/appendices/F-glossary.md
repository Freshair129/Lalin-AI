# Appendix F — Glossary

| Field | Value |
|-------|-------|
| **Version** | 1.0.0 |
| **Status** | Active |
| **Author** | Boss |
| **Created** | 2026-08-09 |
| **Last Updated** | 2026-08-09 |
| **Approved By** | — |

> รวมจาก SRS §1.3 + คำที่เกิดใหม่ตาม Wave — เพิ่มคำใหม่ที่นี่ที่เดียว แล้วให้เอกสารอื่นอ้างมา

| คำ | ความหมาย |
|----|----------|
| **ASR** | Automatic Speech Recognition — ถอดเสียงเป็นข้อความ |
| **TTS** | Text-to-Speech — แปลงข้อความเป็นเสียง |
| **Voice Cloning** | โคลนเสียงจากตัวอย่างสั้น (zero-shot) |
| **Dubbing** | พากย์เสียง — แทนที่เสียงต้นฉบับด้วยเสียงพากย์ภาษาอื่น |
| **Mastering** | ปรับคุณภาพเสียงรวมให้ได้มาตรฐาน broadcast/streaming |
| **Brain** | ระบบ LLM ของแอป (แปล/สคริปต์/chat) — สลับ local↔cloud ได้ |
| **LUFS** | Loudness Units Full Scale — หน่วยวัดความดัง (-14 Spotify / -16 Apple / -9 Club) |
| **Segment** | ส่วนย่อยของเสียงที่แบ่งตาม VAD/timestamps |
| **Job** | งานเบื้องหลังที่รายงาน progress ผ่าน WebSocket |
| **Stem** | แทร็กที่แยกจากเพลงรวม (vocal/instrumental) ด้วย Demucs |
| **BYOM** | Bring Your Own Model — ผู้ใช้ติดตั้งโมเดล/ส่วน GPL เอง แอปหลักไม่ bundle |
| **BYOK** | Bring Your Own Key — ผู้ใช้ใส่ API key cloud ของตัวเอง |
| **MCP** | Model Context Protocol — โปรโตคอลให้ agent ภายนอกเรียกความสามารถแอป (`apps/mcp`) |
| **Sidecar** | โปรเซส backend ที่ Tauri spawn มาพร้อมแอป (PyInstaller bundle) |
| **GGUF** | ฟอร์แมตโมเดล quantized ที่ Ollama/llama.cpp ใช้ |
| **Thinking model** | LLM ที่แทรก `<think>…</think>` ก่อนตอบ (Qwen3 ฯลฯ) — ระบบตัดออกอัตโนมัติ |
| **Wave / WP** | รอบงาน / Work Package ของ dev-time swarm (ดู SWARM_PLAN.md) |
| **Gate** | ด่านรีวิวของ swarm: Gate 1 correctness · Gate 2 integration · Final Gate product |
| **Worktree** | สำเนา working copy ของ git ที่ worker แต่ละตัวใช้แยกกัน |
| **Cinemaro** | Design language ของแอป — นีออนไลม์ + space dark + การ์ดมน (BLUEPRINT §design_tokens) |
| **Doc-graph** | `docs/.doc-graph.json` — บันทึกโหนด/เส้นเชื่อมเอกสาร ใช้ตรวจความ sync |

## Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2026-08-09 | Boss | สร้างผ่าน rwang:doc-architect (รวมจาก SRS §1.3) |
