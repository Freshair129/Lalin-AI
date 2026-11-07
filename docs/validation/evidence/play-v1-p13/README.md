# P1.3 round 3 screenshot inventory

Captured in headless Edge at 1280x800 and 360x800 using mocked Tauri IPC and fixture library data. These images do not establish native rendering, real imports, audio, or full dialog and below-fold coverage. EN default and TH reload persistence were observed. The horizontal navigation and the main/side panels are intentionally scrollable; controls inside an axis-scrollable ancestor are exempt from clipping on that axis. The bounding-box check reports partially visible controls outside the viewport or a non-scrollable hidden/clip ancestor; it does not detect occlusion, text truncation, or all visual defects. DOM visible text is viewport-intersection based and may include partly obscured text. The `cdp-results.json` retains each row's DOM text and control counts.

For each TH image the review column lists every visible text node containing Latin letters, including permitted product names, mode names, language toggle, YouTube, units, paths and fixture-provided titles/artist/album/playlist/link names. Fixture playlist and link names are user content. EN rows were checked for Thai characters in visible DOM text. This is not a review of offscreen content, attributes, input placeholders, dialogs, or native UI.

| Screenshot | Document overflow | Clipped controls | Mixed/untranslated review (visible DOM text) |
|---|---:|---:|---|
| [home-en-1280.png](home-en-1280.png) | no | 0 | No Thai detected |
| [tracks-en-1280.png](tracks-en-1280.png) | no | 0 | No Thai detected |
| [favorites-en-1280.png](favorites-en-1280.png) | no | 0 | No Thai detected |
| [artists-en-1280.png](artists-en-1280.png) | no | 0 | No Thai detected |
| [albums-en-1280.png](albums-en-1280.png) | no | 0 | No Thai detected |
| [queue-en-1280.png](queue-en-1280.png) | no | 0 | No Thai detected |
| [mixer-en-1280.png](mixer-en-1280.png) | no | 0 | No Thai detected |
| [equalizer-en-1280.png](equalizer-en-1280.png) | no | 0 | No Thai detected |
| [repair-en-1280.png](repair-en-1280.png) | no | 0 | No Thai detected |
| [youtube-en-1280.png](youtube-en-1280.png) | no | 0 | No Thai detected |
| [playlist-en-1280.png](playlist-en-1280.png) | no | 0 | No Thai detected |
| [settings-en-1280.png](settings-en-1280.png) | no | 0 | No Thai detected |
| [compact-en-1280.png](compact-en-1280.png) | no | 0 | No Thai detected |
| [home-th-1280.png](home-th-1280.png) | no | 0 | `Lalin Play`; `Compact ↙`; `ENG`; `TH`; `ลิงก์ YouTube`; `LALIN PLAY`; `First Track`; `Example Artist`; `Example Album`; `Second Track`; `Another Artist`; `Other Album` |
| [tracks-th-1280.png](tracks-th-1280.png) | no | 0 | `Lalin Play`; `Compact ↙`; `ENG`; `TH`; `ลิงก์ YouTube`; `First Track`; `Example Artist`; `Example Album`; `Second Track`; `Another Artist`; `Other Album` |
| [favorites-th-1280.png](favorites-th-1280.png) | no | 0 | `Lalin Play`; `Compact ↙`; `ENG`; `TH`; `ลิงก์ YouTube`; `First Track`; `Example Artist`; `Example Album` |
| [artists-th-1280.png](artists-th-1280.png) | no | 0 | `Lalin Play`; `Compact ↙`; `ENG`; `TH`; `ลิงก์ YouTube`; `Another Artist`; `Second Track`; `Other Album`; `Example Artist`; `First Track`; `Example Album` |
| [albums-th-1280.png](albums-th-1280.png) | no | 0 | `Lalin Play`; `Compact ↙`; `ENG`; `TH`; `ลิงก์ YouTube`; `Example Album`; `First Track`; `Example Artist`; `Other Album`; `Second Track`; `Another Artist` |
| [queue-th-1280.png](queue-th-1280.png) | no | 0 | `Lalin Play`; `Compact ↙`; `ENG`; `TH`; `ลิงก์ YouTube` |
| [mixer-th-1280.png](mixer-th-1280.png) | no | 0 | `Lalin Play`; `Compact ↙`; `ENG`; `TH`; `ลิงก์ YouTube`; `เสียงสื่อที่ Lalin Play กำลังเล่น` |
| [equalizer-th-1280.png](equalizer-th-1280.png) | no | 0 | `Lalin Play`; `Compact ↙`; `ENG`; `TH`; `ลิงก์ YouTube`; `ระดับขยาย (dB) ตามความถี่ (Hz) · ไม่รวมระดับขยายรวม`; `−12 ถึง +12 dB` |
| [repair-th-1280.png](repair-th-1280.png) | no | 0 | `Lalin Play`; `Compact ↙`; `ENG`; `TH`; `ลิงก์ YouTube`; `Damaged Track`; `· Example Artist`; `· Example Album`; `C:\fixture\missing.wav` |
| [youtube-th-1280.png](youtube-th-1280.png) | no | 0 | `Lalin Play`; `Compact ↙`; `ENG`; `TH`; `ลิงก์ YouTube`; `เปิดลิงก์ใน YouTube โดยตรง Lalin Play ไม่ดาวน์โหลดหรือเล่นเสียง YouTube`; `YOUTUBE`; `Example link`; `เปิดใน YouTube` |
| [playlist-th-1280.png](playlist-th-1280.png) | no | 0 | `Lalin Play`; `Compact ↙`; `ENG`; `TH`; `ลิงก์ YouTube`; `Example Playlist` |
| [settings-th-1280.png](settings-th-1280.png) | no | 0 | `Lalin Play`; `Compact ↙`; `ENG`; `TH`; `ลิงก์ YouTube`; `เลือกไฟล์ย้ายข้อมูลที่ส่งออกจากลลิน สตูดิโอ แล้ว Lalin Play จะแสดงตัวอย่างและตรวจไฟล์ในเครื่องก่อนเขียนข้อมูล` |
| [compact-th-1280.png](compact-th-1280.png) | no | 0 | `มีไฟล์ออฟไลน์ 1 ไฟล์ที่ต้องซ่อมแซม สลับไปที่ Full เพื่อซ่อมแซม` |
| [home-en-360.png](home-en-360.png) | no | 0 | No Thai detected |
| [tracks-en-360.png](tracks-en-360.png) | no | 0 | No Thai detected |
| [favorites-en-360.png](favorites-en-360.png) | no | 0 | No Thai detected |
| [artists-en-360.png](artists-en-360.png) | no | 0 | No Thai detected |
| [albums-en-360.png](albums-en-360.png) | no | 0 | No Thai detected |
| [queue-en-360.png](queue-en-360.png) | no | 0 | No Thai detected |
| [mixer-en-360.png](mixer-en-360.png) | no | 0 | No Thai detected |
| [equalizer-en-360.png](equalizer-en-360.png) | no | 0 | No Thai detected |
| [repair-en-360.png](repair-en-360.png) | no | 0 | No Thai detected |
| [youtube-en-360.png](youtube-en-360.png) | no | 0 | No Thai detected |
| [playlist-en-360.png](playlist-en-360.png) | no | 0 | No Thai detected |
| [settings-en-360.png](settings-en-360.png) | no | 0 | No Thai detected |
| [compact-en-360.png](compact-en-360.png) | no | 0 | No Thai detected |
| [home-th-360.png](home-th-360.png) | no | 0 | `Lalin Play`; `Compact ↙`; `ENG`; `TH`; `LALIN PLAY` |
| [tracks-th-360.png](tracks-th-360.png) | no | 0 | `Lalin Play`; `Compact ↙`; `ENG`; `TH`; `First Track`; `Example Artist`; `Second Track` |
| [favorites-th-360.png](favorites-th-360.png) | no | 0 | `Lalin Play`; `Compact ↙`; `ENG`; `TH`; `First Track`; `Example Artist` |
| [artists-th-360.png](artists-th-360.png) | no | 0 | `Lalin Play`; `Compact ↙`; `ENG`; `TH`; `Another Artist`; `Second Track` |
| [albums-th-360.png](albums-th-360.png) | no | 0 | `Lalin Play`; `Compact ↙`; `ENG`; `TH`; `Example Album`; `First Track`; `Example Artist` |
| [queue-th-360.png](queue-th-360.png) | no | 0 | `Lalin Play`; `Compact ↙`; `ENG`; `TH` |
| [mixer-th-360.png](mixer-th-360.png) | no | 0 | `Lalin Play`; `Compact ↙`; `ENG`; `TH`; `เสียงสื่อที่ Lalin Play กำลังเล่น` |
| [equalizer-th-360.png](equalizer-th-360.png) | no | 0 | `Lalin Play`; `Compact ↙`; `ENG`; `TH` |
| [repair-th-360.png](repair-th-360.png) | no | 0 | `Lalin Play`; `Compact ↙`; `ENG`; `TH`; `Damaged Track`; `· Example Artist`; `· Example Album` |
| [youtube-th-360.png](youtube-th-360.png) | no | 0 | `Lalin Play`; `Compact ↙`; `ENG`; `TH`; `ลิงก์ YouTube`; `เปิดลิงก์ใน YouTube โดยตรง Lalin Play ไม่ดาวน์โหลดหรือเล่นเสียง YouTube` |
| [playlist-th-360.png](playlist-th-360.png) | no | 0 | `Lalin Play`; `Compact ↙`; `ENG`; `TH`; `Example Playlist` |
| [settings-th-360.png](settings-th-360.png) | no | 0 | `Lalin Play`; `Compact ↙`; `ENG`; `TH` |
| [compact-th-360.png](compact-th-360.png) | no | 0 | `มีไฟล์ออฟไลน์ 1 ไฟล์ที่ต้องซ่อมแซม สลับไปที่ Full เพื่อซ่อมแซม` |
