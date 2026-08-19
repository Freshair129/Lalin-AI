# Clean-Machine Acceptance Checklist (Task 18, Phase D)

> Run this on a **real, isolated Windows 10/11 x64 machine** — a fresh VM, or a
> spare box you don't mind wiping. Do **not** run it on this dev machine; it
> already has Python/CUDA/Rust/Node installed and would prove nothing.
> Install **nothing** on the target before step 1 — no Python, no Visual C++
> redistributables, no .NET beyond what Windows ships. The whole point is to
> prove the installer needs no developer environment.

## Getting the installer onto the VM

The build produced (or will produce) a single file:

```
frontend/src-tauri/target/release/bundle/nsis/G-Music_0.1.0_x64-setup.exe
```

Copy that one file to the clean VM (USB drive, shared folder, or upload
somewhere you can download from inside the VM). It's self-contained — the
sidecar binary and the frontend are already bundled inside it.

## The checklist

Run every row. Record the actual result next to each — don't just check a
box.

| # | Action | Expected |
|---|---|---|
| 1 | Run the `.exe` | Installs without prompting for any dependency (no "Python not found," no ".NET missing," nothing) |
| 2 | Launch from the Start menu | Window opens; footer shows `CONNECTING` then `ONLINE` within 60 seconds |
| 3 | Open the Plugins tab | All three optional plugins (pedalboard, psola, matchering) show as **not installed**, each with its install command and licence |
| 4 | Open the Files tab | Empty workspace, no error |
| 5 | Import an MP3 in Remix, drag it onto a track | Waveform draws; Space plays it |
| 6 | Set a fade and a pan, press **⬇ WAV** | A file downloads and audibly contains the fade and the pan |
| 7 | Open Voice Studio and try TTS | Fails with a Thai message naming the missing package — **not** a stack trace — and the app stays usable afterward |
| 8 | Close the app, open Task Manager | No `g-music-backend.exe` process remains |
| 9 | Relaunch the app | Backend starts again; the project you saved in step 6 reopens with the same clip, fade and pan |

**What each row actually proves:**
- Rows 5–6 prove the render pipeline (Phases A–C) — this is the core of what shipped in PR #9.
- Row 7 proves the lite runtime degrades honestly instead of crashing when an optional ML dependency is absent.
- Rows 2 and 8 prove the sidecar (Phase D) — the app starts and fully stops its own backend with no manual step.

If **any** row fails, stop and report exactly which one and what happened
instead — don't average it out. A single failing row means R-006 stays open.

## After you run it

Tell me the result per row (pass/fail + what you saw for any failure). If
every row passes, I'll update `docs/appendices/E-risk-matrix.md` (mark R-006
mitigated, same pattern as R-009) and the "SCAFFOLDING" banner in
`docs/PACKAGING_SIDECAR.md`, and commit that.
