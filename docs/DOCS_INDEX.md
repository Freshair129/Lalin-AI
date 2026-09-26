---
version: "0.10.11b"
created_at: "2026-07-22T00:00:00+07:00,Codex,uncommitted"
last_update: "2026-09-26T05:25:06+07:00,Codex"
status: "beta"
superseded_by: null
attributes:
  domain: "documentation"
  doc_type: "index"
  scope: "Canonical documentation map"
---

# Documentation Index

## Canonical Root Docs

- `PRODUCT.md`: product identity, users, product promise, current compatibility truth.
- `DESIGN.md`: desktop design system, shell invariants, navigation, visual rules.
- `README.md`: entrypoint for setup and contributor orientation.
- `AGENTS.md`: agent operating rules for this repository.

## Canonical Architecture Docs

- `docs/architecture/REPOSITORY_ARCHITECTURE_SOT.md`: target repo architecture and ownership.
- `docs/architecture/ADR-001-LALIN-UMBRELLA-PLATFORM.md`: candidate umbrella platform decision and Tauri/Electron/YouTube boundaries.
- `docs/architecture/ADR-002-LALIN-MEDIA-TAURI-PORT.md`: approved local Rust + Tauri v2 port boundary and VacuumTube feature matrix.
- `docs/architecture/ADR-003-LALIN-CAST-REPOSITORY-SPLIT.md`: accepted Lalin Cast repository boundary and product identity decision.
- `docs/architecture/ADR-004-LALIN-PLAY-REPOSITORY-SPLIT.md`: approved standalone local Play specification; additive native foundation exists, Studio handoff and migration/export/release gates remain open.
- `docs/validation/LALIN_PLAY_STANDALONE_FOUNDATION.md`: local tests, native Full/Compact screenshots, user-confirmed audible output and explicit unverified gates.
- `docs/architecture/ADR-005-HEADLESS-VOICE-WORKER-PROFILE.md`: candidate fail-closed voice-worker entrypoint, control/engine process split, speech-core seams and profile-scoped exceptions to Studio jobs/WS/auth rules (CR-005).
- `docs/architecture/JAITTS_EASY_COMPARISON.md`: source-only comparison of JaiTTS-Easy with Studio `tts.py` and the voice worker; verified F5-TTS license facts, Thai chunking gap and eval protocol proposal.
- `docs/architecture/MEETING_TRANSCRIPT_PIPELINE.md`: draft 6-stage offline meeting-transcript pipeline (whisper + pyannote + Meet ring gate + local narrative agent); eval helper outside the voice-worker scope, D14/D15 raised.
- `docs/architecture/YT_CHANNEL_TRANSCRIPT_PIPELINE.md`: draft YouTube-channel → verified Thai transcript + reverse-engineered content playbook; decisions D-YT-1..8 (Thai-finetuned faster-whisper, raw fetch before survey, anchored diff-only LLM correction, two-tier audit with `no_external_evidence`), evidence and open gates; pilot not run.
- `docs/architecture/LALIN_MEDIA_PLATFORM_PLAN.md`: candidate Lalin Media vertical slice, ownership matrix, VacuumTube provenance and verification gates.
- `docs/architecture/LALIN_MEDIA_MIGRATION_MAP.md`: candidate current-to-target migration, rollback and retention map.
- `docs/architecture/LALIN_CAST_REPOSITORY_SPLIT_PLAN.md`: executed export inventory, history policy and staged release gates.
- `docs/architecture/LALIN_CAST_UPDATER_SPEC.md`: candidate signed Windows updater and GitHub Actions release contract.
- `docs/architecture/LALIN_CAST_SEPARATION_HANDOFF.md`: final ownership boundary, Studio integration contract and root cleanup record.
- `docs/architecture/REPO_MIGRATION_PLAN.md`: phased migration plan and execution status.
- `docs/architecture/DOCS_PHASE1_MOVE_MAP.md`: exact documentation consolidation move map and rollback guide.
- `docs/architecture/DOCS_PHASE2_MOVE_MAP.md`: exact tooling consolidation move map and rollback guide.
- `docs/architecture/PHASE3_RUNTIME_STATE_PLAN.md`: runtime state audit, blocker, target contract, and approval-gated move plan.
- `docs/architecture/PHASE3_RUNTIME_MOVE_MAP.md`: exact runtime data move map and rollback guide.
- `docs/architecture/PHASE4_APP_FOLDER_MIGRATION_PLAN.md`: app folder migration audit, move policy, blockers, and validation gates.
- `docs/architecture/PHASE4_APP_MOVE_MAP.md`: exact app source move map and rollback guide.
- `docs/architecture/PHASE5_CONTRACTS_MCP_PLAN.md`: executed shared contracts and MCP integration plan.
- `docs/architecture/PHASE6_WORKSPACE_ORCHESTRATION_PLAN.md`: executed root workspace orchestration plan.
- `docs/architecture/PHASE7_RELEASE_WORKFLOW_PLAN.md`: executed GitHub Actions release workflow repair plan.
- `docs/architecture/PHASE8_REPO_RENAME_PRESENTATION_READINESS.md`: executed GitHub repository rename and presentation readiness note.
- `docs/architecture/PHASE9_SIGNED_DRAFT_RELEASE_PLAN.md`: approved signed draft release plan for merge commit `d553067` and version `0.1.1`.
- `docs/architecture/SPEC.md`: technical system specification.
- `docs/architecture/BLUEPRINT.yaml`: machine-readable legacy blueprint.
- `docs/architecture/API_SEMANTICS.md`: พฤติกรรมของ REST/WS ที่อ่านจาก OpenAPI schema ไม่ได้ (state, ลำดับ, error ที่ไม่ตรงสัญชาตญาณ).
- `docs/architecture/LALIN_PLAY_COMMAND_DELIVERY_PLAN.md`: approved/locally implemented Play Window readiness, single consumer owner, and scoped native capabilities.
- `docs/architecture/LALIN_PLAY_TV_MODE_PLAN.md`: approved TV Mode architecture, fullscreen/input adapters and native permission boundary.
- `docs/design/LALIN_RENAME_MIGRATION_PLAN.md`: product rename and compatibility plan.

