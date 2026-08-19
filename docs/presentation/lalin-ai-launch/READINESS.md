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
5. Do not promise one-click installer unless the NSIS artifact exists and is smoke-tested.

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
- One-click installer is pending until `G-Music_0.1.0_x64-setup.exe` exists and passes smoke.

## Installer status

Expected artifact:

```text
D:\G-Music\apps\desktop\src-tauri\target\release\bundle\nsis\G-Music_0.1.0_x64-setup.exe
```

Current presentation-safe status:

- Sidecar binary exists.
- Signing key exists.
- Installer build was attempted.
- Frontend build passed during installer attempt.
- Tauri/Rust release build did not produce the NSIS artifact inside the presentation window.

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
