# Smart Medley v1.1 evidence kit (PLAY-27)

คู่มือนี้ใช้เก็บหลักฐานตาม [Smart Medley v1.1 spec §4](../../../design/LALIN_PLAY_SMART_MEDLEY_V1_1_SPEC.md#4-reduced-v11-evidence-contract-owner-approved-2026-11-09) และนิยามตัวหาร/การปัดเศษจาก W0-F ที่สืบทอดมา ชุดนี้สร้างเสียงสังเคราะห์โดยไม่เรียก network, cloud, LLM หรือ GPU; ผลบนเสียงสังเคราะห์ใช้ตรวจท่อหลักฐาน ไม่ใช่ผลแทนชุด Creative Commons หรือการฟังในแอป

## 1. Build ตัวช่วย

เปิด PowerShell ที่ root ของ repository แล้วตั้ง Cargo target ตาม lane ที่ได้รับมอบหมาย จากนั้น build binary ที่เปิดด้วย feature เฉพาะ:

ต้องมีพื้นที่ว่างบนไดรฟ์ของ target อย่างน้อยประมาณ 5 GB และอย่ารัน Cargo ตัวอื่นพร้อมกันในโฟลเดอร์ target เดียวกัน

```powershell
cd apps/play-desktop
$env:CARGO_TARGET_DIR = 'E:\lalin\apps\play-desktop\src-tauri\target'
cargo build --manifest-path src-tauri/Cargo.toml --locked --features smart-medley-evidence --bin smart-medley-evidence
$Kit = Join-Path $env:CARGO_TARGET_DIR 'debug\smart-medley-evidence.exe'
```

## 2. สร้าง fixture สังเคราะห์

ใช้โฟลเดอร์งานทดสอบนอก repository ไฟล์เสียงทั้ง 40 ไฟล์เป็น WAV, stereo, PCM16, 44.1 kHz, 60 วินาที และสร้างซ้ำด้วย bytes เดิมได้:

```powershell
$Synthetic = 'E:\lalin-play-evidence\synthetic'
& $Kit generate --out $Synthetic
```

manifest มี 20 คู่: 10 คู่ที่คาดว่าเข้าเกณฑ์ (คีย์เหมือนกัน/relative/fifth, BPM เท่ากันภายใน 3%, cue phase จัดแนว) และ 10 คู่ที่คาดว่าไม่เข้าเกณฑ์จาก tempo ต่างเกิน 3%, คีย์ที่เข้ากันไม่ได้, สัญญาณเพลงสั้น/ความเชื่อมั่นต่ำ หรือ noise ที่ไม่ใช่เพลง `manifest.synthetic.json` เก็บ hash และ label ที่ทราบจากการสร้าง

## 3. เลือกและติด label เพลง Creative Commons 20 คู่

คัดเสียง 40 คลิปจากแหล่งที่อนุญาตให้ใช้และเก็บในเครื่อง โดยให้เป็นข้อมูล held-out ที่ analyzer ยังไม่เห็น เลือก 10 คู่ expected-eligible และ 10 คู่ expected-ineligible โดยมี non-music 4 คู่ ใช้ `manifest.cc.template.json` เป็นแบบฟอร์ม และบันทึกต่อคลิป:

- `path` เป็น path แบบ relative จากโฟลเดอร์ fixture, `sha256` ของไฟล์จริง และ source page URL;
- exact licence identifier/URL และข้อความ attribution ที่ใบอนุญาตกำหนด;
- reference BPM, tonic (0–11), mode และช่วง cue-in/cue-out ที่ยอมรับได้; คลิป non-music ให้ใส่ `null` ใน reference ทั้งห้ารายการ เพราะไม่มี musical ground truth;
- stratum และเหตุผล label ใน `notes`; เพิ่ม `allowedKeys` เฉพาะเมื่อ reference อนุญาต relative-key equivalence.

เปลี่ยน placeholder ทุกจุด รวม BPM/key/cue windows, source URL, licence, attribution, clip paths และ hashes ก่อน freeze ห้ามใช้ track title, ชื่อบุคคล หรือ absolute user path ใน notes/IDs อย่าใช้ไฟล์จาก YouTube หรือไฟล์ที่สิทธิ์ไม่ชัดเจน

```powershell
$Cc = 'E:\lalin-play-evidence\creative-commons'
New-Item -ItemType Directory -Force -Path $Cc | Out-Null
Copy-Item 'docs/validation/evidence/play-v1.1-smart-medley/manifest.cc.template.json' "$Cc\manifest.cc.json"
```

## 4. Freeze label และ hash ก่อนวิเคราะห์

รัน freeze ในแต่ละ fixture directory ไฟล์ manifest ต้องมี 20 คู่และ 10/10 expected labels; ชุด CC ต้องมี non-music 4 คู่ `freeze` ตรวจ hash ของทุกไฟล์ แล้วสร้าง `manifest.frozen.json` กับ `manifest.frozen.sha256` หากเปลี่ยนเสียงหรือ label ให้ทำชุดใหม่และ freeze ก่อนเริ่ม analyze:

```powershell
& $Kit freeze --manifest "$Synthetic\manifest.synthetic.json"
$Cc = 'E:\lalin-play-evidence\creative-commons'
& $Kit freeze --manifest "$Cc\manifest.cc.json"
```

อย่าแก้ `manifest.frozen.json` หลัง freeze; evaluator และ scorer จะปฏิเสธเมื่อ manifest, hash sidecar หรือ clip hash เปลี่ยน

## 5. Evaluate และ score

ตัว evaluator เรียก `analyze_pinned_media` และ production pair decision โดยตรง ไม่คัดลอกหรือลด threshold ของ analyzer ผล JSONL เก็บ estimates, confidences, T/K/C/Q, score, eligibility/fallback reason, analyzer version และ content hashes โดยไม่มี clip paths:

```powershell
& $Kit evaluate --manifest "$Synthetic\manifest.frozen.json" --out "$Synthetic\results.jsonl"
node tools/verify/smart_medley_evidence.mjs score --manifest "$Synthetic\manifest.frozen.json" --results "$Synthetic\results.jsonl"

& $Kit evaluate --manifest "$Cc\manifest.frozen.json" --out "$Cc\results.jsonl"
node tools/verify/smart_medley_evidence.mjs score --manifest "$Cc\manifest.frozen.json" --results "$Cc\results.jsonl"
```

Scorer รายงาน clear coverage, combined compatible coverage, pair false-positive พร้อม `floor(0.05 × N)`, BPM/key/cue false-confidence พร้อม Wilson 95% CI และ guard ของ low-confidence/non-music/low-quality strata ค่าที่มี accepted estimates ต่ำกว่า 20 จะแสดง `INSUFFICIENT_SAMPLE`; อย่าปรับ analyzer thresholds เพื่อทำให้แถวผ่าน และเก็บผล FAIL ตามจริง

เมื่อ score synthetic หรือ CC แยกกัน จะมี expected-ineligible เพียง 10 คู่ จึงต้องรายงาน pair false-positive เป็น `INSUFFICIENT_SAMPLE` ตาม minimum 20 คู่ของ W0-F หลัง evaluate ทั้งสองชุดแล้ว ใช้คำสั่งนี้รวมตัวหาร 20/20 โดยให้ CC เป็น manifest หลักสำหรับ listening key:

```powershell
node tools/verify/smart_medley_evidence.mjs score `
  --manifest "$Cc\manifest.frozen.json" --results "$Cc\results.jsonl" `
  --also-manifest "$Synthetic\manifest.frozen.json" --also-results "$Synthetic\results.jsonl"
```

รัน unit tests ของสูตร scorer ด้วย Node test runner:

```powershell
node --test --test-isolation=none tools/verify/smart_medley_evidence.test.mjs
```

## 6. Blind listening kit และให้คะแนน

สุ่ม 8 คู่ที่ analyzer ตัดสิน eligible และ 4 Smooth controls ด้วย seed ที่บันทึกไว้ ชุด listening สร้าง WAV ชื่อกลาง `T01.wav`–`T12.wav`, `ratings.csv` และไฟล์ `answer-key.json` แยกต่างหาก:

```powershell
$Listen = 'E:\lalin-play-evidence\listening'
& $Kit listening --manifest "$Cc\manifest.frozen.json" --results "$Cc\results.jsonl" --seed 27001 --crossfade-seconds 5 --out $Listen
```

ไฟล์ transition เป็น **offline render ไม่ใช่เสียงจาก in-app player** ใช้ equal-power cosine/sine crossfade และ duration ต้องตรงกับ Smooth setting ปัจจุบัน (ค่าเริ่มต้น 5 วินาที; ส่ง `--crossfade-seconds 2..12` เมื่อตั้งค่าอื่น); Smart Medley ใช้ช่วงท้ายที่สิ้นสุดตรง cue-out และเริ่มขาเข้า ณ cue-in ส่วน Smooth ใช้ท้าย/ต้นคลิป ก่อนฟังให้ซ่อน `answer-key.json` และให้ owner คนเดียวกรอก rating 1–5, artifact yes/no และ notes ใน CSV จากนั้นเปิดเฉลยและให้ scorer ตัดสิน:

```powershell
node tools/verify/smart_medley_evidence.mjs score --manifest "$Cc\manifest.frozen.json" --results "$Cc\results.jsonl" --ratings "$Listen\ratings.csv" --answer-key "$Listen\answer-key.json"
```

PASS ต้องมีอย่างน้อย 6 ใน 8 Smart transitions ได้ rating ≥4 และไม่มี artifact ในทั้ง 12 รายการ ให้ owner ฟัง transition อย่างน้อยหนึ่งรายการใน in-app player เป็น spot check เพิ่ม และบันทึกแยกจากคะแนน offline; offline render ไม่ใช่ native listening acceptance

## 7. ตั้ง Hyper-V VM และรัน benchmark

ตั้ง VM บน Hyper-V Manager ตามนี้:

1. สร้าง Generation 2 VM แล้วติดตั้ง Windows 11 x64 Home/Pro รุ่นปัจจุบันจากสื่อที่ได้รับอนุญาต
2. ตั้ง Processor เป็น 4 virtual processors; ตั้ง Startup memory เป็น 8192 MB, ยกเลิก **Use Dynamic Memory for this virtual machine** และตรวจว่า GPU passthrough ปิดอยู่
3. ติดตั้ง Windows updates ให้เสร็จ รีสตาร์ต แล้วรัน benchmark ภายใน guest ด้วย PowerShell

สคริปต์ตรวจ `Win32_ComputerSystem.Model = Virtual Machine`, 4 logical processors, RAM ตั้งแต่ 8 GiB แต่ต่ำกว่า 9 GiB และ video controller ที่ไม่ใช่ Microsoft Hyper-V display adapter; บันทึก `measuredOn: hyperv-vm` กับ CPU model ที่ guest เปิดเผยได้ Hyper-V memory mode เป็นการตั้งค่าฝั่ง host ให้ตรวจใน Hyper-V Manager ด้วย

เตรียม input benchmark แยกจาก fixture: local rights-cleared WAV ยาว 180 วินาที, 44.1 kHz, stereo, PCM16 พร้อม SHA-256 แล้วรันภายใน guest:

```powershell
$env:CARGO_TARGET_DIR = 'E:\lalin\apps\play-desktop\src-tauri\target'
$Input = 'E:\lalin-play-evidence\benchmark\pinned-180s.wav'
$Hash = (Get-FileHash -Algorithm SHA256 $Input).Hash.ToLowerInvariant()
.\apps\play-desktop\benchmarks\smart-medley\run.ps1 `
  -InputFile $Input `
  -Sha256 $Hash `
  -Profile hyperv-v11 `
  -EvidenceRoot 'E:\lalin-play-evidence\benchmark\run-01'
```

สคริปต์ default `strict` ยังคงตรวจ host profile เดิม; ใช้ `hyperv-v11` เฉพาะ guest ที่ผ่านเงื่อนไขข้างต้น Benchmark รายงาน cold/cached timings เท่านั้น ไม่ปิด gate เรื่อง memory, dropout, fixture accuracy หรือ listening

## 8. แบบบันทึกการฟัง dropout 15 นาที

ทำ spot check นี้ในแอปจริงบน VM: เปิดเพลงต่อเนื่องและทำ Smart Medley analysis ระหว่างเล่น 15 นาที บันทึกเวลา/ช่วงที่ได้ยิน hard cut, silence, clipping หรือ dropout โดยไม่เปลี่ยน endpoint/volume ระหว่าง session ผลจาก offline renderer หรือ benchmark timing ใช้แทนขั้นตอนนี้ไม่ได้

```text
วันที่/เวลา (local): ____________________    build/analyzer version: ____________________
VM profile: ____________________________    output endpoint: __________________________
Playback start: ________________________    concurrent analysis start: ________________
Playback end: __________________________    analysis end: ______________________________
ระดับเสียง/การตั้ง endpoint ที่คงไว้: __________________________________________________

นาที | เวลาโดยประมาณ | เหตุการณ์ (hard cut/silence/clipping/dropout/none) | รายละเอียดสั้น
-----|-----------------|-----------------------------------------------|----------------
01   |                 |                                               |
02   |                 |                                               |
03   |                 |                                               |
04   |                 |                                               |
05   |                 |                                               |
06   |                 |                                               |
07   |                 |                                               |
08   |                 |                                               |
09   |                 |                                               |
10   |                 |                                               |
11   |                 |                                               |
12   |                 |                                               |
13   |                 |                                               |
14   |                 |                                               |
15   |                 |                                               |

ผลรวม: [ ] ไม่พบเหตุการณ์   [ ] พบเหตุการณ์ (แนบ timestamp/คำอธิบายโดยไม่ใส่ชื่อไฟล์ส่วนตัว)
ผู้ฟัง owner: ____________________    หมายเหตุ: __________________________________________
```

เก็บ manifest, ratings, key และผลดิบในพื้นที่ทดสอบที่เข้าถึงได้เฉพาะผู้ทดสอบ อย่า commit WAV, answer key, user path หรือผลดิบจากเพลงส่วนตัว เมื่อตรวจครบแล้วจึงคัดลอกเฉพาะ JSON/CSV summary ขนาดเล็กที่ไม่มีข้อมูลส่วนบุคคลเข้ามาในโฟลเดอร์นี้

## ผลรอบแรกบนเสียงสังเคราะห์ (lead run 2026-11-09, analyzer `smart-medley-0.1.0`)

รันโดย lead บนเครื่อง dev (ไม่ใช่ VM) เพื่อพิสูจน์ว่าท่อทำงานครบ: generate (40 WAV, สร้างซ้ำได้ byte เดิม) → freeze → evaluate (20 คู่, ~13 วินาที) → score ผลจริง **ยังไม่ผ่าน** และไม่ได้ปรับเกณฑ์:

| แถว | ผล |
|---|---|
| clear coverage | FAIL 0/10 (Wilson 0.0–27.8%) |
| BPM false-confidence | PASS 0/24 |
| cue false-confidence | PASS 0/36 |
| key false-confidence | INSUFFICIENT_SAMPLE (accepted 9 < 20) |
| non-music / low-confidence fallback | PASS 2/2, 1/1 |

สาเหตุที่เห็นจาก `results.jsonl`: คลิป C major ทุกคลิปได้ key confidence 0.68 (< 0.75) ขณะที่ A minor / G major / D major ได้ 0.97–0.99 และคลิปที่ 60, 66, 123, 128 BPM ได้ BPM confidence 0.75–0.77 (< 0.80) ต้องทำ RCA ต่อว่าเป็นที่ analyzer หรือ generator ก่อนเริ่มชุด Creative Commons; ชุดฟัง (`listening`) จึงยังสร้างไม่ได้เพราะไม่มีคู่ eligible
