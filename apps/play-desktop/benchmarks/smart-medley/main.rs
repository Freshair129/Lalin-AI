#![recursion_limit = "256"]

// @req PLAY-27 — Record sequential local Smart Medley cold/cache timing trials.

use lalin_play_lib::smart_medley::{
    analyze_pinned_media_cached, clear_pinned_cache, load_pinned_cache, persistent_cache_key,
    AnalysisCacheState, SmartMedleyAnalysis, ANALYZER_VERSION,
};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    env,
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    path::{Path, PathBuf},
    time::{Instant, SystemTime, UNIX_EPOCH},
};

const EVIDENCE_ROOT: &str = r"E:\lalin-cr008-evidence\w2-c";
const COLD_SAMPLES: usize = 30;
const CACHED_SAMPLES: usize = 100;
const MAX_COLD_MS: f64 = 15_000.0;
const MAX_CACHED_MS: f64 = 100.0;

struct Args {
    input: PathBuf,
    expected_hash: String,
    cache_dir: PathBuf,
    evidence_file: PathBuf,
    host_file: PathBuf,
}

fn main() {
    if let Err(error) = run() {
        eprintln!("Smart Medley benchmark did not run: {error}");
        std::process::exit(2);
    }
}

fn run() -> Result<(), String> {
    let args = parse_args()?;
    let evidence_root =
        fs::canonicalize(EVIDENCE_ROOT).map_err(|_| "evidence root is unavailable")?;
    let input = fs::canonicalize(&args.input).map_err(|_| "pinned local input is unavailable")?;
    let cache_dir = args
        .cache_dir
        .canonicalize()
        .or_else(|_| {
            fs::create_dir_all(&args.cache_dir)?;
            fs::canonicalize(&args.cache_dir)
        })
        .map_err(|_| "benchmark cache directory is unavailable")?;
    let evidence_parent = args
        .evidence_file
        .parent()
        .ok_or("evidence output needs a parent directory")?;
    let evidence_parent = fs::canonicalize(evidence_parent)
        .map_err(|_| "evidence output directory is unavailable")?;
    if !cache_dir.starts_with(&evidence_root) || !evidence_parent.starts_with(&evidence_root) {
        return Err(
            "benchmark cache and evidence output must stay under the approved local evidence root"
                .into(),
        );
    }
    if !input.is_file()
        || !args
            .expected_hash
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit())
        || args.expected_hash.len() != 64
    {
        return Err("input must be a local file with a pinned SHA-256".into());
    }
    let input_hash = hash_file(&input)?;
    if input_hash != args.expected_hash.to_ascii_lowercase() {
        return Err("input SHA-256 does not match the supplied pin".into());
    }
    let wav = inspect_pinned_wav(&input)?;
    if wav.sample_rate_hz != 44_100
        || wav.channels != 2
        || wav.bits_per_sample != 16
        || wav.duration_seconds != 180.0
    {
        return Err("W0-F timing workload must be 180 seconds, 44.1-kHz, stereo, PCM16 WAV".into());
    }
    let host: Value = serde_json::from_slice(
        &fs::read(&args.host_file).map_err(|_| "host profile record is unavailable")?,
    )
    .map_err(|_| "host profile record is invalid")?;
    if !host_matches_profile(&host) {
        return Err("only the accepted Windows 11 26H2 GA x64 Home/Pro build-family 26300 / 4-physical-core / 8-to-under-9-GiB CPU-only profile may run this timing harness".into());
    }
    let cache_key = persistent_cache_key(&input_hash)?;

    let mut output = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&args.evidence_file)
        .map_err(|_| "evidence output already exists or is not writable")?;
    let run_id = format!("w2c-{}", unix_millis());
    let executable_sha256 =
        hash_file(&env::current_exe().map_err(|_| "benchmark executable path is unavailable")?)?;
    let shared = json!({
        "protocolVersion": "W0-DEF-v0.6.9",
        "runId": run_id,
        "analyzerVersion": ANALYZER_VERSION,
        "analyzerBuildSha256": executable_sha256,
        "executableSha256": executable_sha256,
        "inputSha256": input_hash,
        "inputCodec": "pcm-s16le",
        "inputSampleRateHz": wav.sample_rate_hz,
        "inputChannels": wav.channels,
        "inputDurationSeconds": wav.duration_seconds,
        "host": host,
        "dropoutSignalSha256": "not_applicable",
        "fixtureManifestSha256": "not_applicable",
        "labelManifestSha256": "not_applicable",
        "captureSha256": "not_applicable",
        "randomizationSeed": "not_applicable",
        "transitionId": "not_applicable",
        "order": "not_applicable",
        "cacheKey": cache_key,
        "osFileCacheCondition": "uncontrolled-not-flushed",
        "invalidationReason": "not_applicable",
        "persistentReadPath": "not_applicable",
        "bpmEstimate": "not_applicable",
        "bpmConfidence": "not_applicable",
        "keyEstimate": "not_applicable",
        "keyConfidence": "not_applicable",
        "cueInSeconds": "not_applicable",
        "cueOutSeconds": "not_applicable",
        "cueConfidence": "not_applicable",
        "tempoCompatibility": "not_applicable",
        "keyCompatibility": "not_applicable",
        "cuePhaseCompatibility": "not_applicable",
        "confidenceFloor": "not_applicable",
        "compatibilityScore": "not_applicable",
        "eligible": "not_applicable",
        "expectedEligibility": "not_applicable",
        "expectedStratum": "not_applicable",
        "fallbackReason": "not_applicable",
        "memoryBaselineBytes": "not_applicable",
        "memoryWorkloadPeakBytes": "not_applicable",
        "memoryIncrementBytes": "not_applicable",
        "samplerStartMonotonicNs": "not_applicable",
        "samplerStopMonotonicNs": "not_applicable",
        "lastScheduledSampleMonotonicNs": "not_applicable",
        "memorySamples": "not_applicable",
        "signalLoopCount": "not_applicable",
        "signalLoopBoundaryMonotonicNs": "not_applicable",
        "processPidParentSet": "not_applicable",
        "outputEndpoint": "not_applicable",
        "outputFormat": "not_applicable",
        "wasapiCaptureFormat": "not_applicable",
        "alignerVersion": "not_applicable",
        "alignerBuildSha256": "not_applicable",
        "anchorOffsets": "not_applicable",
        "anchorCorrelations": "not_applicable",
        "driftFit": "not_applicable",
        "controlCaptureSha256": "not_applicable",
        "concurrentCaptureSha256": "not_applicable",
        "referenceRmsByChannel": "not_applicable",
        "outputRmsByChannel": "not_applicable",
        "underrunCounters": "not_applicable",
        "dropoutEvents": "not_applicable",
        "rawAnnotationValues": "not_applicable",
        "consolidatedAnnotationValues": "not_applicable",
        "bpmDeltas": "not_applicable",
        "bpmConsensus": "not_applicable",
        "roundingMethod": "not_applicable",
        "cueIntervals": "not_applicable",
        "cueIntersections": "not_applicable",
        "adjudicationReason": "not_applicable",
        "adjudicationResult": "not_applicable",
        "referenceQ": "not_applicable",
        "listenerIds": "not_applicable",
        "listenerRatings": "not_applicable",
        "artifactFlags": "not_applicable",
        "listenerNotes": "not_applicable",
        "fixtureStatus": "NOT_RUN",
        "listeningStatus": "NOT_RUN",
        "memoryStatus": "NOT_RUN: timing harness does not sample the app process tree",
        "dropoutStatus": "NOT_RUN: timing harness does not capture WASAPI loopback or underrun counters"
    });

    let monotonic_epoch = Instant::now();
    let mut cold_ms = Vec::with_capacity(COLD_SAMPLES);
    let mut cold_failures = 0usize;
    for sequence in 1..=COLD_SAMPLES {
        let clear_ok = clear_pinned_cache(&cache_dir, &input_hash).is_ok();
        let monotonic_start_ns = monotonic_ns(&monotonic_epoch);
        let result = if clear_ok {
            analyze_pinned_media_cached(&cache_dir, &input, &input_hash)
        } else {
            Err("cache-clear-failed".into())
        };
        let (status, error, result_hash, analysis) = match result {
            Ok(analysis)
                if analysis.cache_state == AnalysisCacheState::Stored
                    && analysis.analysis_version == ANALYZER_VERSION
                    && analysis.media_sha256.as_deref() == Some(input_hash.as_str()) =>
            {
                (
                    "PASS",
                    json!("none"),
                    Some(hash_serialized(&analysis)?),
                    Some(analysis),
                )
            }
            Ok(_) => (
                "FAIL",
                json!("analysis-result-or-durable-cache-validation-failed"),
                None,
                None,
            ),
            Err(_) => (
                "FAIL",
                json!("native-analysis-or-cache-write-failed"),
                None,
                None,
            ),
        };
        let monotonic_end_ns = monotonic_ns(&monotonic_epoch);
        let elapsed_ms = nanos_to_millis(monotonic_end_ns.saturating_sub(monotonic_start_ns));
        if status != "PASS" {
            cold_failures += 1;
        }
        cold_ms.push(elapsed_ms);
        write_record(
            &mut output,
            &shared,
            json!({
                "testKind": "cold-analysis",
                "trialId": format!("cold-{sequence:03}"),
                "sequence": sequence,
                "order": sequence,
                "status": status,
                "cacheState": if clear_ok { "miss-then-analysis" } else { "clear-failed" },
                "invalidationReason": if clear_ok { "explicit-derived-cache-clear-before-cold-slot" } else { "cache-clear-failed" },
                "persistentReadPath": "not_applicable",
                "monotonicStartNs": monotonic_start_ns,
                "monotonicEndNs": monotonic_end_ns,
                "elapsedMs": elapsed_ms,
                "error": error,
                "persistedResultSha256": result_hash.as_deref().unwrap_or("not_applicable"),
                "analysisEvidence": analysis_evidence(analysis.as_ref())
            }),
        )?;
    }

    let mut cached_ms = Vec::with_capacity(CACHED_SAMPLES);
    let mut cached_failures = 0usize;
    for sequence in 1..=CACHED_SAMPLES {
        let monotonic_start_ns = monotonic_ns(&monotonic_epoch);
        let result = load_pinned_cache(&cache_dir, &input, &input_hash);
        let (status, error, result_hash, analysis) = match result {
            Ok(Some(analysis))
                if analysis.cache_state == AnalysisCacheState::Hit
                    && analysis.analysis_version == ANALYZER_VERSION
                    && analysis.media_sha256.as_deref() == Some(input_hash.as_str()) =>
            {
                (
                    "PASS",
                    json!("none"),
                    Some(hash_serialized(&analysis)?),
                    Some(analysis),
                )
            }
            Ok(None) => (
                "FAIL",
                json!("persistent-cache-miss-or-validation-failed"),
                None,
                None,
            ),
            Err(_) => ("FAIL", json!("persistent-cache-read-failed"), None, None),
            Ok(Some(_)) => (
                "FAIL",
                json!("persistent-cache-result-mismatch"),
                None,
                None,
            ),
        };
        let monotonic_end_ns = monotonic_ns(&monotonic_epoch);
        let elapsed_ms = nanos_to_millis(monotonic_end_ns.saturating_sub(monotonic_start_ns));
        if status != "PASS" {
            cached_failures += 1;
        }
        cached_ms.push(elapsed_ms);
        write_record(
            &mut output,
            &shared,
            json!({
                "testKind": "cached-lookup",
                "trialId": format!("cached-{sequence:03}"),
                "sequence": sequence,
                "order": COLD_SAMPLES + sequence,
                "status": status,
                "cacheState": if status == "PASS" { "persistent-hit-no-decode" } else { "miss-or-invalid" },
                "invalidationReason": "not_applicable",
                "persistentReadPath": "GenesisBlockDB:lalin_play.settings",
                "monotonicStartNs": monotonic_start_ns,
                "monotonicEndNs": monotonic_end_ns,
                "elapsedMs": elapsed_ms,
                "error": error,
                "persistedResultSha256": result_hash.as_deref().unwrap_or("not_applicable"),
                "analysisEvidence": analysis_evidence(analysis.as_ref())
            }),
        )?;
    }

    let cold_p95 = nearest_rank_p95(&cold_ms);
    let cached_p95 = nearest_rank_p95(&cached_ms);
    let cold_status = if cold_failures == 0 && cold_p95 <= MAX_COLD_MS {
        "PASS"
    } else {
        "FAIL"
    };
    let cached_status = if cached_failures == 0 && cached_p95 <= MAX_CACHED_MS {
        "PASS"
    } else {
        "FAIL"
    };
    let summary_start_ns = monotonic_ns(&monotonic_epoch);
    let summary_end_ns = monotonic_ns(&monotonic_epoch);
    let summary_elapsed_ms = nanos_to_millis(summary_end_ns.saturating_sub(summary_start_ns));
    write_record(
        &mut output,
        &shared,
        json!({
            "testKind": "timing-summary",
            "trialId": "timing-summary",
            "sequence": "not_applicable",
            "order": "not_applicable",
            "status": if cold_status == "PASS" && cached_status == "PASS" { "PASS" } else { "FAIL" },
            "cacheState": "not_applicable",
            "invalidationReason": "not_applicable",
            "persistentReadPath": "not_applicable",
            "monotonicStartNs": summary_start_ns,
            "monotonicEndNs": summary_end_ns,
            "elapsedMs": summary_elapsed_ms,
            "error": "not_applicable",
            "persistedResultSha256": "not_applicable",
            "analysisEvidence": "not_applicable",
            "coldSampleCount": cold_ms.len(),
            "coldFailures": cold_failures,
            "coldP95RankOneBased": ((95 * cold_ms.len() + 99) / 100).max(1),
            "coldP95Ms": cold_p95,
            "coldMedianMs": median(&cold_ms),
            "coldMaximumMs": maximum(&cold_ms),
            "coldTargetMs": MAX_COLD_MS,
            "coldStatus": cold_status,
            "cachedSampleCount": cached_ms.len(),
            "cachedFailures": cached_failures,
            "cachedP95RankOneBased": ((95 * cached_ms.len() + 99) / 100).max(1),
            "cachedP95Ms": cached_p95,
            "cachedMedianMs": median(&cached_ms),
            "cachedMaximumMs": maximum(&cached_ms),
            "cachedTargetMs": MAX_CACHED_MS,
            "cachedStatus": cached_status,
            "fullW0FAcceptance": "NOT_RUN: fixture accuracy, process-tree memory, 900-second WASAPI dropout and native listening evidence are separate gates"
        }),
    )?;
    output
        .flush()
        .map_err(|_| "cannot flush local JSONL evidence")?;
    Ok(())
}

