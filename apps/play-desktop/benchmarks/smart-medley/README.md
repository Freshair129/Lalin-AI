# Smart Medley timing harness

This source-only harness records the W0-F sequence of 30 sequential cold calls
followed by 100 persistent Genesis cache lookups. It accepts only a hash-pinned,
180-second, 44.1-kHz stereo PCM16 WAV and refuses to start unless the host passes
the dated minimum profile: Windows 11 26H2 General Availability x64 Home/Pro,
build family 26300 with UBR at least 9711, exactly 4 physical CPU cores, and at
least 8 GiB but less than 9 GiB installed RAM. The Windows profile baseline was
checked on 2026-10-20 against Microsoft's [Windows 11 26H2 release health page](https://learn.microsoft.com/en-us/windows/release-health/status-windows-11-26h2/)
and [KB5127648 release notes](https://support.microsoft.com/en-us/servicing/os/windows-11/2026/10/kb5127648-windows-11-24h2-25h2-26h2-security-update),
which set the minimum pinned build to 26300.9711. `run.ps1` records edition,
build, UBR, installed KBs and dates. It stops using this dated profile after
2026-10-20; before any later benchmark, recheck Microsoft's current release
information, update/version the profile, and obtain review if public updates have
advanced. Do not treat an older profile date as current-update evidence.
The harness writes local trial records under `E:\lalin-cr008-evidence\w2-c` and
does not include the input path or track metadata in JSONL.

Run from PowerShell only with rights-cleared, held-out evidence inputs:

```powershell
.\run.ps1 -InputFile <local-180s-wav> -Sha256 <64-character-sha256>
```

For the owner-approved v1.1 VM run, execute inside a Windows 11 x64 Home/Pro
Hyper-V guest with exactly 4 logical processors and 8 GiB to under 9 GiB RAM.
Set the VM to static memory with Dynamic Memory disabled and do not attach a
GPU. The script checks `Win32_ComputerSystem.Model = Virtual Machine`, guest OS,
edition, architecture, logical processor count and RAM; it records
`measuredOn: hyperv-vm` and the processor model exposed to the guest when
available. The guest cannot prove its Hyper-V memory mode, so configure that in
Hyper-V Manager before running. `-EvidenceRoot` changes the local output root;
its default remains `E:\lalin-cr008-evidence\w2-c`.

```powershell
.\run.ps1 -InputFile <local-180s-wav> -Sha256 <64-character-sha256> `
  -Profile hyperv-v11 -EvidenceRoot <local-evidence-directory>
```

The default `-Profile strict` retains the original dated 26H2 physical-host
checks. The `hyperv-v11` profile is additive and does not relax that default.

The harness includes native analysis, cache persistence/read, result validation
and monotonic elapsed timing. Every JSONL row uses the pinned W0-DEF v0.6.9
record shape. Fields outside timing evidence, including fixture/annotation,
pair decision, memory, WASAPI dropout/capture and listening evidence, are
explicitly written as `not_applicable`; the corresponding gates remain
`NOT_RUN`. It does not measure process-tree working set, run the 900-second
WASAPI dropout comparison, evaluate the 80-pair held-out fixture, or conduct
blind listening. A timing summary alone cannot close W0-F or W2-C.

Dependency pins used by the analyzer are Symphonia `0.6.1` (MPL-2.0) for local
audio demux/decode and RustFFT `6.4.1` (MIT OR Apache-2.0) for spectral analysis.
The feature set supports WAV, AIFF, FLAC, OGG/Vorbis, MP3, AAC and M4A. WMA,
Opus, video and other inputs return unsupported and fall back.
