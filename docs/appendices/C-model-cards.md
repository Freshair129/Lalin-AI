# Appendix C — Model Cards Index

| Field | Value |
|-------|-------|
| **Version** | 1.0.0 |
| **Status** | Active |
| **Author** | Boss |
| **Created** | 2026-08-09 |
| **Last Updated** | 2026-08-09 |
| **Approved By** | — |

การ์ดเต็มอยู่ที่ [`docs/ai-system/model-cards/`](../ai-system/model-cards/) — ตารางนี้คือสรุปรวมมุมมอง license/การใช้งาน

| โมเดล | งาน | License | ขายเชิงพาณิชย์ | Card |
|---|---|---|---|---|
| F5-TTS-THAI | TTS/โคลนเสียง (หลัก) | CC-BY-4.0 | ✅ + attribution | [f5-tts-thai](../ai-system/model-cards/f5-tts-thai.md) |
| XTTS v2 | TTS fallback | CPML | ❌ non-commercial | [xtts-v2](../ai-system/model-cards/xtts-v2.md) |
| faster-whisper large-v3 | ASR | MIT | ✅ | [faster-whisper-large-v3](../ai-system/model-cards/faster-whisper-large-v3.md) |
| Demucs htdemucs | Stem split | MIT | ✅ | [htdemucs](../ai-system/model-cards/htdemucs.md) |
| chinda-qwen3-4b (Ollama) | Brain local ไทย | ✏️ TODO ตรวจ | ⚠️ BYOM | [chinda-qwen3-4b](../ai-system/model-cards/chinda-qwen3-4b.md) |

**กติกา:** เพิ่มโมเดลใหม่ = สร้าง card จาก [TEMPLATE](../ai-system/model-cards/TEMPLATE.md) + เพิ่มแถวที่นี่ + เพิ่ม node ใน `.doc-graph.json` **ก่อน merge** (ดู [AI-ETH-003](../ai-system/ethics-governance.md))

> หมายเหตุ: psola/pedalboard/matchering เป็น**ไลบรารี DSP** ไม่ใช่โมเดล ML — ประเด็น license ของพวกมันอยู่ใน [AI-ETH-003](../ai-system/ethics-governance.md) และ [E-risk-matrix](E-risk-matrix.md)

## Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2026-08-09 | Boss | สร้างผ่าน rwang:doc-architect |