fn parse_args() -> Result<Args, String> {
    let mut values = env::args().skip(1);
    let mut map = std::collections::HashMap::new();
    while let Some(name) = values.next() {
        let value = values.next().ok_or("every option requires a value")?;
        map.insert(name, value);
    }
    let take = |name: &str| {
        map.get(name)
            .cloned()
            .ok_or_else(|| format!("missing {name}"))
    };
    Ok(Args {
        input: take("--input")?.into(),
        expected_hash: take("--sha256")?.to_ascii_lowercase(),
        cache_dir: take("--cache-dir")?.into(),
        evidence_file: take("--evidence")?.into(),
        host_file: take("--host-json")?.into(),
    })
}

fn host_matches_profile(host: &Value) -> bool {
    let edition = host.get("edition").and_then(Value::as_str);
    let edition_id = host.get("editionId").and_then(Value::as_str);
    let build = host.get("build").and_then(Value::as_str);
    let Some((build_family, build_ubr)) = build.and_then(|value| value.split_once('.')) else {
        return false;
    };
    let parsed_build_family = build_family.parse::<u64>().ok();
    let parsed_build_ubr = build_ubr.parse::<u64>().ok();
    let memory_bytes = host.get("installedMemoryBytes").and_then(Value::as_u64);
    host.get("acceptedProfile").and_then(Value::as_bool) == Some(true)
        && host
            .get("osCaption")
            .and_then(Value::as_str)
            .is_some_and(|caption| caption.to_ascii_lowercase().contains("windows 11"))
        && matches!(
            (edition, edition_id),
            (Some("Home"), Some("Core")) | (Some("Pro"), Some("Professional"))
        )
        && host.get("displayVersion").and_then(Value::as_str) == Some("26H2")
        && host.get("servicingChannel").and_then(Value::as_str)
            == Some("General Availability Channel")
        && parsed_build_family == Some(26_300)
        && host.get("buildFamily").and_then(Value::as_u64) == Some(26_300)
        && parsed_build_ubr.is_some_and(|ubr| ubr >= 9_711)
        && host.get("ubr").and_then(Value::as_u64) == parsed_build_ubr
        && host.get("architecture").and_then(Value::as_str) == Some("AMD64")
        && host.get("cpuCoreCount").and_then(Value::as_u64) == Some(4)
        && memory_bytes.is_some_and(|bytes| (8_589_934_592..9_663_676_416).contains(&bytes))
        && host.get("minimumBaselineKB").and_then(Value::as_str) == Some("KB5127648")
        && host
            .get("minimumBaselineUpdateDate")
            .and_then(Value::as_str)
            == Some("2026-10-13")
        && host
            .get("baselineProfileReviewedOn")
            .and_then(Value::as_str)
            == Some("2026-10-20")
        && host
            .get("baselineProfileReviewCurrent")
            .and_then(Value::as_bool)
            == Some(true)
        && host
            .get("latestInstalledUpdateUtc")
            .and_then(Value::as_str)
            .is_some_and(|value| !value.is_empty())
        && host
            .get("installedKBs")
            .and_then(Value::as_array)
            .is_some_and(|values| !values.is_empty())
}

