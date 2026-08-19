---
version: "0.1.1b"
created_at: "2026-07-21T00:00:00+07:00,ATHER,uncommitted"
last_update: "2026-07-21T00:00:00+07:00,ATHER"
status: "beta"
superseded_by: null
attributes:
  domain: "product-ui"
  doc_type: "tab-layout-spec"
  scope: "Lalin Studio Settings desktop"
---

# Lalin Studio Settings Tab Specification

**Status:** approved design baseline; implementation pending.  
**Parent shell:** [LALIN_SHELL_SOT.md](LALIN_SHELL_SOT.md)  
**Approved visual:** `docs/design/reference/lalin/LALIN_SETTINGS_V1_APPROVED.png`.

## Purpose

Settings owns persistent workstation configuration: runtime/models, brain
provider, storage, updates, accessibility, and about. It makes restart and
resource consequences explicit before configuration is applied.

## Stage map

```
M0/H1/R1/F1 inherited unchanged from W0
S1           S2 settings groups | S3 selected setting | S4 impact/restart state
```

| ID | Region | Desktop rule |
|---|---|---|
| `S2` | settings groups | Runtime & models, Brain provider, Storage, Updates, Accessibility, About. |
| `S3` | selected setting | editable controls and inline validation for the selected group. |
| `S4` | impact/restart state | clear side panel for restart need, resource estimate, pending changes, apply/cancel. |

## Interaction rules

- Runtime/model changes state their device, download, VRAM, and restart effect
  before Apply. Existing running jobs are never silently disrupted.
- Brain provider changes expose local/cloud state and required credentials
  without revealing secrets in the UI.
- Storage actions state affected paths/sizes before a cleanup/move action.
- Updates show installed version, channel, notes, and restart/install state.

## Acceptance checks

- W0 shell dimensions and rail order are unchanged.
- Selected group, editable values, and side effects are visible together.
- Apply is disabled until valid changes exist; restart requirement is explicit.
- F1 activity remains available while settings are edited.

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---|---|---|---|---|---|
| 0.1.1b | 2026-07-21 | beta | Settings v1 visual baseline approved; implementation pending. | uncommitted | ATHER |
| 0.1.0b | 2026-07-21 | superseded | First Settings design spec under approved W0 shell, pending visual approval. | uncommitted | ATHER |
