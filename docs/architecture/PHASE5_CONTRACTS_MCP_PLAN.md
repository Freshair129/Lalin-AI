---
version: "0.1.0b"
created_at: "2026-07-22T07:12:00+07:00,LALIN,uncommitted"
last_update: "2026-07-22T07:12:00+07:00,LALIN"
status: "beta"
superseded_by: null
attributes:
  domain: "architecture"
  doc_type: "implementation-plan"
  scope: "Phase 5 contracts package and MCP surface"
---

# Phase 5 Contracts + MCP Plan

## Decision Gate

Status: executed. This plan was approved and implemented as the first contracts/MCP slice.

## Complexity and Risk

- Complexity: C-3 — shared package boundary plus external agent integration surface.
- Risk: HIGH — incorrect contracts can break desktop/API compatibility, and unsafe MCP tools could mutate projects without the same confirmation model as the UI.

## Goal

Create one shared contract source for the desktop app, API, tests, and agent/MCP tooling. Phase 5 must reduce duplicated TypeScript/Python shapes without changing runtime behavior.

MCP is included as a first-class consumer of the same contracts. It must not define private schemas that drift from the REST/WebSocket API.

## Current Evidence

Observed from current code after Phase 4:

| Surface | Current owner | Evidence |
|---|---|---|
| Desktop HTTP/WebSocket client | `apps/desktop/src/api.ts` | Defines `Voice`, `SpeechConfig`, `AgentActResult`, `Job`, `RuntimeActivityStatus`, project/file/pack/plugin client methods. |
| API request models | `apps/api/app/schemas.py` and router-local Pydantic models | Defines pipeline requests plus router-specific request/response models. |
| Job streaming | `apps/api/app/routers/jobs.py` | `GET /jobs`, `GET /jobs/{job_id}`, `WS /jobs/ws/{job_id}`. |
| Runtime telemetry | `apps/api/app/routers/health.py` | `GET /health`, `GET /runtime/status`. |
| Agent mutation proposal | `apps/api/app/routers/agent.py` | `POST /agent/act`, internal read/write tool schema, returns proposed mutations only. |

## Contract Scope

Create `packages/contracts/` only with contracts already used by at least two consumers or needed by MCP. Initial scope:

1. Runtime status
   - `HealthResponse`
   - `RuntimeActivityStatus`
   - telemetry fields: CPU, RAM, GPU, VRAM
2. Job lifecycle
   - `Job`
   - `JobStatus`
   - `JobResult`
   - WebSocket job update payload
3. Agent mutation protocol
   - `AgentActRequest`
   - `AgentActResponse`
   - `AgentMutation`
   - allowed mutation op names and argument schemas
4. Project persistence envelope
   - `ProjectMeta`
   - `ProjectDocument`
   - project `data` remains `Record<string, unknown>` until timeline schema is formally frozen
5. Voice and speech configuration
   - `Voice`
   - `SpeechProfile`
   - `SpeechConfig`

Out of initial scope:

- Full timeline clip schema freeze.
- Generated API client for every endpoint.
- Renaming public packaging identifiers from G-Music to Lalin.
- New runtime behavior.

## Package Shape

Target tree after approval:

```text
packages/
  contracts/
    package.json
    tsconfig.json
    src/
      index.ts
      runtime.ts
      jobs.ts
      agent.ts
      projects.ts
      voices.ts
      speech.ts
      mcp.ts
    schemas/
      lalin-agent-tools.schema.json
      lalin-runtime.schema.json
```

Rules:

- `packages/contracts` has no dependency on `apps/desktop` or `apps/api`.
- TypeScript contracts are the first implementation because the desktop already owns duplicate types.
- Python remains the API runtime source for validation in this phase; Python generated models are deferred unless drift becomes costly.
- JSON Schema files are exported for MCP and contract tests.
- Node ESM output uses explicit `.js` exports so both the MCP server and Vite can resolve the local package.

## MCP Surface

MCP must expose safe, small tools that wrap existing API behavior. It is an integration layer, not a second backend.

Target tree after approval:

```text
apps/
  mcp/
    package.json
    src/
      server.ts
      client.ts
      tools/
        runtime.ts
        jobs.ts
        agent.ts
```

