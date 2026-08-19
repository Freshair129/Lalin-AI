$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$target = (Resolve-Path (Join-Path $scriptRoot "..\tools\dev\prewarm_ollama.ps1")).Path
& $target @args
exit $LASTEXITCODE