## Current Lalin UI Docs

These now live in `docs/design/` after Phase 1 of the repo migration:

- `docs/design/LALIN_UI_SOT.md`
- `docs/design/DESIGN_SYSTEM.md`
- `docs/design/LALIN_LAYOUT_SOT.md`
- `docs/design/LALIN_SITEMAP_SOT.md`
- `docs/design/LALIN_SHELL_SOT.md`
- `docs/design/LALIN_ARRANGE_TAB_SPEC.md`
- `docs/design/LALIN_WORKSPACE_TAB_SPEC.md`
- `docs/design/LALIN_VOICE_STUDIO_TAB_SPEC.md`
- `docs/design/LALIN_DUBBING_TAB_SPEC.md`
- `docs/design/LALIN_MASTERING_TAB_SPEC.md`
- `docs/design/LALIN_LIBRARY_TAB_SPEC.md`
- `docs/design/LALIN_JOBS_TAB_SPEC.md`
- `docs/design/LALIN_SETTINGS_TAB_SPEC.md`
- `docs/design/LALIN_UI_IMPLEMENTATION_PLAN.md`
- `docs/design/COMPONENT_REGISTRY.md`
- `docs/design/LALIN_PLAY_TV_MODE_SPEC.md`: approved 10-foot layout, focus order, input mapping and accessibility hooks.

## Product and Runtime Docs

