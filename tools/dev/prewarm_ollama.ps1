# prewarm_ollama.ps1 — อุ่นโมเดล local ก่อน batch dispatch (SPEC--LOCAL-LLM-DISPATCH-V2 FR-5)
# วัดจริง: cold ~90-190s vs warm ~6-20s — อุ่นครั้งเดียวก่อน batch ประหยัดทุก dispatch ถัดไป
#
# ใช้:  powershell -File scripts\prewarm_ollama.ps1                    # อุ่น qwen3:latest
#       powershell -File scripts\prewarm_ollama.ps1 -Model sushirl:latest
#       powershell -File scripts\prewarm_ollama.ps1 -Unload            # เขี่ยทุกโมเดลออกก่อนงาน ML หนัก (Demucs/whisper)
#
# กับดักที่วัดพบจริง: pre-warm ต้องใช้ num_ctx เดียวกับ dispatch จริง (8192) —
# ถ้า num_ctx ต่างกัน Ollama จะ reload โมเดลใหม่ ทำให้การอุ่นเสียเปล่า

param(
    [string]$Model = "qwen3:latest",
    [switch]$Unload
)

$ErrorActionPreference = "Stop"
$base = "http://localhost:11434"

if ($Unload) {
    # เขี่ยโมเดลที่ resident อยู่ทั้งหมด (คืน VRAM ให้ Demucs/whisper)
    $ps = Invoke-RestMethod -Uri "$base/api/ps" -Method Get
    if (-not $ps.models -or $ps.models.Count -eq 0) {
        Write-Host "[prewarm] no models resident - VRAM already free"
        exit 0
    }
    foreach ($m in $ps.models) {
        $name = $m.name
        Write-Host "[prewarm] unloading $name ..."
        $body = @{ model = $name; prompt = ""; keep_alive = 0 } | ConvertTo-Json
        # embedding model (เช่น bge-m3 ตระกูล bert) ไม่รับ /api/generate — ต้องใช้ /api/embeddings
        if ($m.details.family -match "bert") {
            Invoke-RestMethod -Uri "$base/api/embeddings" -Method Post -Body $body -ContentType "application/json" | Out-Null
        } else {
            Invoke-RestMethod -Uri "$base/api/generate" -Method Post -Body $body -ContentType "application/json" | Out-Null
        }
    }
    Write-Host "[prewarm] done - VRAM freed"
    exit 0
}

Write-Host "[prewarm] warming $Model (num_ctx=8192, keep_alive=30m) ..."
$sw = [System.Diagnostics.Stopwatch]::StartNew()
$body = @{
    model      = $Model
    prompt     = "Reply with exactly: ok"
    stream     = $false
    keep_alive = "30m"
    options    = @{ temperature = 0; num_ctx = 8192; num_predict = 8 }   # num_ctx ต้องตรงกับ dispatch จริง
} | ConvertTo-Json -Depth 4
$resp = Invoke-RestMethod -Uri "$base/api/generate" -Method Post -Body $body -ContentType "application/json" -TimeoutSec 1200
$sw.Stop()

$loadS = [math]::Round($resp.load_duration / 1e9, 1)
$wallS = [math]::Round($sw.Elapsed.TotalSeconds, 1)
$ps = Invoke-RestMethod -Uri "$base/api/ps" -Method Get
$vram = ($ps.models | Where-Object { $_.name -eq $Model -or $_.model -eq $Model } | Select-Object -First 1).size_vram
$vramGb = if ($vram) { [math]::Round($vram / 1e9, 2) } else { "?" }

if ($loadS -lt 1) {
    Write-Host "[prewarm] $Model already warm (load=${loadS}s, wall=${wallS}s, vram=${vramGb}GB)"
} else {
    Write-Host "[prewarm] $Model loaded: cold load=${loadS}s, wall=${wallS}s, vram=${vramGb}GB - dispatches for the next 30m are warm"
}
