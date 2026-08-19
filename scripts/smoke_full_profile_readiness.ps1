$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$target = (Resolve-Path (Join-Path $scriptRoot "..\tools\verify\smoke_full_profile_readiness.ps1")).Path
& $target @args
exit $LASTEXITCODE
