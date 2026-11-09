param(
    [Parameter(Mandatory = $true)][string]$InputFile,
    [Parameter(Mandatory = $true)][ValidatePattern('^[A-Fa-f0-9]{64}$')][string]$Sha256,
    [ValidateSet('strict', 'hyperv-v11')][string]$Profile = 'strict',
    [string]$EvidenceRoot = 'E:\lalin-cr008-evidence\w2-c'
)

$ErrorActionPreference = 'Stop'
$evidenceRoot = $EvidenceRoot
New-Item -ItemType Directory -Force -Path $evidenceRoot | Out-Null

$os = Get-CimInstance Win32_OperatingSystem
$system = Get-CimInstance Win32_ComputerSystem
$processors = @(Get-CimInstance Win32_Processor)
$version = Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion'
$profileBaselineDate = [datetime]::ParseExact('2026-10-20', 'yyyy-MM-dd', [Globalization.CultureInfo]::InvariantCulture)
$minimumBaselineDate = [datetime]::ParseExact('2026-10-13', 'yyyy-MM-dd', [Globalization.CultureInfo]::InvariantCulture)
$minimumBaselineKB = 'KB5127648'
$minimumBuildFamily = 26300
$minimumUbr = 9711
$hotfixes = @(Get-HotFix | Where-Object { $_.InstalledOn } | Sort-Object { [datetime]$_.InstalledOn } -Descending)
$latestUpdate = $hotfixes | Select-Object -First 1
$coreCount = ($processors | Measure-Object -Property NumberOfCores -Sum).Sum
$logicalProcessorCount = [int]$system.NumberOfLogicalProcessors
if ($logicalProcessorCount -le 0) {
    $logicalProcessorCount = [int](($processors | Measure-Object -Property NumberOfLogicalProcessors -Sum).Sum)
}
$guestModel = [string]$system.Model
$memoryBytes = [uint64]$system.TotalPhysicalMemory
$architecture = if ($env:PROCESSOR_ARCHITEW6432) { $env:PROCESSOR_ARCHITEW6432 } else { $env:PROCESSOR_ARCHITECTURE }
$architecture = [string]$architecture
$displayVersion = [string]$version.DisplayVersion
$editionId = [string]$version.EditionID
$edition = switch ($editionId) {
    'Core' { 'Home' }
    'Professional' { 'Pro' }
    default { $editionId }
}
$buildFamily = [int]$version.CurrentBuild
$ubr = [int]$version.UBR
$fullBuild = "$buildFamily.$ubr"
$updateDate = if ($latestUpdate) { ([datetime]$latestUpdate.InstalledOn).ToUniversalTime().ToString('o') } else { $null }
$updateIsCurrent = $latestUpdate -and ([datetime]$latestUpdate.InstalledOn -ge $minimumBaselineDate)
$baselineReviewCurrent = (Get-Date).Date -le $profileBaselineDate.Date
$editionValid = $edition -in @('Home', 'Pro') -and $editionId -in @('Core', 'Professional')
$buildValid = $buildFamily -eq $minimumBuildFamily -and $ubr -ge $minimumUbr
$ramIsMinimumProfile = $memoryBytes -ge 8GB -and $memoryBytes -lt 9GB
$strictProfileValid = $os.Caption -match 'Windows 11' -and $editionValid -and $displayVersion -eq '26H2' -and $architecture -eq 'AMD64' -and $buildValid -and $coreCount -eq 4 -and $ramIsMinimumProfile -and $updateIsCurrent -and $baselineReviewCurrent
$gpuPassthroughNames = @()
if ($Profile -eq 'hyperv-v11') {
    $videoControllers = @(Get-CimInstance Win32_VideoController)
    $gpuPassthroughNames = @($videoControllers | Where-Object { $_.Name -notmatch '^Microsoft (Hyper-V Video|Basic Display Adapter|Remote Display Adapter)' } | ForEach-Object { [string]$_.Name })
}
$hyperVProfileValid = $os.Caption -match 'Windows 11' -and $editionValid -and $architecture -eq 'AMD64' -and $guestModel -eq 'Virtual Machine' -and $logicalProcessorCount -eq 4 -and $ramIsMinimumProfile -and $gpuPassthroughNames.Count -eq 0
$profileValid = if ($Profile -eq 'hyperv-v11') { $hyperVProfileValid } else { $strictProfileValid }
$installedKBs = @($hotfixes | ForEach-Object { [string]$_.HotFixID } | Sort-Object -Unique)
$installedKBUpdateDates = @($hotfixes | ForEach-Object {
    [ordered]@{
        kb = [string]$_.HotFixID
        installedOnUtc = ([datetime]$_.InstalledOn).ToUniversalTime().ToString('o')
    }
})