Initial MCP tools:

| Tool | Mode | Backing API | Safety rule |
|---|---|---|---|
| `lalin.runtime_status` | read | `GET /runtime/status` | Read-only. |
| `lalin.health` | read | `GET /health` | Read-only. |
| `lalin.list_jobs` | read | `GET /jobs` | Read-only. |
| `lalin.get_job` | read | `GET /jobs/{job_id}` | Read-only. |
| `lalin.propose_agent_mutations` | propose | `POST /agent/act` | Returns proposed mutations only; does not apply them. |

Not allowed in Phase 5:

- MCP tools that delete files, move clips, apply timeline mutations, install plugins, or launch long-running renders directly.
- MCP access to arbitrary filesystem paths.
- MCP-specific mutation schemas not exported by `packages/contracts`.

## Implemented Slice

- `packages/contracts`: TypeScript contract package with runtime, job, agent, project, voice, speech, and MCP contract exports.
- `packages/contracts/schemas`: JSON Schema artifacts for runtime status and agent tool contracts.
- `apps/desktop`: imports shared contract types through `@lalin/contracts` while preserving the existing `../api` type re-export surface for current components.
- `apps/mcp`: local stdio MCP server using the official MCP SDK. It exposes only the approved read/propose tools and wraps existing REST endpoints.

## Implementation Order After Approval

1. Create `packages/contracts` with TypeScript contract types copied from observed desktop/API shapes.
   - Verify: `npm run build` in `packages/contracts`.
2. Replace duplicated desktop types in `apps/desktop/src/api.ts` with imports from `@lalin/contracts`.
   - Verify: `cd apps\desktop && npm run build`.
3. Add JSON Schema exports for agent/runtime/job contracts.
   - Verify: schema files validate as JSON and are referenced by package exports.
4. Create `apps/mcp` as a local MCP server that imports `@lalin/contracts` and wraps existing HTTP endpoints.
   - Verify: MCP server starts in read-only mode and tool schemas load.
5. Add minimal root workspace wiring only if needed by npm local package resolution.
   - Verify: no Nx/Turbo/Lerna introduced.
6. Update docs and acceptance evidence.
   - Verify: `git diff --check`.

## Acceptance Criteria

- Desktop imports at least one real shared contract from `packages/contracts`.
- MCP imports its tool/input/output schemas from `packages/contracts`.
- MCP exposes only read/propose tools listed in this document.
- `apps/api` behavior remains unchanged.
- Existing validation remains green:
  - `cd apps\desktop && npm run build`
  - `cd apps\api && ..\..\backend\.venv\Scripts\python.exe -m compileall -q app`
  - `cargo check --manifest-path apps\desktop\src-tauri\Cargo.toml`
  - `git diff --check`

## Validation Evidence

Executed on 2026-07-22:

- `cd packages\contracts && npm run build` — PASS.
- `cd apps\mcp && npm run build` — PASS.
- `cd apps\desktop && npm run build` — PASS.
- `cd apps\api && ..\..\backend\.venv\Scripts\python.exe -m compileall -q app` — PASS.
- `cargo check --manifest-path apps\desktop\src-tauri\Cargo.toml` — PASS.
- MCP SDK client `listTools()` against `node dist/server.js` — PASS; returned the five approved tools.
- JSON Schema parse for `packages/contracts/schemas/*.json` — PASS.
- MCP forbidden write/action scan — PASS for Phase 5 read/propose boundary.
- `git diff --check` — PASS.

## Rollback

- Remove `apps/mcp/` and `packages/contracts/`.
- Restore `apps/desktop/src/api.ts` local type declarations.
- No runtime data migration is involved.

## Changelog

| Version | Date | Status | Summary | Commit Hash | Agent |
|---|---|---|---|---|---|
| 0.1.1b | 2026-07-22 | beta | Executed Phase 5 shared contracts package and safe MCP read/propose server. | uncommitted | LALIN |
| 0.1.0b | 2026-07-22 | candidate | Proposed Phase 5 shared contracts package and safe MCP read/propose surface. | uncommitted | LALIN |