- `docs/product/LALIN_PLAY_DOCUMENTATION.md`: Play documentation entrypoint, source publication status and document ownership; approval/evidence/export remain distinct.
- `docs/validation/LALIN_PLAY_TRACEABILITY.md`: all 33 PLAY product/video/Compact criteria mapped to source, tests, dated native evidence and open gates.
- `docs/architecture/LALIN_PLAY_INTEGRATION_MIGRATION_SPEC.md`: current native/storage contracts and approved S3 named-pipe protocol (implemented locally; paired-runtime acceptance open), plus candidate opt-in migration/rollback.
- `docs/architecture/LALIN_PLAY_SEPARATION_HANDOFF.md`: candidate export inventory, retained consumers, license/notices audit and recovery record; not an executed split.
- `docs/operations/LALIN_PLAY_RELEASE_RUNBOOK.md`: candidate NSIS/signing/updater/draft-publication and rollback qualification; all distribution gates remain open.
- `docs/guides/LALIN_PLAY_USER_GUIDE.md`: current candidate controls, local files/state and non-destructive troubleshooting.
- `docs/product/PRD.md`: Studio baseline plus approved Play standalone requirements (§4.9); distinguish document version from application versions and partial implementation evidence.
- `docs/product/CR-003--LALIN_PLAY_LOCAL_VIDEO.md`: approved local MP4/WebM display in Full/Compact with one persistent media element and shared EQ; implemented locally.
- `docs/product/CR-004--LALIN_PLAY_MINIMAL_COMPACT_PREVIEW.md`: approved minimal Compact overlay, Full-only queue/EQ controls and isolated local frame previews; Addendum A native fullscreen/±10 approved and implemented locally.
- `docs/validation/LALIN_PLAY_FULLSCREEN_SKIP.md`: 48 frontend/7 Rust tests, native fullscreen/restore/relative-seek captures and explicit device limitations; current Addendum A build evidence.
- `docs/validation/LALIN_PLAY_MINIMAL_COMPACT.md`: 40 frontend/6 Rust tests, native MP4/WebM preview, minimum viewport screenshots and explicit remaining DPI/touch/performance limits.
- `docs/validation/LALIN_PLAY_LOCAL_VIDEO.md`: native MP4/WebM/silent-video screenshots, pause/seek/layout continuity, Compact sizing RCA, automated checks and explicit audio/device limitations.
- `docs/product/CR-001--LALIN_PLAY_WINDOWS_MEDIA_EQ.md`: existing audio-first playback/EQ requirements; standalone Full/Compact delta is in PRD/ADR-004.
- `docs/product/CR-005--HEADLESS_VOICE_WORKER.md`: candidate headless ASR/preset-TTS worker for PRP with FR-19/NFR-08 text; Slice A stub implemented locally, speech/GPU/quality and rights (R-010) still open.
- `docs/product/REQ-PRP-LALIN-WORKER-ADAPTER.md`: handoff back to PRP — five decisions (PRP-DEC-01..05) that must close before the M4 RuntimeInvoker adapter can be written, each with Lalin's recommendation; plus the contract facts a coordinator must honour (D15/D16/D18, no transport retry).
- `docs/product/SRS.md`
- `docs/product/ROADMAP_MUSIC.md`
- `docs/product/LOCAL_MODEL_LEDGER.md`
- `docs/product/COMPETITIVE_BRIEF.md`
- `docs/product/ROADMAP_EXECUTION_BACKLOG.md`
- `docs/product/CR-002--LALIN_PLAY_TV_MODE.md`: approved TV / Leanback presentation change request and FR-18 acceptance.
- `docs/architecture/SPEC.md`
- `docs/architecture/BLUEPRINT.yaml`
- `docs/operations/PACKAGING_SIDECAR.md`
- `docs/operations/WORKSTATION_DISTRIBUTION.md`
- `docs/operations/CPU_GPU_DISTRIBUTION_STRATEGY.md`
- `docs/operations/VOICE_WORKER_LINUX_RUNBOOK.md`: deploy/operate the headless voice worker beside the PRP coordinator on Linux — Unix socket on a shared volume (D17), 3 GiB cap, OOM lockout, non-determinism.
- `docs/operations/YT_CHANNEL_TRANSCRIPT_WORKFLOW.md`: design/runbook for the YouTube channel transcript pipeline — instance config, stage 1-4 schemas and acceptance criteria, model evidence, pilot design, file layout.
- `docs/operations/YT_CHANNEL_TRANSCRIPT_SOP.md`: SOP — objective, owner, procedure, outputs, checks and exit criteria per stage (0, 2R, 1, 2, pilot, 3, 4, delivery); script status ✅/🔧.

## Tooling Layout

- `tools/dev/`: canonical setup and local runtime utilities.
- `tools/build/`: canonical icon, sidecar, installer, and release build utilities.
- `tools/verify/`: canonical smoke and release verification utilities.
- `tools/doc_graph_scan.py`: doc-graph scanner — เทียบ endpoint/component ในโค้ดกับ `docs/architecture/BLUEPRINT.yaml` แล้วเขียน `docs/.doc-graph.json`.
- `scripts/`: compatibility shims that keep older commands working.

