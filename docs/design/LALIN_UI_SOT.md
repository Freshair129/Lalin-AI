# Lalin Studio UI Sources of Truth

**Status:** active documentation baseline  
**Owner:** product + frontend  
**Last reviewed:** 2026-07-21

This page is the entry point for workstation UI decisions. It prevents a visual
reference, a historical map, and the running UI from being treated as the same
thing.

| Need | Authoritative source |
|---|---|
| Shared desktop shell, global command bar, rail, and footer | [LALIN_SHELL_SOT.md](LALIN_SHELL_SOT.md) |
| Screen regions, responsive behaviour, and layout invariants | [LALIN_LAYOUT_SOT.md](LALIN_LAYOUT_SOT.md) |
| Navigation, route ownership, and user flows | [LALIN_SITEMAP_SOT.md](LALIN_SITEMAP_SOT.md) |
| Arrange-specific stage and command layout | [LALIN_ARRANGE_TAB_SPEC.md](LALIN_ARRANGE_TAB_SPEC.md) |
| Workspace-specific stage and task-launching layout | [LALIN_WORKSPACE_TAB_SPEC.md](LALIN_WORKSPACE_TAB_SPEC.md) |
| Voice Studio-specific profile, TTS, and Agent Voice layout | [LALIN_VOICE_STUDIO_TAB_SPEC.md](LALIN_VOICE_STUDIO_TAB_SPEC.md) |
| Dubbing-specific transcript, assignment, review, and render layout | [LALIN_DUBBING_TAB_SPEC.md](LALIN_DUBBING_TAB_SPEC.md) |
| Mastering-specific source, target, preview, and export layout | [LALIN_MASTERING_TAB_SPEC.md](LALIN_MASTERING_TAB_SPEC.md) |
| Library-specific inventory, filter, inspector, and provenance layout | [LALIN_LIBRARY_TAB_SPEC.md](LALIN_LIBRARY_TAB_SPEC.md) |
| Jobs-specific queue, recovery, output, and log layout | [LALIN_JOBS_TAB_SPEC.md](LALIN_JOBS_TAB_SPEC.md) |
| Settings-specific runtime, model, storage, update, and impact layout | [LALIN_SETTINGS_TAB_SPEC.md](LALIN_SETTINGS_TAB_SPEC.md) |
| Approved-design implementation sequence and exit checks | [LALIN_UI_IMPLEMENTATION_PLAN.md](LALIN_UI_IMPLEMENTATION_PLAN.md) |
| Colour, typography, components, and visual language | [GM6_DESIGN_SYSTEM.md](GM6_DESIGN_SYSTEM.md) |
| Current CSS tokens and component implementation | [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) and `apps/desktop/src/` |
| Name and product-language decision | [GM6_NAMING_DECISION.md](GM6_NAMING_DECISION.md) |

## Precedence

1. The shell, layout, and sitemap SOT documents above define intended product
   structure.
2. Running code defines what is shipped today; a mismatch is a documentation or
   implementation gap, never an implicit decision.
3. Legacy documents remain evidence and technical detail only. They do not
   override this index.

## Change rule

Any navigation, shell, responsive, or Remix-layout change updates the relevant
SOT in the same change set. Changes that alter both documents require product
review before routing work begins.
