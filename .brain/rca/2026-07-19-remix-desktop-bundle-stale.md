# RCA: Remix desktop window ran a stale bundled frontend

## Symptom

The desktop Remix window continued to show the previous mixer-first layout after the timeline-first frontend change had built successfully.

## Evidence

- The running desktop process was `frontend\src-tauri\target\installed-smoke\g-music.exe`.
- That executable was last written on 2026-07-03.
- `frontend\dist\index.html` and the current hashed JavaScript bundle were written by the verified frontend build on 2026-07-19.
- The timeline-first layout rendered in the current Vite session, while the installed-smoke executable continued to show the previous layout.

## Root Cause

`npm run build` updates only `frontend\dist`. The running `installed-smoke` executable embeds the frontend assets that existed when it was packaged on 2026-07-03, so it cannot load the new `dist` assets at runtime.

## Why The Issue Escaped Detection

The frontend build gate was treated as if it refreshed the packaged desktop application. No post-build Tauri packaging and launch check was run against the executable the user had open.

## Proposed Prevention

- When validating a desktop-visible UI change, rebuild the Tauri application after the frontend build.
- Launch the freshly built executable or reinstall the fresh installer before calling the desktop UI verified.
- Keep browser/Vite screenshots labeled as web-preview evidence, separate from installed-app evidence.