## Validation and Evidence Docs

- `docs/validation/SPRINT*_VALIDATION.md`
- `docs/validation/2026-09-18-LALIN-PLAY-TV-MODE.md`: TV Mode unit, browser and native evidence with hardware limits.
- `docs/validation/2026-09-17-LALIN-PLAY-COMMAND-DELIVERY.md`: regression, build and isolated browser/native debug fixture evidence; broad MVP/release gates remain separate.
- `docs/validation/2026-09-17-SIDECAR-BUILD.md`: local sidecar build, exact artifact hash, Python environment and independent runtime checks.
- `docs/validation/2026-09-20-HEADLESS-VOICE-WORKER-H0-REVIEW.md`: H0 source/contract review for the PRP voice worker handoff, fit-gap LVP-REQ-001..032, decisions D1–D13 and environment evidence.
- `docs/validation/2026-09-20-HEADLESS-VOICE-WORKER-SLICE-A.md`: Slice A stub-engine evidence — 171 backend tests, headless smoke, D12 schema export; speech/GPU/quality NOT_RUN.
- `docs/validation/2026-09-21-HEADLESS-VOICE-WORKER-SLICE-B-ASR.md`: Slice B ASR evidence — faster-whisper engine adapter, D8 manifests asr-th-en-01 (turbo) / -medium, speech venv, GPU smoke PASS ×2; Thai quality and RTX 3060 NOT_RUN, TTS BLOCKED (D9).
- `docs/validation/2026-09-21-VOICE-WORKER-D14-D15-PROPOSAL.md`: proposal for the PRP owner — D14 manifest-level VAD and D15 per-request glossary (draft contract diff), evidence-backed, no code change until approved.
- `docs/validation/2026-09-22-HEADLESS-VOICE-WORKER-SLICE-B-TTS.md`: Slice B TTS — F5-TTS-THAI engine in the worker (`tts-th-preset-01`), smoke PASS on GPU, dev-only sample voice, D19 (TTS device) measured: GPU RTF 0.19–0.44 vs CPU 7–14.
- `docs/validation/2026-09-22-HEADLESS-VOICE-WORKER-SLICE-C-LINUX.md`: Slice C step 1 — the worker in a Linux CPU-only container (D10/D11); 135 tests and the smoke pass inside it; bugs fixed (incl. the engine memory leak); D17/D18 raised; dev-box CPU sizing; D13 minimum 3 GiB; worker-only image 786 MB.
- `docs/validation/2026-09-23-VOICE-WORKER-MONITORING.md`: monitoring evidence — the three layers (/metrics, status gateway, Prometheus + Grafana), 7 alert rules, a 13-panel dashboard, and a drop-in kit for an existing dashboard; a real job verified end to end (RTF 0.317); Alertmanager still missing.
- `docs/validation/2026-09-24-PRP-WORKER-INTEGRATION-GAP.md`: why PRP cannot call the worker yet — its dispatcher and observer exit 3 by design and the RuntimeInvoker adapter is M4 work gated behind WP24/WP03; the adapter is the seam, so our routes stay; five decisions listed that only PRP can make.
- `.brain/rca/*.md`
- `.brain/rca/2026-09-17-lalin-play-command-delivery.md`: reproduced cold-listener command loss and source/config evidence for playback ownership and native permission gaps.
- `.brain/rca/2026-09-26-lalin-play-handoff-canonical-path.md`: canonical-path and drive-type guards for UNC/device reparse targets and mapped network drives; live ACL and paired-process checks remain open.
- `.brain/rca/2026-09-18-release-workflow-billing-block.md`: documented the GitHub account billing restriction that prevented the v0.1.1 signed draft workflow from starting.
- `.brain/rca/2026-09-18-installer-version-hardcode.md`: documented the local packaging filename drift after the 0.1.1 version bump.
- `.brain/rca/2026-07-23-release-workflow-legacy-path.md`
- `docs/rca/RCA--LOCAL-LLM-DISPATCH.md`
- `docs/rca/REPORT--LOCAL-LLM-DISPATCH.md`

## Archive Candidates

These are not deleted. They moved to `docs/archive/` during Phase 1:

