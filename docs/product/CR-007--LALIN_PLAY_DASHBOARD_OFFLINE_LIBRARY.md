---
version: "0.2.0b"
created_at: "2026-10-20T02:43:00+07:00,Codex"
last_update: "2026-10-20T04:00:00+07:00,Codex"
status: "approved"
superseded_by: null
attributes:
  domain: "product"
  doc_type: "change-request"
  scope: "Lalin Play dashboard, GenesisBlockDB catalog/search, RustFS-ready media objects, offline cache, favorites and source badges"
---

# CR-007 — Dashboard, offline library, cache and favorites

## Request and approval boundary

ผู้ใช้ขอให้ Lalin Play เปิดหน้า Dashboard ที่มีเพลงฟังบ่อยและคำแนะนำ, นำเข้าไฟล์
เพลงไปเก็บใน local storage เพื่อฟัง offline, cache เพลงที่ฟังบ่อย, แสดง badge
`OFFLINE` / `YOUTUBE` / `USER` และกดดาวเพื่อกรองเพลงโปรด รวมถึงดาวน์โหลดจาก
platform เฉพาะเมื่อ source อนุญาต

ผู้ใช้อนุมัติข้อเสนอนี้ในวันที่ 2026-10-20 ด้วยคำตอบ **"อนุมัติตามข้อเสนอ"**.
ขอบเขตเดิมคือ SQLite + app-managed offline copies, cache quota เริ่มต้น 2 GB
และเริ่ม automatic cache หลังฟังสำเร็จ 3 ครั้ง, recommendations แบบ local-only,
และ YouTube แบบ link-only ที่เปิดใน YouTube ทางการ. เริ่ม implementation หลัง
เพิ่ม requirement IDs `PLAY-14..18` ใน PRD/SRS/traceability แล้ว.

ผู้ใช้กำหนดเพิ่มภายหลังให้เตรียมสถาปัตยกรรมสำหรับ self-host/self-streaming โดยใช้
RustFS เป็น S3-compatible object storage และถามให้ใช้ GenesisBlockDB ตัวเดียวแทน
SQLite แยก. CR นี้รับทิศทางดังกล่าว: GenesisBlockDB เป็นฐานข้อมูลเดียวของ catalog,
history, favorites, cache index, relational SQL projection, graph และ vectors;
RustFS เก็บ media objects. การแก้ขอบเขตนี้ไม่อนุญาตให้โหลดหรือ cache สื่อจาก
YouTube.

การอนุมัติ CR-007 ไม่ได้อนุมัติ YouTube download/cache/offline playback และไม่ใช่
หลักฐานว่า build, tests หรือ native Windows offline acceptance ผ่าน.

## Pre-implementation source baseline

- `apps/play-desktop/src-tauri/src/library.rs` เก็บ catalog เป็น
  `library-v1.json` และอ้าง path ของไฟล์ต้นฉบับ; import ปัจจุบันไม่คัดลอก bytes
  เข้า app-managed storage.
- `apps/play-desktop/src/native.ts` แปลงรายการ catalog เป็น local-file media;
  ในแอปยังไม่มี play history, favorite state หรือ remote media provider.
- PRD §4.9 ตั้ง Play เป็น local-first product และปัจจุบันไม่รวม YouTube/DIAL
  playback. CR-007 เสนอเพียงรายการลิงก์ YouTube ที่เปิดผ่าน YouTube ทางการ
  และต้องได้รับอนุมัติก่อนเพิ่ม download/offline playback.
