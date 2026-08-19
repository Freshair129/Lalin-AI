$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$target = (Resolve-Path (Join-Path $scriptRoot "..\tools\verify\smoke_workstation_features.ps1")).Path
& $target @args
exit $LASTEXITCODE
