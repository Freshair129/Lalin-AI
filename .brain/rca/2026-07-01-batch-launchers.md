## Symptom

`test.bat` failed immediately with misleading output such as `'px' is not recognized`, `'THONIOENCODING' is not recognized`, and `FRONTEND TSC FAILED` even though `npm run build` had previously succeeded.

## Evidence

- Running `cmd /c test.bat` from `D:\G-Music` produced fragmented command errors instead of normal batch execution.
- The batch files were saved with LF-only line endings and contained UTF-8 multibyte box-drawing characters and Thai comments.
- The failure affected command parsing before the actual toolchain checks completed.

## Root Cause

The Windows `.bat` launchers relied on text encoding and line-ending behavior that `cmd.exe` did not parse reliably in this environment. LF-only line endings plus UTF-8 multibyte characters in batch comments caused the shell to misread lines, so commands were truncated and reported as missing.

## Why The Issue Escaped Detection

The repo had working frontend/backend code paths, so the failure only appeared when using the convenience batch scripts. Build verification had been done through direct shell commands, which bypassed the launcher parsing bug.

## Proposed Prevention

- Keep Windows batch files ASCII-only.
- Normalize batch files to CRLF line endings.
- Prefer plain `echo` text over decorative Unicode in `.bat` files.
- Re-run the batch smoke tests after editing launcher scripts.
