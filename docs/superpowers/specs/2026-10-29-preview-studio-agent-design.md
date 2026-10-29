# Preview validity and studio agent panel design

The transient warp preview is invalidated permanently on any recipe change, even if values are restored. Marker edits immediately disable audition and render until a new revision completes; the draft remains editable and can be submitted. Reject stale asynchronous results and preserve server fingerprint and revision checks.

The navigation rail has an expand/collapse control: collapsed navigation shows icons with accessible names and tooltips; expanded navigation shows icons and complete labels. The choice persists locally. A right-side Agent panel opens from the shell on any page and shares the existing timeline engine and Mix Copilot proposal/apply flow. Keep the panel mounted while closed so conversation is retained during the session, and avoid duplicate floating copilot controls. Report unavailable backend errors.

Alternatives: replacing the existing agent backend or inventing a coding agent changes product capabilities; reuse the current agent protocol. A floating chat obscures work; use a side panel within the app shell. Layout must remain usable at narrow widths.

Native UAT uses the existing rights-cleared, artificially drifted fixture and tests input invalidation, new revision, A/B playback and accepted render. Human listening and installed-package UAT remain separate evidence.

Conversation context: the agent endpoint accepts up to 20 previous user/assistant messages of at most 4,000 characters each, and refuses system-role history. The panel sends the most recent messages with each request; conversation is retained in memory while the panel is closed, not persisted across application restart. Proposed timeline changes still require explicit apply.