- YouTube API Developer Policies ระบุห้าม download, import, backup, cache หรือ
  เก็บ audiovisual copies และห้าม offline playback โดยไม่มี prior written
  approval; policy guide ยังห้ามแยก audio/video stream. ดู
  [YouTube API Developer Policies](https://developers.google.com/youtube/terms/developer-policies)
  และ [Developer Policies Guide](https://developers.google.com/youtube/terms/developer-policies-guide).
  YouTube Premium offline downloads อยู่ใน YouTube/YouTube Music app ตาม
  [YouTube Help](https://support.google.com/youtube/answer/6308116?hl=en).

## Implementation snapshot — 2026-10-20

- `library_store.rs` now opens one GenesisBlockDB handle for the Play catalog,
  registers relational tables and uses Genesis relational query/batch APIs;
  `cargo check` passes on the current working tree. Legacy JSON migration and
  failure recovery still need automated/native verification.
- User imports currently copy to a content-hash file under app data. The current
  code does not yet provide the approved object-store interface, RustFS endpoint,
  resumable object publication or authenticated byte-range streaming.
- Dashboard, successful-listen history wiring, visible favorites/badges, real
  cache population/eviction and Genesis graph/vector recommendations/search are
  still open. The existing cache setting commands alone do not implement a cache.

## Proposed V1

### 1. Dashboard as the initial page

- เปิด Full มาที่ `Home` / Dashboard เป็นหน้าแรก และเพิ่ม navigation ที่กลับ
  Dashboard ได้จากทุก view.
- แสดง `Recently played`, `Most played` เรียงตาม successful listening count
  และ `Recommended for you` ที่คำนวณจาก play history, favorites และ metadata
  ภายในเครื่องเท่านั้น.
- Recommendation เป็น deterministic local ranking; ไม่เรียก AI, API หรือ
  network. เมื่อยังไม่มีประวัติ ให้แสดง recently added และ empty-state ที่บอก
  วิธีนำเข้าไฟล์ แทนการสร้างข้อมูลฟังปลอม.
- เก็บ play count ครั้งเดียวเมื่อเพลงเล่นถึง 30 วินาที หรือเล่นถึงครึ่งหนึ่ง
  สำหรับเพลงสั้นกว่า 30 วินาที; การเปลี่ยน Full/Compact, resume และ re-render
  ไม่เพิ่ม count.

### 2. GenesisBlockDB catalog and RustFS-ready media objects

- เพิ่มคำสั่ง `Import for offline` ให้ผู้ใช้เลือกไฟล์/โฟลเดอร์; คัดลอกเฉพาะ
  media extensions ที่รองรับเข้า object store ด้วย content-hash key; ไม่อ้าง
  path ต้นทางเป็นแหล่งเล่นหลัก.
- ใช้ GenesisBlockDB เป็นฐานข้อมูลเดียวของ catalog, source/storage state,
  favorites, play history, cache index และ settings. ใช้ Genesis relational
  schema/batch API สำหรับการเขียนและ relational query API สำหรับการอ่าน; SQL
  surface ที่เปิดให้แอปเรียกโดยตรงเป็น read-only. ห้ามเขียน `projection.sqlite`
  โดยตรงหรือทำ dual-write ไปยัง SQLite แยก.
- เก็บ bytes ใน object store ผ่าน interface ของ Lalin. รองรับ local object
  storage สำหรับ offline-first และ S3-compatible endpoint ของ RustFS สำหรับ
  self-host; RustFS เป็น media store ไม่ใช่ catalog database. วาง credential
  ไว้ใน native/backend และ bucket ต้อง private.
- upload เขียน object ชั่วคราวแล้ว publish เป็น immutable content-hash key
  ก่อน commit Genesis metadata; failure จะไม่ทิ้ง catalog row ที่ชี้ไปยัง object
  ไม่ครบ และ orphan objects เก็บกวาดได้ภายหลัง.
- `OFFLINE` ใช้ได้เมื่อมี persistent local object/copy ที่อ่านได้โดยไม่ network.
  Remote RustFS อย่างเดียวไม่ทำให้ playback ใช้ได้ขณะ offline; self-streaming
  ใช้ authenticated media path ที่รองรับ HTTP Range แทนการส่ง S3 credential เข้า
  WebView.
- Migration จาก `library-v1.json` ต้อง transaction/backup-safe, รักษา IDs,
  metadata และ external paths เดิม; ไม่คัดลอกหรือย้ายไฟล์เก่าโดยอัตโนมัติ.
- ไฟล์ต้นฉบับของผู้ใช้ห้ามแก้/ลบ. การลบ row ออกจาก library ไม่ลบ original;
  การลบ managed/offline object ต้องมี action/confirmation แยกและแสดงขนาด
  พื้นที่ที่จะคืน.

### 3. Genesis hybrid search and recommendations

- ใช้ relational projection ใน GenesisBlockDB สำหรับ exact/filter/sort queries;
  ใช้ graph edges สำหรับความสัมพันธ์ที่เกิดจากการฟังร่วมกัน/metadata และ HNSW
  vector collection สำหรับ candidate retrieval. ไม่คัดลอก catalog ไปยัง DB อื่น.
- สร้าง metadata embedding แบบ deterministic ภายในเครื่องได้เมื่อยังไม่มี local
  embedding model; แสดงผลเป็น related/discovery ranking ไม่อ้างว่าเป็น semantic
  understanding จากโมเดล. Query/session vectors ใช้ dimension และ collection
  เดียวกัน.
- บันทึก play/favorite/source metadata เป็น relational rows ก่อน แล้วอัปเดต
  graph/vector เป็น derived index ที่ rebuild ได้จาก Genesis relational data.
  หาก indexing ล้มเหลว ให้ exact search และ basic local recommendation ยังทำงาน
  พร้อมสถานะ index pending; ห้ามแสดงผล vector ที่ค้างว่าเป็นข้อมูลล่าสุด.
- Recommendation ยังคง local-only และ deterministic; ไม่เรียก AI, API หรือ
  network เพื่อจัดอันดับ. Remote RustFS ทำหน้าที่เก็บ/ส่ง media bytes เท่านั้น.

### 4. Source badges and YouTube boundary

- `USER` = ผู้ใช้เลือกนำเข้าไฟล์; `OFFLINE` = bytes มีอยู่ใน app-managed store
  และ Play เปิดได้โดยไม่ network; แสดง badge ทั้งสองร่วมกันได้.
- `YOUTUBE` = รายการ link ที่ผู้ใช้เพิ่มเอง; เก็บ URL ที่ผู้ใช้ป้อนและเปิดใน
  external YouTube app/site. รายการนี้ไม่เข้า Play queue และไม่เล่น/แยกเสียง
  ภายใน Lalin Play.
- Generic platform download ทำได้เฉพาะ adapter ที่ platform เปิด download
  endpoint และ offline/cache right อย่างชัดเจน; ใช้ HTTPS, domain allowlist,
  size/format limits และไม่ใช้ scraping, cookie extraction, DRM bypass หรือ
  endpoint ที่ไม่เป็นทางการ.
- **YouTube ไม่มี download/cache/offline adapter ใน V1** หากยังไม่มี prior
  written approval จาก YouTube ที่ครอบคลุมการกระทำเหล่านั้น. หากมี approval
  ภายหลัง ให้เพิ่ม provider-specific CR และตรวจ API terms ใหม่ก่อน implement.

### 5. Cache and frequent-play behavior

- User-imported files เป็น durable offline copies อยู่แล้ว; ไม่สร้าง cache ซ้ำ
  จากไฟล์เหล่านั้น.
- Automatic cache ใช้ได้เฉพาะ authorized providers ที่ให้สิทธิ์ cache/offline
  อย่างชัดเจน. เมื่อ track ถึง 3 successful listens ให้ cache ได้หากเปิด
  `Cache frequently played` ไว้.
- Cache quota เริ่มต้น 2 GB, ปรับได้ใน Settings; เมื่อเกิน quota ให้ลบเฉพาะ
  least-recently-used transient cache items และไม่ลบ user-imported files หรือ
  pinned downloads. Cache miss/expiry ต้องมี fallback/error ที่เข้าใจได้.
- Provider ที่ไม่อนุญาต offline/cache ต้องเล่นตาม provider surface/เงื่อนไข
  ของตนเองและไม่แสดง `OFFLINE`.

### 6. Favorites and library filters

- เพิ่มปุ่มดาวที่เข้าถึงได้ด้วย keyboard/screen reader ในรายการเพลงและเก็บค่า
  favorite ลง local DB.
- เพิ่ม filter `Favorites`; เปลี่ยน view/surface และ restart แล้วสถานะยังอยู่.
- Filter ไม่เปลี่ยน queue ปัจจุบันหรือหยุดเพลง.

## Acceptance proposal

1. Full เปิด Dashboard ก่อน; most-played order ใช้ persisted listening count;
   recently played และ local recommendations ไม่สร้าง fake history.
2. User import สร้าง app-managed copy ที่เปิดเล่นได้เมื่อไฟล์ต้นทางถูกถอด/ย้าย
   และเมื่อไม่มี network; original file remains untouched.
3. GenesisBlockDB relational catalog/history/favorites/cache metadata อยู่ใน DB
   เดียวกับ graph/vector index; migration รักษา catalog v1 และ failure/rollback
   ไม่ทำข้อมูลหายหรือทิ้ง partial objects.
4. `OFFLINE`, `USER`, `YOUTUBE` badges สื่อความหมายตามข้อ 3 และกดดาว/กรอง
   Favorites ทำงานได้หลัง restart.
5. Cache เปิด/ปิดได้, bounded quota ใช้ LRU กับ transient authorized cache
   เท่านั้น และไม่ทำให้ไฟล์ user import ถูกลบ.
6. ไม่มี generic YouTube downloader, audio extractor, background YouTube
   player, cookie/scraping path หรือ offline cache โดยไม่มี written approval.
7. เปิดแอปและค้น/ฟัง media ที่ `OFFLINE` ได้โดยปิด network; runtime evidence
   ต้องมาจาก native Windows Play, ไม่ใช่ browser mock.
8. Dashboard, Genesis relational migration, object upload rollback,
   favorite/history persistence, hybrid search, source badges และ cache policy
   มี unit/contract tests; build ผ่าน และเก็บ native offline acceptance แยกจาก
   automated checks.

Approved traceability IDs `PLAY-14..20` (Dashboard, Genesis-backed catalog,
authorized source links/downloads, bounded cache, favorites/badges, RustFS-ready
object storage, and Genesis hybrid recommendations/search) are allocated in
PRD/SRS and mapped in the Play traceability matrix.

## Scope and decision requested

## Approval record

- **Decision:** Approved as proposed.
- **Date:** 2026-10-20.
- **Approved boundary:** GenesisBlockDB as the only catalog/index database;
  RustFS-compatible media object storage with local offline objects/copies,
  local-only graph/vector-assisted recommendations, 2 GB default authorized-source
  cache, cache after 3 successful listens, favorites and source badges; YouTube
  remains an external official link with no Play download/cache/offline path.
- **Implementation state:** In progress; requirements are now canonical. Build,
  automated tests and native offline acceptance are recorded separately.
