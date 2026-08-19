$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$target = (Resolve-Path (Join-Path $scriptRoot "..\tools\verify\smoke_installed_app.ps1")).Path
& $target @args
exit $LASTEXITCODE
