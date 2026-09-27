---
version: "0.2.12b"
created_at: "2026-09-20T22:40:00+07:00,LALIN,f5a6681"
last_update: "2026-09-27T10:30:00+07:00,Codex"
status: "beta"
superseded_by: null
attributes:
  domain: "product"
  doc_type: "documentation-register"
  scope: "Lalin Play current status and complete document entrypoint"
---

# Lalin Play — จุดเริ่มต้นเอกสารและสถานะปัจจุบัน

## สถานะที่ยืนยันได้

Lalin Play เป็น local audio/video player แยกจาก Studio/Cast มีสอง surface
Full และ Compact ใช้ playback owner เดียวกัน ปัจจุบัน source อยู่ที่
`apps/play-desktop` ใน `Freshair129/Lalin-AI` branch `codex/lalin-play-split`.
เป็น standalone runtime candidate ไม่ใช่การแยก repository ที่เสร็จแล้ว

| รายการ | สถานะ ณ 2026-09-20 |
|---|---|
| Source commit | `f5a66819ad58b481635733dd29e1658d67e29e3d` (`f5a6681`) |
| Publication | commit และ push branch ข้างต้นแล้ว; remote SHA ตรงกันในรอบ push |
| App identity | `lalin-play.exe`, `ai.lalin.play`, app version `0.1.0` |
| Runtime | Rust/Tauri v2 shell + React + HTML media/Web Audio; ไม่ใช่ Rust decoder |
| Latest recorded checks | 48 frontend / 7 Rust tests และ frontend build ผ่านในรอบก่อน commit; native build/screenshot มีรายงานแยก |
| Split phases | S1 LOCAL PASS, S2 PARTIAL, S3–S7 NOT_RUN ตาม ADR-004 |
| Original Studio player | ยังอยู่ ห้ามใช้เอกสารนี้เป็นคำสั่งลบ |
| New repo / installer / updater / release | ยังไม่มี execution evidence; ห้ามตีความ branch push เป็น independent release |

รายงาน validation เดิมเป็น snapshot ของแต่ละรอบ ข้อความ `uncommitted` หรือ
`No push` หมายถึงเวลาที่เก็บหลักฐานนั้น ไม่ใช่สถานะ publication ปัจจุบัน
ห้ามแก้ hash/จำนวน tests ย้อนหลังให้ดูเหมือนทดสอบบน binary ใหม่
รายงานเอกสารรอบ 2026-09-20 ไม่ได้รัน runtime tests หรือเปลี่ยน app version; ดู checks รอบ 2026-09-26 ด้านล่าง

## แผนที่เอกสาร

