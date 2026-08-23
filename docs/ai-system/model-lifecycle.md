# Model Lifecycle — G-Music

| Field | Value |
|-------|-------|
| **Version** | 1.1.0b |
| **Status** | Beta |
| **Author** | Boss |
| **Created** | 2026-08-09 |
| **Last Updated** | 2026-08-23 |
| **Approved By** | Boss — Phase 1 scope approved 2026-08-23 |

วงจรชีวิตโมเดลในเครื่องผู้ใช้: เลือก → ได้มา → โหลด → ใช้ → ประเมิน → อัปเดต/ถอน (G-Music ไม่ฝึกโมเดลเอง — ใช้ pretrained + BYOM)

## 1. การได้มา (Acquisition)

| ช่องทาง | ใช้กับ | กลไก |
|---|---|---|
| Hugging Face (`cached_path`) | F5-TTS-THAI (ckpt pin: `model_1000000.pt`) | ดาวน์โหลดครั้งแรก + cache |
| ดาวน์โหลดอัตโนมัติครั้งแรกที่ใช้ | faster-whisper large-v3 (~3GB) | lazy — โหลดตอนรัน dubbing ครั้งแรก |
| `uv pip install` แยก (optional) | demucs, psola, pedalboard | lazy import — แอป boot ได้แม้ยังไม่ลง (FR-04b.9) |
| Ollama pull (BYOM) | brain local ทุกตัว | ผู้ใช้จัดการเอง ผ่าน Ollama |

**กติกา pin:** โมเดลใน core ต้อง pin checkpoint/เวอร์ชันชัดเจน — ห้าม `latest` (กัน upstream เปลี่ยนแล้วพฤติกรรมเพี้ยนเงียบ ๆ)

## 2. การโหลด + งบ VRAM (RTX 3060 12GB)

- Heavy deps ทั้งหมดเป็น **lazy import** — error ตอนเรียกใช้พร้อมข้อความแนะนำติดตั้ง ไม่ใช่ตอน boot
- ASR/TTS requested device default = `auto`; resolve ตอน pipeline เริ่มใช้จริง ไม่ cold-import จาก `/runtime/status`. CPU fallback ใช้ ASR `int8` และแสดง warning ไทยใน UI
- โหลด**ทีละขั้น**: remix chain เรียก `torch.cuda.empty_cache()` หลังจบ stem split (`music.py`)
- JobManager บังคับ CUDA job แบบ FIFO concurrency 1 และ cleanup กลางหลัง done/error; CPU job ไม่รอ GPU lock
- Ollama แชร์ VRAM กับ pipeline — cold-load โมเดลใหญ่ >4 นาที (timeout 600s รองรับแล้ว, FR-05.7)
- `gpu_min_free_mb` รองรับ threshold ต่อ `tts`/`dubbing`/`remix`; ค่า default ยังเป็น `0` จนกว่าจะได้ peak measurement จริง จึง enforce เฉพาะ FIFO และ **ยังห้ามปิด R-004**

| Job kind | Peak VRAM RTX 3060 | Headroom 10% | Config threshold | Evidence |
|---|---:|---:|---:|---|
| TTS | pending manual measurement | pending | `0` | CPU-TTS/GPU smoke ยังไม่รันรอบนี้ |
| Dubbing | pending manual measurement | pending | `0` | concurrent-submit manual gate ยังเปิด |
| Remix | pending manual measurement | pending | `0` | concurrent-submit manual gate ยังเปิด |

## 3. การประเมิน (Eval Gate)

- TTS: `backend/smoke_tts.py` — ต้องผ่านก่อนเปลี่ยน checkpoint/engine
- ✏️ TODO — eval ขั้นต่ำต่อ pipeline (ASR: WER ชุดไทย · remix: LUFS target ± tolerance) ให้รันได้ใน CI
- Local brain (dev-swarm): Verify Gate + บันทึกผ่าน/ตกใน [LOCAL_MODEL_LEDGER.md](../LOCAL_MODEL_LEDGER.md)

## 4. BYOM (Bring Your Own Model)

- **Brain:** ผู้ใช้ชี้ Ollama model tag ใดก็ได้ / ใส่ API key cloud เอง — สลับสดผ่าน `POST /brain/config`
- **ส่วน GPL/CPML (FX, autotune, mastering, XTTS):** แจกเป็น optional plugin ให้ผู้ใช้ติดตั้งเอง — ดูเหตุผลใน [ethics-governance](ethics-governance.md) AI-ETH-003 และกลไก plugin: `backend/app/routers/plugins.py`, `packs.py` (Wave 5.1)
- ✏️ TODO — สเปก manifest ของ plugin pack (ชื่อ, license, ไฟล์, checksum)

## 5. อัปเดต / ถอนโมเดล

- เปลี่ยน checkpoint = แก้ model card + ผ่าน eval gate + จด Version History
- ถอนโมเดล: ลบ card → ย้ายไปสถานะ Retired (เก็บไฟล์ card ไว้เป็นประวัติ) + ลบแถวใน [C-model-cards](../appendices/C-model-cards.md)

## Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2026-08-09 | Boss | สร้างผ่าน rwang:doc-architect |
| 1.1.0b | 2026-08-23 | LALIN | เพิ่ม auto CPU fallback, single-GPU FIFO และ measured-threshold gate; ยังไม่ใส่ตัวเลขที่ไม่ได้วัด |
