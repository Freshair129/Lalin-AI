$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$target = (Resolve-Path (Join-Path $scriptRoot "..\tools\build\build_installer.ps1")).Path
& $target @args
exit $LASTEXITCODE