struct WavMetadata {
    sample_rate_hz: u32,
    channels: u16,
    bits_per_sample: u16,
    duration_seconds: f64,
}

fn inspect_pinned_wav(path: &Path) -> Result<WavMetadata, String> {
    let mut file = File::open(path).map_err(|_| "pinned WAV is unreadable")?;
    let mut header = [0u8; 44];
    file.read_exact(&mut header)
        .map_err(|_| "pinned WAV header is incomplete")?;
    if &header[0..4] != b"RIFF"
        || &header[8..12] != b"WAVE"
        || &header[12..16] != b"fmt "
        || &header[36..40] != b"data"
    {
        return Err(
            "pinned timing input must use the canonical 44-byte RIFF/WAVE PCM header".into(),
        );
    }
    let format = u16::from_le_bytes([header[20], header[21]]);
    let channels = u16::from_le_bytes([header[22], header[23]]);
    let sample_rate_hz = u32::from_le_bytes(header[24..28].try_into().unwrap());
    let bits_per_sample = u16::from_le_bytes([header[34], header[35]]);
    let declared_data = u32::from_le_bytes(header[40..44].try_into().unwrap()) as u64;
    let actual_data = file
        .metadata()
        .map_err(|_| "pinned WAV metadata is unavailable")?
        .len()
        .saturating_sub(44);
    if format != 1 || declared_data != actual_data {
        return Err("pinned timing input must be complete uncompressed PCM".into());
    }
    let bytes_per_second = sample_rate_hz as u64 * channels as u64 * (bits_per_sample as u64 / 8);
    if bytes_per_second == 0 || declared_data % bytes_per_second != 0 {
        return Err("pinned WAV has an invalid sample count".into());
    }
    Ok(WavMetadata {
        sample_rate_hz,
        channels,
        bits_per_sample,
        duration_seconds: (declared_data / bytes_per_second) as f64,
    })
}

