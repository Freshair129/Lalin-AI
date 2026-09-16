# Lalin AI presentation readiness

Date: 2026-07-24

## Open this first

Open:

```powershell
start D:\G-Music\docs\presentation\lalin-ai-launch\index.html
```

## One-hour presentation recommendation

1. Start with the landing page story: local-first AI audio workstation.
2. Show the repo rename: `Freshair129/Lalin-AI`.
3. Show the approved Lalin mockups and clearly call them `Mockup`.
4. Demo the real app through local dev runtime if backend starts cleanly.
5. Describe the one-click installer as locally smoke-tested only; do not present it as a signed or clean-VM release.

## Real today

- GitHub repo renamed to `Freshair129/Lalin-AI`.
- Local `origin` points to `https://github.com/Freshair129/Lalin-AI.git`.
- Branch `swarm/local-llm-refine` pushed after rename.
- Root workspace orchestration exists.
- Contracts package exists.
- MCP read/propose server exists.
- Release workflow path now points to `apps/desktop`.
- Desktop/API source lives under `apps/desktop` and `apps/api`.

## Mockup / not fully shipped

- Final Lalin visual shell and all tab mockups are approved references, not all fully implemented UI states.
- Public download landing page is local presentation material, not a hosted production page yet.
- Local unsigned one-click installer exists and passed an isolated install/runtime smoke; signed release and clean-VM acceptance remain open.

## Installer status

Expected artifact:

```text
apps/desktop/src-tauri/target/release/bundle/nsis/G-Music_0.1.0_x64-setup.exe
```

Current presentation-safe status:

- Full-profile sidecar binary exists with its adjacent `_internal/` payload.
- Unsigned NSIS installer exists and passed an isolated install/runtime smoke.
- Installed app started the sidecar on port 8756 and returned `/health` HTTP 200.
- Evidence: [sidecar and installer validation](../../validation/2026-09-17-SIDECAR-BUILD.md); installer SHA-256 `94EEBBC4CD9E0C209F267C2A6E857EC90DB5B2AD5705DADA877081B038242D7A`.
- The checkout has no `keys/g-music.key`; signed updater artifacts were not produced.
- Clean-VM acceptance and model inference remain separate, unrun gates.

## Demo commands

```powershell
cd D:\G-Music
npm run check:all
```

Backend:

```powershell
cd D:\G-Music\apps\api
..\..\backend\.venv\Scripts\Activate.ps1
uvicorn app.main:app --port 8756
```

Frontend:

```powershell
cd D:\G-Music\apps\desktop
npm run dev
```
