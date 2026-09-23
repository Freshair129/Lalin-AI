---
version: "0.1.0b"
created_at: "2026-09-24T01:40:00+07:00,LALIN,de6fd16"
last_update: "2026-09-24T01:40:00+07:00,LALIN"
status: "beta"
superseded_by: null
attributes:
  domain: "speech-runtime-integration"
  doc_type: "validation"
  scope: "What stands between the PRP control plane and the Lalin voice worker — measured against the PRP repo at f2c86a7, not assumed"
---

# PRP ↔ voice worker — what is actually missing

**Authorization:** owner 2026-09-24, "ให้ PRP เรียก worker เลย". Read-only inspection of
`F:\Private-Runtime-Platform` at `f2c86a7` (branch `feat/PRP-WP24-ev07-candidate-a`); nothing in that repository was
modified. Baseline on our side `de6fd16`.

## 0. Result

**PRP cannot call the worker today, and the blocker is not on our side.** The control plane has no code that can
invoke anything: both processes that would do it exit 3 by design, and the adapter that would sit between them is
scheduled for migration step M4, which is gated behind WP24 → WP03 → WP04.

| Question | Answer | Evidence |
|---|---|---|
| Is there PRP code that calls a worker? | **No** | `dispatcher.py` logs "refuses to start: no outbox store or runtime invoker configured (M4)" and returns 3; `observer.py` does the same for its own ports |
| Is the port defined? | **Yes** | `prp.core.execution.ports.RuntimeInvoker` — `invoke`, `cancel`, `execution_evidence` |
| Is the worker contract settled? | **No** | `contracts/openapi/prp-worker.yaml` is `0.4.0-draft`, "DRAFT until the WP03 contract freeze; not implemented or tested" |
| When does the adapter arrive? | **M4**, "รอ WP24" per `docs/SDD-PRP-REPO.md` | §11 migration table, M4 row: "ตาม disposition ของ WP24 → WP03 → WP04" |
| Can a PRP container reach our worker? | **Yes, proven** | the `coordinator-probe` service reaches the socket with the shared volume and group 10001 (Slice C, D17) |
| Is there a working caller to copy? | **Yes** | [`voice_worker_client.py`](../../tools/verify/voice_worker_client.py), exercised against the production worker today |

So the transport and a reference caller exist; what is missing is a `RuntimeInvoker` implementation inside PRP, plus
the decisions below that only PRP can make.

## 1. The seam is the adapter, not our routes

PRP's own contract says: *"Native engines do not have to expose these routes; an external adapter/supervisor provides
them."* That resolves what looks at first like a conflict:

| | PRP worker contract | Lalin worker |
|---|---|---|
| prefix | `/prp/worker/v1` | `/worker/v1` |
| submit | `POST /invocations` | `POST /operations` |
| poll | `GET /invocations/{attempt_id}` | `GET /operations/{attempt_id}` |
| cancel | `POST /invocations/{attempt_id}/cancel` | `POST /operations/{attempt_id}/cancel` |
| describe / readiness | present | present |
| result download | **absent** | `GET /operations/{attempt_id}/output` |
| payload erase | **absent** | `DELETE /operations/{attempt_id}/payload` |
| metrics | **absent** | `GET /worker/v1/metrics` |

**Our routes do not need to change.** An adapter implementing `RuntimeInvoker` translates, which is the shape PRP
designed for. Renaming our routes to match a contract that is still DRAFT would be building to a moving target.

## 2. Decisions only PRP can make

These are not gaps we can close by guessing; each one changes the adapter's behaviour.

1. **`profile_epoch` is an `int` in PRP's `Attempt` and `ResultEnvelope`; our `Target.runtime_epoch` is a string**
   (`ep-b4e0171ee3d7-09b7cd6b`, regenerated on every engine start). Either PRP carries the worker's opaque epoch
   through, or the adapter maintains a mapping. An epoch mismatch is how the worker refuses stale work (409
   `TARGET_MISMATCH`), so this must be exact, not approximate.
2. **`runtime_uid` (PRP) vs `runtime_id` (ours)** — a rename, but it must be settled before the conformance test in
   PRP's repo can pass.
3. **`fence_token` (PRP `Attempt`) vs our `Admission.lease_id` + `content_fence`** — our worker takes a lease id, a
   `start_before`, a `deadline_at` and an optional content fence. Which of PRP's fields feeds which is undecided.
4. **How audio arrives and how results come back.** Our worker takes the audio as multipart on submit and serves the
   result from `/output`, then requires an explicit `DELETE /payload`. PRP's worker contract has neither route, and
   its client contract marks the `transcribeAudio` / `uploadArtifact` multipart binding as "รอ upload path M4".
   Until that is decided, an adapter cannot know where bytes come from or who erases them.
5. **Who calls `DELETE /payload`.** The worker keeps the result until someone erases it. If PRP never does, audio and
   transcripts accumulate in the worker's data volume. This is a data-retention decision, not a technical one.

## 3. What we can hand over now

- **A proven caller.** `tools/verify/voice_worker_client.py` speaks the full contract with no retries (retry is the
  coordinator's decision, LVP-REQ-023) and was run against the production worker today.
- **A proven transport.** `docker/voice-worker/compose.example.yaml` shows exactly what a coordinator container
  needs: the `voice-socket` volume and `group_add: ["10001"]`. The `coordinator-probe` service is that, minimal.
- **Observability without coupling.** The status gateway already exposes readiness and metrics off-host, so PRP can
  watch the worker before it can call it.
- **Contract facts the coordinator must honour** are listed in the runbook §5: D16 non-determinism, D15 glossary,
  D18 `repeated_oom` as an operator alert rather than a retryable error.

## 4. Recommendation

Write the adapter **in PRP's repository at M4**, not here — it implements PRP's port and depends on PRP's models,
and their `AGENTS.md` requires an approved document before code. Writing it in this repository now would mean
inventing answers to §2 on their behalf, which is exactly what their rules forbid.

The useful next step is a short handoff document to PRP containing §1 and §2, so the five decisions are made once,
by the people who own them, before M4 opens.

## 5. Not done

- No adapter written, in either repository.
- No change to `F:\Private-Runtime-Platform`; it is a separate repository, currently on
  `feat/PRP-WP24-ev07-candidate-a` with staged changes belonging to someone else.
- Conformance between our routes and `prp-worker.yaml` was **not** tested, because that contract is DRAFT and the
  adapter — not our worker — is the thing that must conform to it.

## CHANGELOG

| Version | Date | Status | Change | Evidence | Author |
|---|---|---|---|---|---|
| 0.1.0b | 2026-09-24 | beta | First gap analysis: PRP has no invoking code (M4, gated), the adapter is the seam, five decisions listed | based on de6fd16, PRP at f2c86a7 | LALIN |