| ต้องการทราบ | เอกสารเจ้าของข้อมูล | สถานะ |
|---|---|---|
| Product scope / acceptance | [PRD §4.9](PRD.md#49-lalin-play--standalone-local-media-player-approved), [SRS](SRS.md) | Approved requirements; acceptance ยังไม่ครบ |
| Architecture / split gates | [ADR-004](../architecture/ADR-004-LALIN-PLAY-REPOSITORY-SPLIT.md) | Approved direction; implementation partial |
| Video / Compact / fullscreen | [CR-003](CR-003--LALIN_PLAY_LOCAL_VIDEO.md), [CR-004](CR-004--LALIN_PLAY_MINIMAL_COMPACT_PREVIEW.md), [Sitemap](../design/LALIN_SITEMAP_SOT.md) | Approved, implemented locally |
| Requirements → code → tests | [Play traceability](../validation/LALIN_PLAY_TRACEABILITY.md) | Current evidence map; not a blanket PASS |
| Current API/storage and Studio integration | [Integration/migration contract](../architecture/LALIN_PLAY_INTEGRATION_MIGRATION_SPEC.md) | Approved S2 migration and S3 handoff implemented locally; live parity and recovery gates remain open |
| S2 implementation evidence | [Migration evidence](../validation/LALIN_PLAY_S2_MIGRATION.md) | Integrated Play Rust 31/31; earlier S2-only Rust 23/23 and focused UI/build checks are recorded in the linked report; process-crash recovery and actual Studio transfer remain NOT_RUN |
| S3 handoff evidence | [Traceability](../validation/LALIN_PLAY_TRACEABILITY.md), [foundation](../validation/LALIN_PLAY_STANDALONE_FOUNDATION.md), [execution DAG](../architecture/LALIN_PLAY_EXECUTION_DAG.md) and [concurrent-client RCA](../../.brain/rca/2026-09-27-lalin-play-handoff-concurrent-client-launch.md) | Isolated Windows paired cold/warm delivery, lost-ACK QUERY/STATE reconciliation against a live owner, sequential and four-client concurrent queue order by ACK revision, no cold launch while the pipe is busy, duplicate handling, owner restart and live URL/UNC-shaped invalid-path rejection with unchanged STATE pass; cross-session/unauthorized and remote pipe-client rejection, mapped/reparse runtime cases and Studio/API exit during active playback and audible parity remain NOT_VERIFIED; process-interrupted lost ACK with no blind replay is now covered by the paired test |
| Extraction inventory / recovery / license gate | [Separation handoff](../architecture/LALIN_PLAY_SEPARATION_HANDOFF.md) | Repository export and source removal are not performed; standalone integration remains local |
| Installer / signed update / release | [Release runbook](../operations/LALIN_PLAY_RELEASE_RUNBOOK.md) | Candidate; signing and distribution gates open |
| User operation / troubleshooting | [User guide](../guides/LALIN_PLAY_USER_GUIDE.md) | Current candidate behavior |
| Developer setup / provenance | [Play README](../../apps/play-desktop/README.md) | Current candidate behavior |
| Historical runtime evidence | [Foundation](../validation/LALIN_PLAY_STANDALONE_FOUNDATION.md), [Video](../validation/LALIN_PLAY_LOCAL_VIDEO.md), [Compact](../validation/LALIN_PLAY_MINIMAL_COMPACT.md), [Fullscreen/skip](../validation/LALIN_PLAY_FULLSCREEN_SKIP.md) | Local evidence with explicit limitations |

## วิธีอ่านสถานะและลำดับงานต่อ

- **LOCAL PASS** = ผ่านเฉพาะ environment/fixture ที่รายงาน ไม่เท่ากับ clean-machine release.
- **PARTIAL** = มี implementation/evidence บางส่วน แต่ acceptance รวมยังเปิด.
- **NOT_IMPLEMENTED / NOT_RUN** = ยังไม่มีโค้ด / ยังไม่มีผลตรวจ ห้ามแทนด้วย PASS.
- **candidate** = รายละเอียดหรือ release gates ที่ยังรออนุมัติตาม R5; approved S2/S3 code remains subject to runtime acceptance.
- **BLOCKED** ใน checklist = ต้องเติม decision/evidence ก่อนผ่าน gate ไม่ใช่รายงานว่า agent ทำงานต่อไม่ได้.

ลำดับ: verify remaining S2 crash/recovery and write-failure cases plus S3 remote/security, Studio/API exit during playback, audible parity and relink acceptance →
license/provenance + S4 export → S5 clean-checkout/regression → S6 scoped removal →
S7 installer/update. แยก authorization สำหรับ remote creation, deletion,
merge และ publication จากการอนุมัติเอกสารเสมอ

เอกสารครบในแง่ coverage ของหัวข้อที่ตรวจพบ ไม่ได้ปิดงาน implementation หรือ
แทนที่การตัดสินใจเรื่อง license, release signing และการทดสอบที่ยังขาด

## Historical S2 implementation update — 2026-09-25

The original report described the uncommitted worktree `runtime/worktrees/lalin-play-s2`,
branch `codex/lalin-play-split`, based on `411d2ed`. That report was a historical snapshot; the recovered implementation now sits on the separately reviewed local branch `codex/lalin-play-s2-execution`.
3 Studio export tests, 20 standalone Play migration tests, 19 native Rust tests,
and both frontend builds. Synthetic native tests cover all journal phases and
selected write failures. No WebView profile files or actual user migration were
used. Process-termination recovery and remaining write-failure cases are open;
see the [evidence report](../validation/LALIN_PLAY_S2_MIGRATION.md).

## Current S2/S3 implementation — 2026-09-26 snapshot

The recovered S2 branch is based on clean baseline `43121cc`. Local commits are
`58f6b67` (migration), `1d30d44` (explicit undo), and `7c30ea1` (mapped-network
rejection). The S3 branch contributes native handoff commit `235875b`; its
documentation marker correction is `362bbd0`. Both are integrated only on the
isolated local branch `codex/lalin-play-integration`; nothing was pushed or merged
to `main`.

S2 checks: `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` passed;
`cargo test --manifest-path src-tauri/Cargo.toml --offline` passed 23/23 after
the mapped-drive change. Earlier focused S2 checks recorded 3/3 Studio export
tests, 22/22 Play migration tests and both frontend builds; the frontend checks
were not rerun after the native-only mapped-drive fix.

S3 checks after the mapped-drive change: Studio native handoff tests 6/6, Play
native library tests 15/15, API file tests 10/10, Studio sender tests 3/3, Play
contract test 1/1, and Studio/Play frontend builds passed. Cold/warm launch
decision tests are local unit evidence. A real paired process, unauthorized or
cross-session connection attempt, interrupted ACK-loss recovery, actual mapped
SMB import, Studio/API exit during playback and audible parity remain
**NOT_RUN/NOT_VERIFIED**. Studio's ordinary playback actions still use the Studio
owner; only explicit standalone actions use the handoff. Keep that route until
parity is proven. See the [execution DAG](../architecture/LALIN_PLAY_EXECUTION_DAG.md).

Integrated verification on `codex/lalin-play-integration`: Studio frontend 6/6,
Play frontend 23/23, Play Rust 31/31, Studio native handoff 6/6, API file tests
10/10; Studio and Play frontend builds and Rust formatting checks passed. The
Rust cold/warm checks cover launch decisions only. Actual paired delivery,
unauthorized connection attempts, interrupted ACK recovery, Studio/API exit during
playback and audible parity remain NOT_RUN/NOT_VERIFIED.

## Paired native handoff update — 2026-09-27

On an isolated Windows session, the Studio native library tests passed **6/6**
with the paired-process test skipped by default; Play Rust tests passed **31/31**
and both Rust formatting checks passed. The ignored paired test
`playback_handoff::tests::paired_windows_cold_and_warm_handoff_ack_state_and_duplicate`
then passed **1/1** using the freshly built Play app and a local silent WAV file.
It verified one cold launch, warm Play Next and Add to Queue without another
launch, ACK/STATE owner and revision agreement, reconciliation after the client
read ACK and disconnected before STATE, and duplicate replay without changing
the reconciled queue or revision. Play's Windows named-pipe regression test also
passed with the Play suite.

This is paired delivery evidence, not full Studio/Play playback parity. Remote or
cross-session rejection, concurrent FIFO bursts, owner restart, Studio/API exit
during active playback, mapped-drive/reparse runtime behavior and audible parity
remain unverified. Ordinary Studio playback is still enabled. At that earlier
snapshot, branch/PR/merge status was not verified against the remote; see the
current follow-up below for the current main/origin/main baseline.
The runtime RCA records are [authorization order](../../.brain/rca/2026-09-26-lalin-play-handoff-impersonation-order.md),
[canonical path validation](../../.brain/rca/2026-09-26-lalin-play-handoff-canonical-prefix.md),
and [ACK/STATE delivery](../../.brain/rca/2026-09-27-lalin-play-handoff-unread-replies.md).

## G3 registration readiness follow-up — 2026-09-27

The S2/S3 implementation PRs are merged. The current `main` and
`origin/main` baseline for this follow-up is
`daa2867be389851a91bbd18fb86e896836e69975`.

Follow-up coverage was added for sender-side FIFO under deferred ACKs, a native
four-command FIFO sequence, owner restart with no blind replay, and disposable
Tauri app-data isolation. Play native tests passed **31/31** with and without
the `g3-test-app-data-dir` feature; the test-feature release build passed.
Sender FIFO tests passed **3/3**; Studio native tests passed **6/6** with the
paired test ignored by default; the expanded Rust test compiled and formatting
checks passed.

The expanded ignored paired test still does not pass with both WebView2 profile
and Play app-data isolated: it timed out after **31.26 seconds** before HELLO/STATE
while the Play process remained alive. The FIFO/restart assertions were not
reached. Source review found that earlier attempts isolated only WebView2; a
fail-closed test-only app-data path is now implemented. That safety fix did not
resolve the readiness timeout. The exact failing step between React mount,
Tauri event/API bridge, command authorization and native pipe creation remains
unconfirmed. See the
[registration readiness RCA](../../.brain/rca/2026-09-27-lalin-play-handoff-registration-readiness.md).

G3 remains **PARTIAL**. The implementation follow-up is in draft PR #25 and
unmerged.
Ordinary Studio playback remains enabled; no Play parity, source removal, or
release acceptance is claimed.

## G3 embedded-asset and paired lifecycle follow-up — 2026-09-27

The pre-HELLO startup failure was reproduced with a test executable that did not
load the packaged Play frontend: its startup trace ended before page load,
migration recovery and receiver registration. A diagnostic build using an
absolute temporary `frontendDist` loaded a `file:///...` URL with `root=false`.
Building the isolated test executable through Tauri CLI with a relative embedded
frontend path loaded `http://tauri.localhost/`, reported `root=true`, completed
migration recovery, created the named pipe and reached `handoff_receiver_ready`.
The exact artifact used by every earlier failed attempt is unavailable, so this
does not retroactively identify all historical runs; details are in the
[registration readiness RCA](../../.brain/rca/2026-09-27-lalin-play-handoff-registration-readiness.md).

The ignored paired Windows test
`playback_handoff::tests::paired_windows_cold_and_warm_handoff_ack_state_and_duplicate`
passed **1/1** with separate fresh WebView2 and test-only Play app-data paths
under system temp. It verified cold Play launch; warm Play Next and Add to Queue
without relaunch; matching ACK/STATE owner and revisions; ACK-disconnect recovery
via QUERY_RESULT; duplicate suppression; four unique media paths appearing in
ACK order; and owner restart with a new session that refuses blind replay of an
uncertain prior-session command. It used a silent WAV fixture and sent the four
FIFO test commands sequentially; concurrent independent Studio clients are not
covered.

The initial FIFO assertion reused one WAV, so path-derived queue titles were
identical and did not expose order. The corrected test creates unique WAV copies
beside its raw-path temp fixture, asserts their canonical parent is system temp,
and removes them after the child exits. Studio's canonical local-file validation
was not relaxed.

At that earlier paired run, G3 remained **PARTIAL**, not playback parity.
Cross-session/unauthorized and remote-client rejection, invalid-path and
mapped-drive/reparse runtime cases, ACK loss across process interruption,
Studio/API exit during active playback and audible parity were still open.
PR #25 is open and draft. Keep ordinary Studio playback enabled; do not merge or
remove its playback owner until full parity is proven.

## G3 receiver invalid-path follow-up — 2026-09-27

After the owner restart, the paired test sends
`https://example.invalid/audio.wav` as a raw `COMMAND` over the live same-logon
Play pipe. Play returned
`ERROR/invalid_file_path`; a fresh STATE query confirmed owner, revision and the
complete playback snapshot were unchanged. This URL-shaped path is rejected
before filesystem/network lookup. The isolated paired Windows test passed **1/1**
with the new case; Studio native tests passed **6/6** with the paired test
ignored, and Play native tests with `g3-test-app-data-dir` passed **31/31**.
Rust formatting checks and `git diff --check` passed. The Play executable was
built through Tauri CLI with a relative embedded frontend and the fail-closed
`g3-test-app-data-dir` feature.

Cross-session/unauthorized and remote-client rejection, concurrent independent
client ordering, mapped-drive/reparse runtime behavior, ACK loss across process
interruption, Studio/API exit during active playback and audible parity remain
open. The [receiver path-rejection RCA](../../.brain/rca/2026-09-27-lalin-play-handoff-invalid-path-runtime-coverage.md)
records the prior coverage gap. Normal Studio playback remains enabled.

## G3 concurrent-client FIFO follow-up — 2026-09-27

Studio no longer treats `ERROR_PIPE_BUSY` as a cold owner. It waits for the
existing single-instance Play pipe and refuses cold launch after observing an
owner. Play now reuses the disconnected server pipe instance between clients,
removing the warm-owner endpoint recreation gap. The implementation and
regression evidence are recorded in the
[execution DAG](../architecture/LALIN_PLAY_EXECUTION_DAG.md),
[foundation report](../validation/LALIN_PLAY_STANDALONE_FOUNDATION.md),
[traceability matrix](../validation/LALIN_PLAY_TRACEABILITY.md) and
[concurrent-client RCA](../../.brain/rca/2026-09-27-lalin-play-handoff-concurrent-client-launch.md).

The isolated Windows paired test passed **1/1** with cold and warm lifecycle,
ACK/STATE reconciliation, duplicate suppression, sequential FIFO, four
independent clients released together, owner restart without blind replay and
receiver rejection of URL- and UNC-shaped invalid paths without state change.
The paired run also dropped a command connection before ACK receipt, recovered
the applied result from QUERY/STATE and verified a same-ID retry did not enqueue
a duplicate. The
concurrent queue order matched unique strictly increasing ACK revisions, and
no client invoked the cold-launch callback while the pipe was held. Studio
native handoff tests passed **6/6**; Play native tests passed **31/31** with the
test app-data feature; Tauri CLI test-feature release build and format checks
passed. All paired media/profile/app-data remained in disposable system-temp
paths.

G3 remains **PARTIAL**. Cross-session/unauthorized and remote pipe-client
rejection, mapped-drive/reparse runtime paths (including a reparse target
resolving to UNC), Studio/API exit during active playback and audible parity
remain unverified. The paired test now covers a command applied before its ACK
is read, followed by owner restart, delivery_unknown and blocked replay.
S2 process-crash/power-loss recovery and remaining storage-write cases are
also open. PR #25 remains draft pending those gates. Keep ordinary Studio
playback enabled; no playback parity, source removal or release is claimed.

## G3 lost ACK across Play owner restart — 2026-09-27

The Windows paired test closed the command sender before reading ACK and
confirmed the original Play owner had appended one queue entry relative to its
pre-command STATE. It then restarted Play. Studio returned delivery_unknown for
the prior-session request, kept it uncertain and blocked same-ID replay; the new
owner's queue remained unchanged. See the [restart-test RCA](../../.brain/rca/2026-09-27-lalin-play-handoff-restart-test-title-assumption.md).
This closes only the tested handoff control-plane boundary across process
interruption. It does not prove durable ACK history or audible output.

The paired test passed 1/1. Studio native handoff tests passed 6/6, Play native
tests passed 31/31 with g3-test-app-data-dir, both Rust formatting checks passed,
and git diff --check passed. The run used a silent local WAV and fresh disposable
WebView2/app-data directories under system temp.

## Current documentation version diff — 2026-09-27 G3 concurrent-client ordering

| Document | Before → after |
|---|---|
| Integration/migration spec | 0.2.5b → 0.2.6b |
| Execution DAG | 0.2.6b → 0.2.7b |
| Documentation register | 0.2.7b → 0.2.8b |
| Foundation evidence | 0.2.4b → 0.2.5b |
| Traceability matrix | 0.2.4b → 0.2.5b |
| Concurrent-client RCA | New 0.1.2b |
| Studio and Play application versions | No change |

## Current documentation version diff — 2026-09-27 final G3 binary revalidation

| Document | Before → after |
|---|---|
| Execution DAG | 0.2.7b → 0.2.8b |
| Documentation register | 0.2.8b → 0.2.9b |
| Foundation evidence | 0.2.5b → 0.2.6b |
| Traceability matrix | 0.2.5b → 0.2.6b |
| Concurrent-client RCA | 0.1.2b → 0.1.3b |
| Integration/migration spec and Studio/Play application versions | No change |

## Current documentation version diff — 2026-09-27 G3 UNC receiver test

| Document | Before → after |
|---|---|
| Integration/migration spec | 0.2.6b → 0.2.7b |
| Execution DAG | 0.2.8b → 0.2.9b |
| Documentation register | 0.2.9b → 0.2.10b |
| Foundation evidence | 0.2.6b → 0.2.7b |
| Traceability matrix | 0.2.6b → 0.2.7b |
| Studio and Play application versions | No change |

## Current documentation version diff — 2026-09-27 G3 lost-ACK reconciliation

| Document | Before → after |
|---|---|
| Integration/migration spec | 0.2.7b → 0.2.8b |
| Execution DAG | 0.2.9b → 0.2.10b |
| Documentation register | 0.2.10b → 0.2.11b |
| Foundation evidence | 0.2.7b → 0.2.8b |
| Traceability matrix | 0.2.7b → 0.2.8b |
| Studio and Play application versions | No change |

## Current documentation version diff — 2026-09-27 G3 ACK loss across owner restart

| Document | Before → after |
|---|---|
| Integration/migration spec | 0.2.8b → 0.2.9b |
| Execution DAG | 0.2.10b → 0.2.11b |
| Documentation register | 0.2.11b → 0.2.12b |
| Foundation evidence | 0.2.8b → 0.2.9b |
| Traceability matrix | 0.2.8b → 0.2.9b |
| Restart-test RCA | New 0.1.0b |
| Studio and Play application versions | No change |

## Current documentation version diff — 2026-09-27 G3 paired lifecycle

| Document | Before → after |
|---|---|
| Execution DAG | 0.2.4b → 0.2.5b |
| Documentation register | 0.2.5b → 0.2.6b |
| Handoff registration readiness RCA | 0.1.2b → 0.1.3b |
| Foundation evidence | 0.2.2b → 0.2.3b |
| Traceability matrix | 0.2.2b → 0.2.3b |
| Studio and Play application versions | No change |

## Current documentation version diff — 2026-09-27 G3 receiver path rejection

| Document | Before → after |
|---|---|
| Execution DAG | 0.2.5b → 0.2.6b |
| Documentation register | 0.2.6b → 0.2.7b |
| Receiver invalid-path runtime RCA | New 0.1.0b |
| Handoff registration readiness RCA | 0.1.3b → 0.1.4b |
| Foundation evidence | 0.2.3b → 0.2.4b |
| Traceability matrix | 0.2.3b → 0.2.4b |
| Studio and Play application versions | No change |

## Previous documentation version diff — 2026-09-27

| Document | Before → after |
|---|---|
| Execution DAG | 0.2.0b → 0.2.1b |
| Documentation register | 0.2.2b → 0.2.3b |
| Handoff impersonation-order RCA | 0.1.0b → 0.1.1b |
| Handoff canonical-path RCA | 0.1.0b → 0.1.1b |
| Handoff unread-reply RCA | New 0.1.0b |
| Studio and Play application versions | No change |

## Current documentation version diff — 2026-09-27 G3 follow-up

| Document | Before → after |
|---|---|
| Execution DAG | 0.2.1b → 0.2.2b |
| Documentation register | 0.2.3b → 0.2.4b |
| Handoff registration readiness RCA | New 0.1.0b |
| Studio and Play application versions | No change |

## Current documentation version diff — 2026-09-27 G3 isolation follow-up

| Document | Before → after |
|---|---|
| Execution DAG | 0.2.2b → 0.2.4b |
| Documentation register | 0.2.4b → 0.2.5b |
| Handoff registration readiness RCA | 0.1.0b → 0.1.2b |
| Studio and Play application versions | No change |
## Current documentation version diff — 2026-09-26

| Document | Before → after |
|---|---|
| Integration/migration spec | 0.2.4b → 0.2.5b |
| Documentation register | 0.2.1b → 0.2.2b |
| Foundation report | 0.2.1b → 0.2.2b |
| Traceability matrix | 0.2.1b → 0.2.2b |
| Play README | 0.4.1b → 0.4.2b |
| ADR-004 | 0.4.1b → 0.4.2b |
| Repository Architecture SOT | 0.4.2b → 0.4.3b |
| Play user guide | 0.1.0b → 0.1.1b |
| Docs index | 0.10.10b → 0.10.11b |
| Execution DAG | 0.1.0b → 0.2.0b |
| S2 migration evidence | New 0.1.0b |
| S2 mapped-drive and S3 canonical-path RCAs | New 0.1.0b each |
| Studio and Play application versions | No change |

## Prior documentation round — 2026-09-20

ตรวจแบบอ่าน source/เอกสารและแก้เฉพาะ documentation ไม่มี runtime implementation,
commit หรือ push ในรอบจัดเอกสารนี้ ไม่รัน generated doc-graph writer เพราะมีงาน
คู่ขนาน; ไม่อ้าง generated coverage เป็น standalone acceptance

| Check | Result |
|---|---|
| Changed/new Markdown set | 14 files; 6 new documents and 8 updated Markdown documents |
| Internal relative file links in that set | 100 references, no missing file targets; external URLs/heading anchors not revalidated |
| Canonical acceptance coverage | 33 exact unique IDs: PLAY-01..10, PLAY-V01..10, PLAY-C01..13 |
| Code/test path references in matrix | 28 path references exist in standalone source tree |
| YAML metadata | All 14 Markdown frontmatter blocks contain required metadata fields |
| BLUEPRINT | YAML parses; original Studio owner retained alongside standalone entry |
| Diff hygiene | `git diff --check` passed; CRLF normalization notices only |
| Parallel work | Existing voice-worker mapping preserved; concurrent TTS license clarification retained; no runtime/code changes by this task |

`f5a6681` remains the pinned Play implementation snapshot even if later unrelated
commits advance branch HEAD. This round's document edits remain local until a
separate commit/push request. Historical runtime reports retain their own hashes.

## Prior documentation version diff

| Document | Before → after |
|---|---|
| AGENTS | 0.2.1b → 0.2.2b |
| Play README | 0.4.0b → 0.4.1b |
| PRD | 1.4.1b → 1.4.2b |
| SRS | 1.4.0b → 1.5.0b |
| ADR-004 | 0.4.0b → 0.4.1b |
| Repository SOT | 0.4.1b → 0.4.2b |
| Docs index | 0.8.0b → 0.9.0b |
| Appendix D | 1.3.1b → 1.4.0b |
| BLUEPRINT standalone_play entry | New doc_version 0.1.0b; no change to Studio app version |
| Register, traceability, user guide | New 0.1.0b beta documents |
| Integration/migration, handoff, release runbook | New 0.1.0b candidate documents; review required before implementation |

## Historical S2 documentation version diff — 2026-09-25

| Document | Before → after |
|---|---|
| Integration/migration contract | 0.2.3b → 0.2.4b |
| Play traceability | 0.2.0b → 0.2.1b |
| Standalone foundation report | 0.2.0b → 0.2.1b |
| Documentation register | 0.2.0b → 0.2.1b |
| S2 migration evidence | 0.1.0b → 0.1.1b |

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---|---|---|---|---|---|
| 0.2.12b | 2026-09-27 | beta | Record paired lost-ACK owner-restart/no-replay evidence and remaining parity gates | based on 17a5c96 | Codex |
| 0.2.11b | 2026-09-27 | beta | Record paired lost-ACK QUERY/STATE recovery while the owner is live; retain interruption and parity gates | based on cee5e93 | Codex |
| 0.2.10b | 2026-09-27 | beta | Record live URL/UNC-shaped receiver rejection with unchanged STATE; keep remote and parity gates open | based on cee5e93 | Codex |
| 0.2.9b | 2026-09-27 | beta | Record paired G3 rerun against rebuilt final pipe-recovery source while keeping remaining acceptance gates open | based on 1084d5e | Codex |
| 0.2.8b | 2026-09-27 | beta | Record the busy-pipe/cold-launch fix and concurrent paired FIFO evidence while retaining remaining parity gates | based on 1084d5e | Codex |
| 0.2.7b | 2026-09-27 | beta | Record native receiver invalid-path rejection and unchanged STATE while retaining parity gates | based on b90ffaed | Codex |
| 0.2.6b | 2026-09-27 | beta | Record embedded-asset startup diagnosis and passing isolated paired lifecycle while keeping the parity gate open | based on 9e0cb06 | Codex |
| 0.2.5b | 2026-09-27 | beta | Add test-only app-data isolation evidence and keep the isolated paired handoff gate open | based on 5351a18 | Codex |
| 0.2.4b | 2026-09-27 | beta | Record G3 owner-registration readiness failure and keep Studio playback enabled | based on daa2867 | Codex |
| 0.2.3b | 2026-09-27 | beta | Record isolated native cold/warm delivery and ACK/STATE reconciliation while preserving open parity gates | based on ed20af8 | Codex |
| 0.2.2b | 2026-09-26 | beta | Reconcile recovered S2 migration and S3 handoff implementation status with exact local checks and open parity gates | S2 7c30ea1; S3 235875b | Codex |
| 0.2.1b | 2026-09-25 | beta | Update S2 focused test totals and record synthetic recovery/failure evidence limits | based on 411d2ed | LALIN |
| 0.2.0b | 2026-09-25 | beta | Register approved S2 migration implementation, verification and remaining runtime gates | based on 411d2ed | LALIN |
| 0.1.0b | 2026-09-20 | beta | Consolidate document ownership, pushed source status and open gates | based on f5a6681 | LALIN |
