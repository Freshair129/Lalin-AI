---
version: "0.1.1b"
created_at: "2026-07-21T00:00:00+07:00,ATHER,uncommitted"
last_update: "2026-07-21T00:00:00+07:00,ATHER"
status: "beta"
superseded_by: null
attributes:
  domain: "product-ui"
  doc_type: "tab-layout-spec"
  scope: "Lalin Studio Library desktop"
---

# Lalin Studio Library Tab Specification

**Status:** approved design baseline; implementation pending.  
**Parent shell:** [LALIN_SHELL_SOT.md](LALIN_SHELL_SOT.md)  
**Approved visual:** `docs/design/reference/lalin/LALIN_LIBRARY_V1_APPROVED.png`.

## Purpose

Library is the durable inventory for projects, media, outputs, and packs. It
supports search, filtering, selection, and safe asset/project actions; it does
not duplicate Workspace's continuity card or Jobs' recovery surface.

## Stage map

```
M0/H1/R1/F1 inherited unchanged from W0
S1           L1 collection tabs | L2 filter/search | L3 inventory | L4 inspector
```

| ID | Region | Desktop rule |
|---|---|---|
| `L1` | collection tabs | Projects, Media, Outputs, Packs. Active collection is explicit and restores its filter state. |
| `L2` | filter/search | type, tag, date, size, and sort controls; filters are discoverable and removable. |
| `L3` | inventory | list or grid view with item type, modified date, metadata summary, and selection. |
| `L4` | inspector | selected item metadata, preview where available, path/source, tags, and context-safe actions. |

## Interaction rules

- Search/filter affects only the active collection and preserves state when the
  user returns.
- Opening a project restores its project state; opening media exposes preview
  and a context action rather than accidentally replacing a current source.
- Delete/archive actions require confirmation and identify the exact asset or
  project affected.
- Outputs can open their originating project/job when provenance exists.

## Acceptance checks

- W0 shell dimensions and rail order are unchanged.
- Current collection, filter state, selected item, and inspector metadata are
  visible together.
- Library's action affordances do not obscure provenance or destructive scope.
- The compact F1 job activity remains cross-app, not a Library-specific queue.

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---|---|---|---|---|---|
| 0.1.1b | 2026-07-21 | beta | Library v1 visual baseline approved; implementation pending. | uncommitted | ATHER |
| 0.1.0b | 2026-07-21 | superseded | First Library design spec under approved W0 shell, pending visual approval. | uncommitted | ATHER |