$runId = [guid]::NewGuid().ToString('N')
$hostRecord = [ordered]@{
    acceptedProfile = [bool]$profileValid
    osCaption = $os.Caption
    edition = $edition
    editionId = $editionId
    displayVersion = $displayVersion
    servicingChannel = 'General Availability Channel'
    buildFamily = $buildFamily
    build = $fullBuild
    ubr = $ubr
    architecture = $architecture
    cpuModel = (($processors | Select-Object -ExpandProperty Name) -join '; ')
    cpuCoreCount = [int]$coreCount
    installedMemoryBytes = $memoryBytes
    latestInstalledHotfix = if ($latestUpdate) { $latestUpdate.HotFixID } else { $null }
    installedKBs = $installedKBs
    installedKBUpdateDates = $installedKBUpdateDates
    latestInstalledUpdateUtc = $updateDate
    minimumBaselineKB = $minimumBaselineKB
    minimumBaselineUpdateDate = $minimumBaselineDate.ToString('yyyy-MM-dd')
    minimumBaselineKBInstalled = [bool]($installedKBs -contains $minimumBaselineKB)
    baselineProfileReviewedOn = $profileBaselineDate.ToString('yyyy-MM-dd')
    baselineProfileReviewCurrent = [bool]$baselineReviewCurrent
    baselineSources = @(
        'https://learn.microsoft.com/en-us/windows/release-health/status-windows-11-26h2/'
        'https://support.microsoft.com/en-us/servicing/os/windows-11/2026/10/kb5127648-windows-11-24h2-25h2-26h2-security-update'
    )
    powerMode = (powercfg /getactivescheme | Out-String).Trim()
    outputEndpoint = 'not_applicable'
    hardwareProfileMethod = 'Windows 11 26H2 GA x64 Home/Pro; build family 26300, UBR >= 9711; exactly 4 physical CPU cores; installed RAM >= 8 GiB and < 9 GiB; CPU only'
}
if ($Profile -eq 'hyperv-v11') {
    $hostCpuModel = (($processors | Select-Object -ExpandProperty Name -ErrorAction SilentlyContinue | Where-Object { $_ }) -join '; ')
    if (-not $hostCpuModel) { $hostCpuModel = 'not-obtainable' }
    $hostRecord['measuredOn'] = 'hyperv-vm'
    $hostRecord['profile'] = 'hyperv-v11'
    $hostRecord['guestModel'] = $guestModel
    $hostRecord['logicalProcessorCount'] = $logicalProcessorCount
    $hostRecord['cpuCountKind'] = 'logical-processors'
    $hostRecord['hostCpuModel'] = $hostCpuModel
    $hostRecord['hostCpuModelSource'] = 'Win32_Processor.Name as exposed to the guest'
    $hostRecord['gpuPassthroughObserved'] = [bool]($gpuPassthroughNames.Count -gt 0)
    $hostRecord['videoControllers'] = @($videoControllers | ForEach-Object { [string]$_.Name })
    $hostRecord['hardwareProfileMethod'] = 'Windows 11 x64 Home/Pro; Hyper-V guest model Virtual Machine; exactly 4 logical processors; installed RAM >= 8 GiB and < 9 GiB; CPU only'
    foreach ($field in @('minimumBaselineKB', 'minimumBaselineUpdateDate', 'minimumBaselineKBInstalled', 'baselineProfileReviewedOn', 'baselineProfileReviewCurrent', 'baselineSources')) {
        $hostRecord.Remove($field)
    }
}

$hostFile = Join-Path $evidenceRoot "$runId-host.json"
$evidenceFile = Join-Path $evidenceRoot "$runId-timing.jsonl"
$cacheDirectory = Join-Path $evidenceRoot "$runId-genesis-cache"
[System.IO.File]::WriteAllText($hostFile, ($hostRecord | ConvertTo-Json -Depth 4))

if (-not $profileValid) {
    if ($Profile -eq 'hyperv-v11') {
        throw "NOT_RUN: hyperv-v11 requires Windows 11 x64 Home/Pro inside a Hyper-V guest (Win32_ComputerSystem.Model='Virtual Machine'), exactly 4 logical processors, 8 GiB to under 9 GiB RAM, and no GPU passthrough. Observed edition=$edition ($editionId), model='$guestModel', architecture=$architecture, logical processors=$logicalProcessorCount, RAM=$([math]::Round($memoryBytes / 1GB, 2)) GiB, GPU passthrough candidates=$($gpuPassthroughNames -join '; ')."
    }
    throw "NOT_RUN: W0-F timing evidence requires the reviewed Windows 11 26H2 GA x64 Home/Pro profile, build family 26300 with UBR >= 9711, a current update dated on/after 2026-10-13, exactly 4 physical CPU cores, and 8 to under 9 GiB RAM. The profile was last reviewed 2026-10-20 and must be re-reviewed/versioned if Microsoft has published updates since then. Observed edition=$edition ($editionId), build=$fullBuild, channel=General Availability Channel, $architecture, $coreCount cores, $([math]::Round($memoryBytes / 1GB, 2)) GiB."
}

$manifest = Join-Path $PSScriptRoot '..\..\src-tauri\Cargo.toml'
cargo run --manifest-path $manifest --release --features smart-medley-benchmark --bin smart-medley-benchmark -- `
    --input $InputFile `
    --sha256 $Sha256 `
    --cache-dir $cacheDirectory `
    --evidence $evidenceFile `
    --host-json $hostFile `
    --evidence-root $evidenceRoot
if ($LASTEXITCODE -ne 0) {
    throw "Smart Medley timing harness failed with exit code $LASTEXITCODE. Preserve any JSONL records already written."
}
Write-Output "Timing records: $evidenceFile"
Write-Output "Host metadata: $hostFile"
Write-Output 'Fixture accuracy, process-tree memory, 900-second WASAPI dropout, and native listening remain NOT_RUN.'