fn hash_file(path: &Path) -> Result<String, String> {
    let mut file = File::open(path).map_err(|_| "local file cannot be opened")?;
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 1024 * 1024];
    loop {
        let count = file
            .read(&mut buffer)
            .map_err(|_| "local file cannot be read")?;
        if count == 0 {
            break;
        }
        hasher.update(&buffer[..count]);
    }
    Ok(hex(&hasher.finalize()))
}

fn hash_serialized(value: &impl serde::Serialize) -> Result<String, String> {
    let bytes = serde_json::to_vec(value).map_err(|_| "analysis result cannot be serialized")?;
    Ok(hex(&Sha256::digest(bytes)))
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn write_record(output: &mut File, shared: &Value, row: Value) -> Result<(), String> {
    let mut merged = shared
        .as_object()
        .cloned()
        .ok_or("shared record is invalid")?;
    let row = row.as_object().ok_or("trial record is invalid")?;
    merged.extend(row.iter().map(|(key, value)| (key.clone(), value.clone())));
    if let Some(Value::Object(analysis_fields)) = merged.remove("analysisEvidence") {
        merged.extend(analysis_fields);
    } else {
        merged.remove("analysisEvidence");
    }
    let now = SystemTime::now();
    merged.insert("timestampUnixMillis".into(), json!(unix_millis()));
    merged.insert("timestampUtc".into(), json!(format_utc(now)));
    serde_json::to_writer(&mut *output, &Value::Object(merged))
        .map_err(|_| "cannot serialize local JSONL evidence")?;
    output
        .write_all(b"\n")
        .map_err(|_| "cannot append local JSONL evidence")?;
    output
        .flush()
        .map_err(|_| "cannot flush local JSONL evidence".to_string())
}

fn monotonic_ns(epoch: &Instant) -> u64 {
    epoch.elapsed().as_nanos().min(u128::from(u64::MAX)) as u64
}

fn nanos_to_millis(nanos: u64) -> f64 {
    ((nanos as f64 / 1_000_000.0) * 1_000.0).round() / 1_000.0
}

fn median(samples: &[f64]) -> f64 {
    if samples.is_empty() {
        return f64::NAN;
    }
    let mut sorted = samples.to_vec();
    sorted.sort_by(f64::total_cmp);
    let middle = sorted.len() / 2;
    if sorted.len() % 2 == 0 {
        (sorted[middle - 1] + sorted[middle]) / 2.0
    } else {
        sorted[middle]
    }
}

fn maximum(samples: &[f64]) -> f64 {
    samples.iter().copied().reduce(f64::max).unwrap_or(f64::NAN)
}

fn analysis_evidence(analysis: Option<&SmartMedleyAnalysis>) -> Value {
    let not_applicable = || json!("not_applicable");
    let number = |value: Option<f64>| value.map(Value::from).unwrap_or_else(not_applicable);
    match analysis {
        Some(analysis) => json!({
            "bpmEstimate": number(analysis.bpm),
            "bpmConfidence": analysis.bpm_confidence,
            "keyEstimate": analysis.key.as_ref().map(|key| json!({"tonicSemitone": key.tonic_semitone, "mode": key.mode})).unwrap_or_else(not_applicable),
            "keyConfidence": analysis.key_confidence,
            "cueInSeconds": number(analysis.cue_in_seconds),
            "cueOutSeconds": number(analysis.cue_out_seconds),
            "cueConfidence": analysis.cue_confidence,
            "fallbackReason": analysis.fallback_reason.as_deref().unwrap_or("none"),
            "analysisAvailability": analysis.availability,
            "tempoCompatibility": "not_applicable",
            "keyCompatibility": "not_applicable",
            "cuePhaseCompatibility": "not_applicable",
            "confidenceFloor": "not_applicable",
            "compatibilityScore": "not_applicable",
            "eligible": "not_applicable",
            "expectedEligibility": "not_applicable",
            "expectedStratum": "not_applicable"
        }),
        None => json!({
            "bpmEstimate": not_applicable(),
            "bpmConfidence": not_applicable(),
            "keyEstimate": not_applicable(),
            "keyConfidence": not_applicable(),
            "cueInSeconds": not_applicable(),
            "cueOutSeconds": not_applicable(),
            "cueConfidence": not_applicable(),
            "fallbackReason": "not_applicable",
            "analysisAvailability": "not_applicable",
            "tempoCompatibility": "not_applicable",
            "keyCompatibility": "not_applicable",
            "cuePhaseCompatibility": "not_applicable",
            "confidenceFloor": "not_applicable",
            "compatibilityScore": "not_applicable",
            "eligible": "not_applicable",
            "expectedEligibility": "not_applicable",
            "expectedStratum": "not_applicable"
        }),
    }
}

fn format_utc(time: SystemTime) -> String {
    let milliseconds = time
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let total_seconds = (milliseconds / 1_000) as i64;
    let days = total_seconds.div_euclid(86_400);
    let seconds_of_day = total_seconds.rem_euclid(86_400);
    let (year, month, day) = civil_from_days(days);
    let hour = seconds_of_day / 3_600;
    let minute = (seconds_of_day % 3_600) / 60;
    let second = seconds_of_day % 60;
    let millis = milliseconds % 1_000;
    format!("{year:04}-{month:02}-{day:02}T{hour:02}:{minute:02}:{second:02}.{millis:03}Z")
}

fn civil_from_days(days_since_epoch: i64) -> (i64, i64, i64) {
    let z = days_since_epoch + 719_468;
    let era = z.div_euclid(146_097);
    let day_of_era = z - era * 146_097;
    let year_of_era =
        (day_of_era - day_of_era / 1_460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
    let mut year = year_of_era + era * 400;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let month_prime = (5 * day_of_year + 2) / 153;
    let day = day_of_year - (153 * month_prime + 2) / 5 + 1;
    let month = month_prime + if month_prime < 10 { 3 } else { -9 };
    year += if month <= 2 { 1 } else { 0 };
    (year, month, day)
}

fn nearest_rank_p95(samples: &[f64]) -> f64 {
    if samples.is_empty() {
        return f64::NAN;
    }
    let mut sorted = samples.to_vec();
    sorted.sort_by(f64::total_cmp);
    let rank = ((95 * sorted.len() + 99) / 100).max(1);
    sorted[rank - 1]
}

fn unix_millis() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
}