- `docs/archive/GM6_BRAND_CI.md`
- `docs/archive/GM6_DESIGN_SYSTEM.md`
- `docs/archive/GM6_NAMING_DECISION.md`
- `docs/archive/GM6_SITEMAP.md`
- proposal packs beginning with `docs/archive/PROPOSED_`
- old sprint and RC planning files once their facts are represented in canonical docs.

## Presentation Docs

- `docs/presentation/lalin-ai-launch/index.html`: local presentation landing page for the internal demo.
- `docs/presentation/lalin-ai-launch/READINESS.md`: real/mockup/pending readiness note.

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---|---|---|---|---|---|
| 0.10.11b | 2026-09-26 | beta | Index canonical-path RCA for the S3 Studio-to-Play handoff | uncommitted | Codex |
| 0.10.10b | 2026-09-24 | beta | Index the handoff back to PRP | based on 4861082 | LALIN |
| 0.10.9b | 2026-09-24 | beta | Index the PRP integration gap analysis | based on de6fd16 | LALIN |
| 0.10.8b | 2026-09-23 | beta | Index the voice worker monitoring evidence | based on e833a7c | LALIN |
| 0.10.7b | 2026-09-22 | beta | Index the YouTube channel transcript pipeline feature doc, workflow runbook and SOP | based on e6b7be2 | LALIN |
| 0.10.7b | 2026-09-22 | beta | Index Slice B TTS evidence | based on 90971c8 | LALIN |
| 0.10.6b | 2026-09-22 | beta | Index the voice worker Linux runbook | based on b4ffe94 | LALIN |
| 0.10.5b | 2026-09-22 | beta | Refresh the Slice C entry (leak, sizing, D13, slim image) | based on 46eeb0a | LALIN |
| 0.10.4b | 2026-09-22 | beta | Index Slice C Linux evidence | based on 6508cec | LALIN |
| 0.10.3b | 2026-09-21 | beta | Index the D14/D15 proposal; H0 review 0.1.1c | based on 16b3daa | LALIN |
| 0.10.2b | 2026-09-21 | beta | Index the draft meeting-transcript pipeline design | based on b5acf61 | LALIN |
| 0.10.1b | 2026-09-21 | beta | Index Slice B ASR evidence (faster-whisper engine, asr-th-en-01 manifests) | based on 7d6235d | LALIN |
| 0.10.0b | 2026-09-20 | beta | Index voice-worker CR-005/ADR-005, H0 and Slice A evidence and the JaiTTS-Easy comparison after PR #20 merged | based on a6c5a4d | LALIN |
| 0.9.0b | 2026-09-20 | beta | Index complete Play current/candidate documentation, traceability and user/release guides | based on f5a6681 | LALIN |
| 0.8.0b | 2026-09-20 | beta | Index approved fullscreen/relative-seek implementation and native verification | based on 8429010 | LALIN |
| 0.7.1b | 2026-09-20 | beta | Index approved Compact implementation and native preview verification | based on 8429010 | LALIN |
| 0.7.0b | 2026-09-20 | candidate | Index pending CR-004 Compact and scrub-preview proposal separately from implemented video | based on 8429010 | LALIN |
| 0.6.1b | 2026-09-20 | beta | Index approved local video implementation and native verification | based on 8429010 | LALIN |
| 0.6.0b | 2026-09-20 | beta | Index pending local-video proposal separately from approved audio evidence | based on 8429010 | LALIN |
| 0.5.1b | 2026-09-20 | beta | Index approved Play specification and local foundation evidence | based on 8429010 | LALIN |
| 0.5.0b | 2026-09-20 | candidate | Index Play split proposal and align AGENTS/product/PRD pointers; preserve current runtime evidence | based on 8429010 | LALIN |
| 0.4.0 | 2026-09-20 | active | Recorded the completed Lalin Cast repository split and root-repository handoff | 6163c57 | LALIN |
| 0.2.1b | 2026-09-19 | candidate | Indexed the local Lalin Media fork provenance and P1/P2 implementation evidence | uncommitted | LALIN |
| 0.2.2b | 2026-09-19 | candidate | Indexed the approved Rust + Tauri v2 Media port ADR | uncommitted | LALIN |
| 0.2.0b | 2026-09-19 | candidate | Indexed the candidate Lalin AI umbrella platform ADR, Media plan and migration map | uncommitted | LALIN |
| 0.1.27b | 2026-09-18 | beta | Closed provenance for the TV Mode and local packaging work before feature-branch cleanup. | c86ddc4 | LALIN |
| 0.1.26b | 2026-09-18 | beta | Indexed the approved TV Mode validation report and local browser/native evidence. | c86ddc4 | LALIN |
| 0.1.25b | 2026-09-18 | beta | Indexed approved Lalin Play TV Mode product, architecture and design docs. | c86ddc4 | LALIN |
| 0.1.24b | 2026-09-18 | beta | Indexed the local installer version-drift RCA and local-only packaging fix. | 839bb9e | LALIN |
| 0.1.23b | 2026-09-18 | beta | Indexed final rerun attempt 3 and stopped retries after the repeated GitHub billing blocker. | pending provenance follow-up | LALIN |
| 0.1.22b | 2026-09-18 | beta | Indexed the controlled rerun and repeated GitHub billing blocker for the v0.1.1 release workflow. | pending provenance follow-up | LALIN |
| 0.1.21b | 2026-09-18 | beta | Indexed the v0.1.1 release workflow billing-block RCA and updated current release evidence. | pending provenance follow-up | LALIN |
| 0.1.20b | 2026-09-17 | beta | Updated Phase 9 release provenance to the merged version commit d553067. | pending provenance follow-up | LALIN |
| 0.1.19b | 2026-09-17 | beta | Indexed the Phase 9 signed draft release plan for version 0.1.1. | uncommitted | LALIN |
| 0.1.18b | 2026-09-17 | beta | Index requested sidecar build and runtime verification. | included with source repair | LALIN |
| 0.1.17b | 2026-09-17 | beta | Index approved playback remediation and scoped native/browser validation. | uncommitted | LALIN |
| 0.1.16b | 2026-09-17 | beta | Index CR-001 command-delivery RCA and candidate remediation plan. | uncommitted | LALIN |
| 0.1.15b | 2026-08-09 | beta | Added API semantics doc for behavior not expressible in OpenAPI. | uncommitted | LALIN |
| 0.1.14b | 2026-08-09 | beta | Added component registry, doc-graph scanner, and full REST API spec (42 endpoints). | uncommitted | LALIN |
| 0.1.13b | 2026-07-24 | beta | Added Phase 8 repo rename and presentation readiness docs. | uncommitted | LALIN |
| 0.1.12b | 2026-07-23 | beta | Updated Phase 7 release workflow plan and RCA status after implementation. | uncommitted | LALIN |
| 0.1.11b | 2026-07-23 | candidate | Added Phase 7 release workflow plan and RCA pointer. | uncommitted | LALIN |
| 0.1.10b | 2026-07-22 | beta | Updated Phase 6 workspace orchestration plan status after implementation. | uncommitted | LALIN |
| 0.1.9b | 2026-07-22 | candidate | Added Phase 6 workspace orchestration plan to the canonical architecture index. | uncommitted | LALIN |
| 0.1.8b | 2026-07-22 | beta | Updated Phase 5 contracts and MCP plan status after implementation. | uncommitted | LALIN |
| 0.1.7b | 2026-07-22 | beta | Added Phase 5 contracts and MCP plan to the canonical architecture index. | uncommitted | LALIN |
| 0.1.6b | 2026-07-22 | beta | Added Phase 4 executed app move map to the canonical architecture index. | uncommitted | LALIN |
| 0.1.5b | 2026-07-22 | beta | Added Phase 4 app folder migration plan to the canonical architecture index. | uncommitted | LALIN |
| 0.1.4b | 2026-07-22 | beta | Added executed Phase 3 runtime move map to the canonical architecture index. | uncommitted | LALIN |
| 0.1.3b | 2026-07-22 | beta | Added Phase 3 runtime state plan to the canonical architecture index. | uncommitted | LALIN |
| 0.1.2b | 2026-07-22 | beta | Added Phase 2 tooling map and canonical tools layout. | uncommitted | LALIN |
| 0.1.1b | 2026-07-22 | beta | Updated paths after Phase 1 documentation consolidation. | uncommitted | Codex |
| 0.1.0b | 2026-07-22 | beta | Created documentation index for the new SOT set and migration staging. | uncommitted | Codex |
