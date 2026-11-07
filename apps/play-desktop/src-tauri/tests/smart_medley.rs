use lalin_play_lib::smart_medley::{
    analyze_pinned_media, analyze_pinned_media_cached, clear_pinned_cache, load_pinned_cache,
    AnalysisAvailability, AnalysisCacheState, ANALYZER_VERSION,
};
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::{fs, io::Write, path::Path};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct FixtureManifest {
    schema_version: String,
    cases: Vec<SyntheticCase>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SyntheticCase {
    id: String,
    sample_rate_hz: u32,
    channels: u16,
    duration_seconds: u32,
    silence_lead_seconds: u32,
    silence_tail_seconds: u32,
    pulse_bpm: f64,
    pulse_width_seconds: f64,
    chord_hz: Vec<f64>,
    amplitude_per_tone: f64,
}

#[test]
fn generated_fixture_analysis_is_deterministic_and_hash_pinned() {
    let manifest: FixtureManifest =
        serde_json::from_str(include_str!("fixtures/smart-medley/cases.json")).unwrap();
    assert_eq!(
        manifest.schema_version,
        "smart-medley-synthetic-fixtures/v1"
    );
    let case = manifest
        .cases
        .into_iter()
        .find(|case| case.id == "gated-c-major-pulse-120")
        .unwrap();
    let directory = tempfile::tempdir().unwrap();
    let file = directory.path().join("synthetic.wav");
    write_synthetic_wav(&file, &case);
    let hash = sha256_file(&file);

    let first = analyze_pinned_media(&file, &hash).unwrap();
    let second = analyze_pinned_media(&file, &hash).unwrap();
    assert_eq!(first.analysis_version, ANALYZER_VERSION);
    assert_eq!(first.media_sha256.as_deref(), Some(hash.as_str()));
    assert_eq!(first, second);
    assert_eq!(
        serde_json::to_vec(&first).unwrap(),
        serde_json::to_vec(&second).unwrap()
    );
    assert_eq!(first.duration_seconds, Some(case.duration_seconds as f64));
}

#[test]
fn changed_content_fails_closed_as_stale() {
    let directory = tempfile::tempdir().unwrap();
    let file = directory.path().join("stale.wav");
    fs::write(&file, b"not the pinned audio object").unwrap();
    let stale_hash = "a".repeat(64);

    let result = analyze_pinned_media(&file, &stale_hash).unwrap();
    assert_eq!(result.availability, AnalysisAvailability::LowConfidence);
    assert_eq!(
        result.fallback_reason.as_deref(),
        Some("stale-content-hash")
    );
    assert!(result.bpm.is_none());
    assert!(result.key.is_none());
}

#[test]
fn genesis_cache_round_trips_by_hash_and_version_and_can_be_cleared() {
    let manifest: FixtureManifest =
        serde_json::from_str(include_str!("fixtures/smart-medley/cases.json")).unwrap();
    let case = manifest
        .cases
        .into_iter()
        .find(|case| case.id == "gated-c-major-pulse-120")
        .unwrap();
    let directory = tempfile::tempdir().unwrap();
    let file = directory.path().join("cached-synthetic.wav");
    write_synthetic_wav(&file, &case);
    let hash = sha256_file(&file);

    let stored = analyze_pinned_media_cached(directory.path(), &file, &hash).unwrap();
    assert_eq!(stored.cache_state, AnalysisCacheState::Stored);
    let loaded = load_pinned_cache(directory.path(), &file, &hash)
        .unwrap()
        .expect("persistent Genesis cache hit");
    assert_eq!(loaded.cache_state, AnalysisCacheState::Hit);
    assert_eq!(
        serde_json::to_vec(&stored).unwrap(),
        serde_json::to_vec(&loaded).unwrap()
    );

    let repeated = analyze_pinned_media_cached(directory.path(), &file, &hash).unwrap();
    assert_eq!(repeated.cache_state, AnalysisCacheState::Hit);
    assert_eq!(
        serde_json::to_vec(&stored).unwrap(),
        serde_json::to_vec(&repeated).unwrap()
    );

    clear_pinned_cache(directory.path(), &hash).unwrap();
    assert!(load_pinned_cache(directory.path(), &file, &hash)
        .unwrap()
        .is_none());

    // A clear removes only the derived analysis row; the registered schema must
    // still accept a new save and subsequent persistent read.
    let stored_again = analyze_pinned_media_cached(directory.path(), &file, &hash).unwrap();
    assert_eq!(stored_again.cache_state, AnalysisCacheState::Stored);
    assert_eq!(
        load_pinned_cache(directory.path(), &file, &hash)
            .unwrap()
            .unwrap()
            .cache_state,
        AnalysisCacheState::Hit
    );
}

fn write_synthetic_wav(path: &Path, case: &SyntheticCase) {
    let sample_count = case.sample_rate_hz as usize * case.duration_seconds as usize;
    let data_bytes = (sample_count * case.channels as usize * 2) as u32;
    let mut file = fs::File::create(path).unwrap();
    file.write_all(b"RIFF").unwrap();
    file.write_all(&(36 + data_bytes).to_le_bytes()).unwrap();
    file.write_all(b"WAVEfmt ").unwrap();
    file.write_all(&16u32.to_le_bytes()).unwrap();
    file.write_all(&1u16.to_le_bytes()).unwrap();
    file.write_all(&case.channels.to_le_bytes()).unwrap();
    file.write_all(&case.sample_rate_hz.to_le_bytes()).unwrap();
    let byte_rate = case.sample_rate_hz * case.channels as u32 * 2;
    file.write_all(&byte_rate.to_le_bytes()).unwrap();
    file.write_all(&(case.channels * 2).to_le_bytes()).unwrap();
    file.write_all(&16u16.to_le_bytes()).unwrap();
    file.write_all(b"data").unwrap();
    file.write_all(&data_bytes.to_le_bytes()).unwrap();

    for frame in 0..sample_count {
        let time = frame as f64 / case.sample_rate_hz as f64;
        let active_start = case.silence_lead_seconds as f64;
        let active_end = case.duration_seconds as f64 - case.silence_tail_seconds as f64;
        let pulse_position = (time - active_start).rem_euclid(60.0 / case.pulse_bpm);
        let active =
            time >= active_start && time < active_end && pulse_position < case.pulse_width_seconds;
        let sample = if active {
            case.chord_hz
                .iter()
                .map(|frequency| {
                    (std::f64::consts::TAU * frequency * time).sin() * case.amplitude_per_tone
                })
                .sum::<f64>()
        } else {
            0.0
        };
        let pcm = (sample.clamp(-1.0, 1.0) * i16::MAX as f64).round() as i16;
        for _ in 0..case.channels {
            file.write_all(&pcm.to_le_bytes()).unwrap();
        }
    }
}

fn sha256_file(path: &Path) -> String {
    let bytes = fs::read(path).unwrap();
    Sha256::digest(bytes)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}
