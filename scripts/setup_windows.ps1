$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$target = (Resolve-Path (Join-Path $scriptRoot "..\tools\dev\setup_windows.ps1")).Path
& $target @args
exit $LASTEXITCODE
