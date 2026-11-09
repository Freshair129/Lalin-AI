// @req PLAY-27 — Analyze only local, hash-pinned audio and return confidence-bound medley suggestions.
// @tested apps/play-desktop/src-tauri/tests/smart_medley.rs — deterministic signal and scoring regressions

use crate::library::{LibraryState, MediaKind, Track};
use crate::smart_medley_store;
use rustfft::{num_complex::Complex, Fft, FftPlanner};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    fs::File,
    io::Read,
    path::{Path, PathBuf},
    sync::Arc,
};
use symphonia::core::{
    codecs::audio::AudioDecoderOptions,
    errors::Error as SymphoniaError,
    formats::{probe::Hint, FormatOptions, TrackType},
    io::MediaSourceStream,
    meta::MetadataOptions,
};
use tauri::{AppHandle, Manager};

pub const ANALYZER_VERSION: &str = "smart-medley-0.1.0";
const ANALYSIS_SAMPLE_RATE: u32 = 22_050;
const FFT_SIZE: usize = 2_048;
const FFT_HOP: usize = 512;
const ENERGY_BLOCK_SAMPLES: usize = ANALYSIS_SAMPLE_RATE as usize / 2;
const BPM_CONFIDENCE_FLOOR: f64 = 0.80;
const KEY_CONFIDENCE_FLOOR: f64 = 0.75;
const CUE_CONFIDENCE_FLOOR: f64 = 0.80;
const SCORE_FLOOR: f64 = 0.70;

/// Return the exact persistent Genesis key used for this media hash and analyzer version.
pub fn persistent_cache_key(media_sha256: &str) -> Result<String, String> {
    smart_medley_store::cache_key(media_sha256, ANALYZER_VERSION)
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum KeyMode {
    Major,
    Minor,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MusicalKey {
    pub tonic_semitone: u8,
    pub mode: KeyMode,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum AnalysisAvailability {
    Ready,
    LowConfidence,
    Unsupported,
    Unreadable,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum AnalysisCacheState {
    NotAttempted,
    Hit,
    Stored,
    Unavailable,
}

impl Default for AnalysisCacheState {
    fn default() -> Self {
        Self::NotAttempted
    }
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SmartMedleyAnalysis {
    pub analysis_version: String,
    pub media_sha256: Option<String>,
    pub duration_seconds: Option<f64>,
    pub bpm: Option<f64>,
    pub bpm_confidence: f64,
    pub key: Option<MusicalKey>,
    pub key_confidence: f64,
    pub cue_in_seconds: Option<f64>,
    pub cue_out_seconds: Option<f64>,
    pub cue_confidence: f64,
    pub availability: AnalysisAvailability,
    pub fallback_reason: Option<String>,
    #[serde(skip)]
    pub cache_state: AnalysisCacheState,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UserCueOverride {
    pub cue_in_seconds: Option<f64>,
    pub cue_out_seconds: Option<f64>,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum RecommendationMode {
    SmartMedley,
    SmoothFallback,
    Off,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScoreComponents {
    pub tempo_compatibility: f64,
    pub key_compatibility: f64,
    pub cue_phase_compatibility: f64,
    pub confidence_floor: f64,
    pub compatibility_score: f64,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SmartMedleyPairDecision {
    pub current_track_id: String,
    pub next_track_id: String,
    pub mode: RecommendationMode,
    pub eligible: bool,
    pub reason: String,
    pub score: Option<ScoreComponents>,
    pub current: SmartMedleyAnalysis,
    pub next: SmartMedleyAnalysis,
    pub current_cue_in_seconds: Option<f64>,
    pub current_cue_out_seconds: Option<f64>,
    pub next_cue_in_seconds: Option<f64>,
    pub next_cue_out_seconds: Option<f64>,
}

#[derive(Clone, Copy, Debug, PartialEq)]
struct EffectiveCues {
    cue_in: Option<f64>,
    cue_out: Option<f64>,
    cue_in_confidence: f64,
    cue_out_confidence: f64,
}

impl EffectiveCues {
    fn confidence(self) -> f64 {
        self.cue_in_confidence.min(self.cue_out_confidence)
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
struct KeyEstimate {
    key: MusicalKeyValue,
    confidence: f64,
}

#[derive(Clone, Copy, Debug, PartialEq)]
struct MusicalKeyValue {
    tonic: u8,
    mode: KeyMode,
}

#[derive(Clone, Copy, Debug, PartialEq)]
struct BpmEstimate {
    bpm: f64,
    confidence: f64,
}

#[derive(Clone, Copy, Debug, PartialEq)]
struct CueEstimate {
    cue_in: f64,
    cue_out: f64,
    confidence: f64,
}

#[derive(Clone, Copy, Debug)]
enum AnalyzeFailure {
    Unsupported,
    Unreadable,
}

/// The Tauri command only analyzes the exact current/next pair supplied by the caller.
/// It returns a decision record and never writes queue state, schedules gain, or advances playback.
#[tauri::command]
pub async fn analyze_smart_medley_pair(
    app: AppHandle,
    current_id: String,
    next_id: String,
    smooth_enabled: bool,
    current_user_cues: Option<UserCueOverride>,
    next_user_cues: Option<UserCueOverride>,
) -> Result<SmartMedleyPairDecision, String> {
    crate::library::run_library_worker_async(move || {
        let state = app.state::<LibraryState>();
        let (current, next, directory) = {
            let library = state.0.lock().map_err(|error| error.to_string())?;
            let current = library
                .tracks
                .iter()
                .find(|track| track.id == current_id)
                .cloned()
                .ok_or("current track is not in the local library")?;
            let next = library
                .tracks
                .iter()
                .find(|track| track.id == next_id)
                .cloned()
                .ok_or("next track is not in the local library")?;
            (current, next, state.1.clone())
        };

        let current_analysis = analyze_library_track(&current, &directory)?;
        let next_analysis = analyze_library_track(&next, &directory)?;
        Ok(evaluate_pair(
            current_id,
            next_id,
            current_analysis,
            next_analysis,
            current_user_cues,
            next_user_cues,
            smooth_enabled,
        ))
    })
    .await
}

/// Analyze one already-authorized local file whose content hash is pinned by the library.
/// This function is public to support deterministic native integration tests and the benchmark.
pub fn analyze_pinned_media(
    path: &Path,
    expected_sha256: &str,
) -> Result<SmartMedleyAnalysis, String> {
    if !valid_sha256(expected_sha256) {
        return Ok(unavailable_analysis(
            Some(expected_sha256.to_ascii_lowercase()),
            AnalysisAvailability::Unsupported,
            "missing-or-invalid-content-hash",
        ));
    }
    let expected = expected_sha256.to_ascii_lowercase();
    let first_hash = hash_file(path).map_err(|_| "media file is unreadable".to_string())?;
    if first_hash != expected {
        return Ok(unavailable_analysis(
            Some(expected),
            AnalysisAvailability::LowConfidence,
            "stale-content-hash",
        ));
    }
    let decoded = match decode_features(path) {
        Ok(features) => features,
        Err(AnalyzeFailure::Unsupported) => {
            return Ok(unavailable_analysis(
                Some(first_hash),
                AnalysisAvailability::Unsupported,
                "unsupported-audio-format",
            ))
        }
        Err(AnalyzeFailure::Unreadable) => {
            return Ok(unavailable_analysis(
                Some(first_hash),
                AnalysisAvailability::Unreadable,
                "audio-decode-failed",
            ))
        }
    };
    let second_hash = hash_file(path).map_err(|_| "media file became unreadable".to_string())?;
    if second_hash != first_hash {
        return Ok(unavailable_analysis(
            Some(second_hash),
            AnalysisAvailability::LowConfidence,
            "media-changed-during-analysis",
        ));
    }
    Ok(decoded.into_analysis(first_hash))
}

fn analyze_library_track(track: &Track, directory: &Path) -> Result<SmartMedleyAnalysis, String> {
    let Some(hash) = track
        .content_hash
        .as_deref()
        .filter(|value| valid_sha256(value))
    else {
        return Ok(unavailable_analysis(
            track.content_hash.clone(),
            AnalysisAvailability::Unsupported,
            "media-has-no-stable-content-hash",
        ));
    };
    let Some(path) = authorized_local_audio_path(track, directory) else {
        return Ok(unavailable_analysis(
            Some(hash.to_ascii_lowercase()),
            if track.missing {
                AnalysisAvailability::Unreadable
            } else {
                AnalysisAvailability::Unsupported
            },
            "media-is-not-local-owned-readable-audio",
        ));
    };

    if !supported_decoder_extension(&path) {
        return Ok(unavailable_analysis(
            Some(hash.to_ascii_lowercase()),
            AnalysisAvailability::Unsupported,
            "unsupported-audio-format",
        ));
    }
    analyze_pinned_media_cached(directory, &path, hash)
}

/// Analyze through the persistent Genesis cache. The caller must establish that the path
/// is a local object selected by the user; this helper independently verifies its pinned hash.
pub fn analyze_pinned_media_cached(
    directory: &Path,
    path: &Path,
    expected_sha256: &str,
) -> Result<SmartMedleyAnalysis, String> {
    if !valid_sha256(expected_sha256) {
        return Ok(unavailable_analysis(
            Some(expected_sha256.to_ascii_lowercase()),
            AnalysisAvailability::Unsupported,
            "missing-or-invalid-content-hash",
        ));
    }
    let expected = expected_sha256.to_ascii_lowercase();
    let actual = match hash_file(path) {
        Ok(value) => value,
        Err(_) => {
            return Ok(unavailable_analysis(
                Some(expected),
                AnalysisAvailability::Unreadable,
                "media-is-unreadable",
            ));
        }
    };
    if actual != expected {
        return Ok(unavailable_analysis(
            Some(expected),
            AnalysisAvailability::LowConfidence,
            "stale-content-hash",
        ));
    }
    if let Ok(Some(mut cached)) = smart_medley_store::load(directory, &actual, ANALYZER_VERSION) {
        if cached.analysis_version == ANALYZER_VERSION
            && cached.media_sha256.as_deref() == Some(actual.as_str())
        {
            cached.cache_state = AnalysisCacheState::Hit;
            return Ok(cached);
        }
    }
    let mut result = analyze_pinned_media(path, &actual)?;
    result.cache_state = match smart_medley_store::save(directory, &result) {
        Ok(()) => AnalysisCacheState::Stored,
        Err(_) => AnalysisCacheState::Unavailable,
    };
    Ok(result)
}

/// Verify the pinned local object and return only an already-persisted Genesis cache hit.
/// This path never decodes media, so benchmark cache misses cannot silently become analyses.
pub fn load_pinned_cache(
    directory: &Path,
    path: &Path,
    expected_sha256: &str,
) -> Result<Option<SmartMedleyAnalysis>, String> {
    if !valid_sha256(expected_sha256) {
        return Ok(None);
    }
    let actual = match hash_file(path) {
        Ok(value) => value,
        Err(_) => return Ok(None),
    };
    if actual != expected_sha256.to_ascii_lowercase() {
        return Ok(None);
    }
    let Ok(Some(mut cached)) = smart_medley_store::load(directory, &actual, ANALYZER_VERSION)
    else {
        return Ok(None);
    };
    if cached.analysis_version != ANALYZER_VERSION
        || cached.media_sha256.as_deref() != Some(actual.as_str())
    {
        return Ok(None);
    }
    cached.cache_state = AnalysisCacheState::Hit;
    Ok(Some(cached))
}

pub fn clear_pinned_cache(directory: &Path, media_sha256: &str) -> Result<(), String> {
    smart_medley_store::clear(directory, media_sha256, ANALYZER_VERSION)
}

fn authorized_local_audio_path(track: &Track, directory: &Path) -> Option<PathBuf> {
    if track.kind != MediaKind::Audio || track.source_kind != "user" || track.missing {
        return None;
    }
    if !matches!(track.storage_kind.as_str(), "managed" | "linked") {
        return None;
    }
    let recorded = Path::new(&track.path);
    let actual = std::fs::canonicalize(recorded).ok()?;
    if !actual.is_file() {
        return None;
    }
    if track.storage_kind == "managed" {
        let media_root = std::fs::canonicalize(directory.join("media")).ok()?;
        if !actual.starts_with(media_root) {
            return None;
        }
    } else if actual != recorded {
        return None;
    }
    Some(actual)
}

fn supported_decoder_extension(path: &Path) -> bool {
    matches!(
        path.extension()
            .and_then(|extension| extension.to_str())
            .map(str::to_ascii_lowercase)
            .as_deref(),
        Some("wav" | "aif" | "aiff" | "flac" | "ogg" | "mp3" | "m4a" | "aac")
    )
}

fn valid_sha256(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn hash_file(path: &Path) -> std::io::Result<String> {
    let mut file = File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 1024 * 1024];
    loop {
        let count = file.read(&mut buffer)?;
        if count == 0 {
            break;
        }
        hasher.update(&buffer[..count]);
    }
    Ok(hex_digest(hasher.finalize().as_slice()))
}

fn hex_digest(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn unavailable_analysis(
    hash: Option<String>,
    availability: AnalysisAvailability,
    reason: &str,
) -> SmartMedleyAnalysis {
    SmartMedleyAnalysis {
        analysis_version: ANALYZER_VERSION.into(),
        media_sha256: hash,
        duration_seconds: None,
        bpm: None,
        bpm_confidence: 0.0,
        key: None,
        key_confidence: 0.0,
        cue_in_seconds: None,
        cue_out_seconds: None,
        cue_confidence: 0.0,
        availability,
        fallback_reason: Some(reason.into()),
        cache_state: AnalysisCacheState::NotAttempted,
    }
}

fn evaluate_pair(
    current_track_id: String,
    next_track_id: String,
    current: SmartMedleyAnalysis,
    next: SmartMedleyAnalysis,
    current_user_cues: Option<UserCueOverride>,
    next_user_cues: Option<UserCueOverride>,
    smooth_enabled: bool,
) -> SmartMedleyPairDecision {
    let current_cues = effective_cues(&current, current_user_cues);
    let next_cues = effective_cues(&next, next_user_cues);
    let fallback_mode = if smooth_enabled {
        RecommendationMode::SmoothFallback
    } else {
        RecommendationMode::Off
    };
    let mut decision = SmartMedleyPairDecision {
        current_track_id,
        next_track_id,
        mode: fallback_mode,
        eligible: false,
        reason: "unknown-analysis".into(),
        score: None,
        current,
        next,
        current_cue_in_seconds: current_cues.cue_in,
        current_cue_out_seconds: current_cues.cue_out,
        next_cue_in_seconds: next_cues.cue_in,
        next_cue_out_seconds: next_cues.cue_out,
    };

    let reason = pair_gate_reason(&decision.current, &decision.next, current_cues, next_cues);
    if let Some(reason) = reason {
        decision.reason = reason.into();
        return decision;
    }

    let bpm_a = decision.current.bpm.expect("BPM gate checked");
    let bpm_b = decision.next.bpm.expect("BPM gate checked");
    let key_a = decision.current.key.as_ref().expect("key gate checked");
    let key_b = decision.next.key.as_ref().expect("key gate checked");
    let cue_out_a = current_cues.cue_out.expect("cue gate checked");
    let cue_in_b = next_cues.cue_in.expect("cue gate checked");
    let components = score_components(
        bpm_a,
        bpm_b,
        key_a,
        key_b,
        cue_out_a,
        cue_in_b,
        current_cues.confidence(),
        next_cues.confidence(),
        decision.current.bpm_confidence,
        decision.next.bpm_confidence,
        decision.current.key_confidence,
        decision.next.key_confidence,
    );
    if components.compatibility_score < SCORE_FLOOR {
        decision.reason = "compatibility-score-below-0.70".into();
        decision.score = Some(components);
        return decision;
    }
    decision.mode = RecommendationMode::SmartMedley;
    decision.eligible = true;
    decision.reason = "eligible-current-next-pair".into();
    decision.score = Some(components);
    decision
}

/// Evaluate two hash-pinned analyzer records with the production pair gates and score.
/// Evidence tooling uses this entry point so the benchmark cannot copy or tune the decision logic.
pub fn evaluate_pinned_pair(
    current_track_id: String,
    next_track_id: String,
    current: SmartMedleyAnalysis,
    next: SmartMedleyAnalysis,
) -> SmartMedleyPairDecision {
    evaluate_pair(
        current_track_id,
        next_track_id,
        current,
        next,
        None,
        None,
        true,
    )
}

fn effective_cues(analysis: &SmartMedleyAnalysis, user: Option<UserCueOverride>) -> EffectiveCues {
    let user_cue_in = user.and_then(|value| value.cue_in_seconds);
    let user_cue_out = user.and_then(|value| value.cue_out_seconds);
    let cue_in = user_cue_in.or(analysis.cue_in_seconds);
    let cue_out = user_cue_out.or(analysis.cue_out_seconds);
    let automatic_confidence = quantize_confidence(analysis.cue_confidence);
    EffectiveCues {
        cue_in: cue_in.map(quantize_seconds),
        cue_out: cue_out.map(quantize_seconds),
        cue_in_confidence: if user_cue_in.is_some() {
            1.0
        } else {
            automatic_confidence
        },
        cue_out_confidence: if user_cue_out.is_some() {
            1.0
        } else {
            automatic_confidence
        },
    }
}

fn pair_gate_reason(
    current: &SmartMedleyAnalysis,
    next: &SmartMedleyAnalysis,
    current_cues: EffectiveCues,
    next_cues: EffectiveCues,
) -> Option<&'static str> {
    for analysis in [current, next] {
        if analysis.availability == AnalysisAvailability::Unsupported {
            return Some("unsupported-media");
        }
        if analysis.availability == AnalysisAvailability::Unreadable {
            return Some("unreadable-media");
        }
        if analysis.analysis_version != ANALYZER_VERSION {
            return Some("stale-analysis-version");
        }
        if !analysis
            .media_sha256
            .as_deref()
            .map(valid_sha256)
            .unwrap_or(false)
        {
            return Some("media-hash-unavailable");
        }
        if analysis.bpm.is_none() || analysis.key.is_none() {
            return Some("unknown-analysis-estimate");
        }
    }
    let bpm_a = current.bpm?;
    let bpm_b = next.bpm?;
    if !(60.0..=180.0).contains(&bpm_a) || !(60.0..=180.0).contains(&bpm_b) {
        return Some("bpm-outside-60-180");
    }
    if current.bpm_confidence < BPM_CONFIDENCE_FLOOR || next.bpm_confidence < BPM_CONFIDENCE_FLOOR {
        return Some("bpm-confidence-below-0.80");
    }
    if current.key_confidence < KEY_CONFIDENCE_FLOOR || next.key_confidence < KEY_CONFIDENCE_FLOOR {
        return Some("key-confidence-below-0.75");
    }
    if current_cues.confidence() < CUE_CONFIDENCE_FLOOR
        || next_cues.confidence() < CUE_CONFIDENCE_FLOOR
    {
        return Some("cue-confidence-below-0.80");
    }
    if !valid_cues(current, current_cues) || !valid_cues(next, next_cues) {
        return Some("invalid-cue-range");
    }
    let ratio = bpm_a.max(bpm_b) / bpm_a.min(bpm_b);
    if ratio > 1.03 {
        return Some("tempo-ratio-above-1.03");
    }
    let key_score = key_compatibility(current.key.as_ref()?, next.key.as_ref()?);
    if key_score < 0.50 {
        return Some("incompatible-key");
    }
    None
}

fn valid_cues(analysis: &SmartMedleyAnalysis, cues: EffectiveCues) -> bool {
    let (Some(cue_in), Some(cue_out), Some(duration)) =
        (cues.cue_in, cues.cue_out, analysis.duration_seconds)
    else {
        return false;
    };
    cue_in >= 0.0 && cue_in < cue_out && cue_out <= duration
}

/// Apply the pinned compatibility formula to already quantized estimator values.
pub fn score_components(
    bpm_a: f64,
    bpm_b: f64,
    key_a: &MusicalKey,
    key_b: &MusicalKey,
    cue_out_a_seconds: f64,
    cue_in_b_seconds: f64,
    bpm_confidence_a: f64,
    bpm_confidence_b: f64,
    key_confidence_a: f64,
    key_confidence_b: f64,
    cue_confidence_a: f64,
    cue_confidence_b: f64,
) -> ScoreComponents {
    let bpm_a = quantize_bpm(bpm_a);
    let bpm_b = quantize_bpm(bpm_b);
    let cue_out_a_seconds = quantize_seconds(cue_out_a_seconds);
    let cue_in_b_seconds = quantize_seconds(cue_in_b_seconds);
    let tempo_distance = (bpm_a / bpm_b).ln().abs();
    let tempo_compatibility = (1.0 - tempo_distance / 1.03f64.ln()).max(0.0);
    // Snap floating-point residue at the inclusive 3% boundary to zero.
    let tempo_compatibility = if tempo_compatibility <= 1.0e-12 {
        0.0
    } else {
        tempo_compatibility
    };
    let key_compatibility = key_compatibility(key_a, key_b);
    let phase_a = fractional_part(cue_out_a_seconds * bpm_a / 60.0);
    let phase_b = fractional_part(cue_in_b_seconds * bpm_b / 60.0);
    let phase_delta = (phase_a - phase_b).abs();
    let cue_phase_compatibility = 1.0 - 2.0 * phase_delta.min(1.0 - phase_delta);
    let confidence_floor = [
        bpm_confidence_a,
        bpm_confidence_b,
        key_confidence_a,
        key_confidence_b,
        cue_confidence_a,
        cue_confidence_b,
    ]
    .into_iter()
    .map(quantize_confidence)
    .fold(1.0_f64, f64::min);
    let compatibility_score = 0.40 * tempo_compatibility
        + 0.25 * key_compatibility
        + 0.20 * cue_phase_compatibility
        + 0.15 * confidence_floor;
    ScoreComponents {
        tempo_compatibility,
        key_compatibility,
        cue_phase_compatibility,
        confidence_floor,
        compatibility_score,
    }
}

fn key_compatibility(a: &MusicalKey, b: &MusicalKey) -> f64 {
    let tonic_a = a.tonic_semitone % 12;
    let tonic_b = b.tonic_semitone % 12;
    let distance = (tonic_a + 12 - tonic_b) % 12;
    if tonic_a == tonic_b && a.mode == b.mode {
        1.0
    } else if a.mode != b.mode && matches!(distance, 3 | 9) {
        0.75
    } else if a.mode == b.mode && matches!(distance, 5 | 7) {
        0.50
    } else {
        0.0
    }
}

fn fractional_part(value: f64) -> f64 {
    value - value.floor()
}

fn quantize_bpm(value: f64) -> f64 {
    (value * 10.0).round() / 10.0
}

fn quantize_seconds(value: f64) -> f64 {
    (value * 100.0).round() / 100.0
}

fn quantize_confidence(value: f64) -> f64 {
    (value.clamp(0.0, 1.0) * 100.0).round() / 100.0
}

struct DecodedFeatures {
    duration_seconds: f64,
    bpm: Option<BpmEstimate>,
    key: Option<KeyEstimate>,
    cues: Option<CueEstimate>,
}

impl DecodedFeatures {
    fn into_analysis(self, hash: String) -> SmartMedleyAnalysis {
        let bpm = self.bpm.map(|estimate| quantize_bpm(estimate.bpm));
        let bpm_confidence = self
            .bpm
            .map(|estimate| quantize_confidence(estimate.confidence))
            .unwrap_or(0.0);
        let key = self.key.map(|estimate| MusicalKey {
            tonic_semitone: estimate.key.tonic,
            mode: estimate.key.mode,
        });
        let key_confidence = self
            .key
            .map(|estimate| quantize_confidence(estimate.confidence))
            .unwrap_or(0.0);
        let cue_in = self.cues.map(|estimate| quantize_seconds(estimate.cue_in));
        let cue_out = self.cues.map(|estimate| quantize_seconds(estimate.cue_out));
        let cue_confidence = self
            .cues
            .map(|estimate| quantize_confidence(estimate.confidence))
            .unwrap_or(0.0);
        let ready = bpm.is_some_and(|value| (60.0..=180.0).contains(&value))
            && bpm_confidence >= BPM_CONFIDENCE_FLOOR
            && key.is_some()
            && key_confidence >= KEY_CONFIDENCE_FLOOR
            && cue_in.zip(cue_out).is_some_and(|(start, end)| {
                start >= 0.0 && start < end && end <= self.duration_seconds
            })
            && cue_confidence >= CUE_CONFIDENCE_FLOOR;
        let fallback_reason = (!ready).then(|| "low-confidence-or-unknown-estimate".into());
        SmartMedleyAnalysis {
            analysis_version: ANALYZER_VERSION.into(),
            media_sha256: Some(hash),
            duration_seconds: Some(quantize_seconds(self.duration_seconds)),
            bpm,
            bpm_confidence,
            key,
            key_confidence,
            cue_in_seconds: cue_in,
            cue_out_seconds: cue_out,
            cue_confidence,
            availability: if ready {
                AnalysisAvailability::Ready
            } else {
                AnalysisAvailability::LowConfidence
            },
            fallback_reason,
            cache_state: AnalysisCacheState::NotAttempted,
        }
    }
}

fn decode_features(path: &Path) -> Result<DecodedFeatures, AnalyzeFailure> {
    let file = File::open(path).map_err(|_| AnalyzeFailure::Unreadable)?;
    let stream = MediaSourceStream::new(Box::new(file), Default::default());
    let mut hint = Hint::new();
    if let Some(extension) = path.extension().and_then(|value| value.to_str()) {
        hint.with_extension(extension);
    }
    let mut format = symphonia::default::get_probe()
        .probe(
            &hint,
            stream,
            FormatOptions::default(),
            MetadataOptions::default(),
        )
        .map_err(map_symphonia_failure)?;
    let track = format
        .default_track(TrackType::Audio)
        .ok_or(AnalyzeFailure::Unsupported)?;
    let track_id = track.id;
    let codec_params = track
        .codec_params
        .as_ref()
        .and_then(|value| value.audio())
        .ok_or(AnalyzeFailure::Unsupported)?;
    let mut decoder = symphonia::default::get_codecs()
        .make_audio_decoder(codec_params, &AudioDecoderOptions::default())
        .map_err(map_symphonia_failure)?;
    let mut features = FeatureAccumulator::new();
    let mut samples = Vec::<f32>::new();
    loop {
        let packet = match format.next_packet() {
            Ok(Some(packet)) => packet,
            Ok(None) => break,
            Err(SymphoniaError::ResetRequired) => return Err(AnalyzeFailure::Unsupported),
            Err(_) => return Err(AnalyzeFailure::Unreadable),
        };
        if packet.track_id != track_id {
            continue;
        }
        let decoded = decoder.decode(&packet).map_err(map_symphonia_failure)?;
        let spec = decoded.spec();
        let channels = spec.channels().count();
        let sample_rate = spec.rate();
        if channels == 0 || sample_rate == 0 {
            return Err(AnalyzeFailure::Unsupported);
        }
        samples.resize(decoded.samples_interleaved(), 0.0);
        decoded.copy_to_slice_interleaved(&mut samples);
        for frame in samples.chunks_exact(channels) {
            let mono = frame.iter().copied().sum::<f32>() / channels as f32;
            features.push_input(mono, sample_rate);
        }
    }
    let duration_seconds = features.duration_seconds();
    if duration_seconds <= 0.0 || features.frame_count() < 8 {
        return Err(AnalyzeFailure::Unreadable);
    }
    Ok(features.finish(duration_seconds))
}

fn map_symphonia_failure(error: SymphoniaError) -> AnalyzeFailure {
    match error {
        SymphoniaError::Unsupported(_) => AnalyzeFailure::Unsupported,
        _ => AnalyzeFailure::Unreadable,
    }
}

struct FeatureAccumulator {
    fft: Arc<dyn Fft<f32>>,
    ring: Vec<f32>,
    next_ring_index: usize,
    filled_samples: usize,
    samples_since_frame: usize,
    fft_buffer: Vec<Complex<f32>>,
    previous_magnitudes: Vec<f32>,
    onset_strength: Vec<f64>,
    chroma: [f64; 12],
    input_rate: Option<u32>,
    input_frames: u64,
    next_output_input_frame: f64,
    energy_sum: f64,
    energy_samples: usize,
    energy_blocks: Vec<f64>,
    output_samples: u64,
    last_input_sample: f32,
}

impl FeatureAccumulator {
    fn new() -> Self {
        let mut planner = FftPlanner::<f32>::new();
        let fft = planner.plan_fft_forward(FFT_SIZE);
        Self {
            fft,
            ring: vec![0.0; FFT_SIZE],
            next_ring_index: 0,
            filled_samples: 0,
            samples_since_frame: 0,
            fft_buffer: vec![Complex::new(0.0, 0.0); FFT_SIZE],
            previous_magnitudes: vec![0.0; FFT_SIZE / 2 + 1],
            onset_strength: Vec::new(),
            chroma: [0.0; 12],
            input_rate: None,
            input_frames: 0,
            next_output_input_frame: 0.0,
            energy_sum: 0.0,
            energy_samples: 0,
            energy_blocks: Vec::new(),
            output_samples: 0,
            last_input_sample: 0.0,
        }
    }

    fn push_input(&mut self, sample: f32, sample_rate: u32) {
        if self.input_rate.is_none() {
            self.input_rate = Some(sample_rate);
        }
        if self.input_rate != Some(sample_rate) {
            return;
        }
        let input_index = self.input_frames as f64;
        let rate_step = sample_rate as f64 / ANALYSIS_SAMPLE_RATE as f64;
        if self.input_frames == 0 {
            self.push_resampled(sample);
            self.next_output_input_frame = rate_step;
        } else {
            let prior_index = input_index - 1.0;
            while self.next_output_input_frame <= input_index {
                let fraction = (self.next_output_input_frame - prior_index).clamp(0.0, 1.0);
                let prior = self.last_input_sample;
                self.push_resampled(prior + (sample - prior) * fraction as f32);
                self.next_output_input_frame += rate_step;
            }
        }
        self.last_input_sample = sample;
        self.input_frames += 1;
    }

    fn push_resampled(&mut self, sample: f32) {
        let finite = if sample.is_finite() { sample } else { 0.0 };
        self.energy_sum += (finite as f64) * (finite as f64);
        self.energy_samples += 1;
        self.output_samples += 1;
        if self.energy_samples == ENERGY_BLOCK_SAMPLES {
            self.energy_blocks
                .push((self.energy_sum / self.energy_samples as f64).sqrt());
            self.energy_sum = 0.0;
            self.energy_samples = 0;
        }
        self.ring[self.next_ring_index] = finite;
        self.next_ring_index = (self.next_ring_index + 1) % FFT_SIZE;
        self.filled_samples = (self.filled_samples + 1).min(FFT_SIZE);
        self.samples_since_frame += 1;
        if self.filled_samples == FFT_SIZE && self.samples_since_frame >= FFT_HOP {
            self.process_frame();
            self.samples_since_frame = 0;
        }
    }

    fn process_frame(&mut self) {
        let denominator = (FFT_SIZE - 1) as f32;
        for index in 0..FFT_SIZE {
            let sample = self.ring[(self.next_ring_index + index) % FFT_SIZE];
            let window = 0.5 - 0.5 * (std::f32::consts::TAU * index as f32 / denominator).cos();
            self.fft_buffer[index] = Complex::new(sample * window, 0.0);
        }
        self.fft.process(&mut self.fft_buffer);
        let mut flux = 0.0_f64;
        for bin in 1..=FFT_SIZE / 2 {
            let magnitude = self.fft_buffer[bin].norm();
            let prior = self.previous_magnitudes[bin];
            flux += f64::from((magnitude - prior).max(0.0));
            self.previous_magnitudes[bin] = magnitude;
            let frequency = bin as f64 * ANALYSIS_SAMPLE_RATE as f64 / FFT_SIZE as f64;
            if (55.0..=2_000.0).contains(&frequency) && magnitude > 0.0 {
                let midi = (69.0 + 12.0 * (frequency / 440.0).log2()).round() as i32;
                self.chroma[midi.rem_euclid(12) as usize] += f64::from(magnitude);
            }
        }
        self.onset_strength.push(flux);
    }

    fn duration_seconds(&self) -> f64 {
        self.input_rate
            .map(|rate| self.input_frames as f64 / rate as f64)
            .unwrap_or(0.0)
    }

    fn frame_count(&self) -> usize {
        self.onset_strength.len()
    }

    fn finish(mut self, duration_seconds: f64) -> DecodedFeatures {
        if self.energy_samples > 0 {
            self.energy_blocks
                .push((self.energy_sum / self.energy_samples as f64).sqrt());
        }
        let frame_rate = ANALYSIS_SAMPLE_RATE as f64 / FFT_HOP as f64;
        DecodedFeatures {
            duration_seconds,
            bpm: estimate_bpm(&self.onset_strength, frame_rate),
            key: estimate_key(&self.chroma),
            cues: estimate_cues(&self.energy_blocks, duration_seconds),
        }
    }
}

fn estimate_bpm(onsets: &[f64], frame_rate: f64) -> Option<BpmEstimate> {
    if onsets.len() < (frame_rate * 8.0) as usize {
        return None;
    }
    let mean = onsets.iter().sum::<f64>() / onsets.len() as f64;
    let centered = onsets.iter().map(|value| value - mean).collect::<Vec<_>>();
    let energy = centered.iter().map(|value| value * value).sum::<f64>();
    if energy < 1.0e-9 {
        return None;
    }
    let min_lag = (frame_rate * 60.0 / 180.0).round().max(1.0) as usize;
    let max_lag = (frame_rate * 60.0 / 60.0).round() as usize;
    let mut correlations = Vec::with_capacity(max_lag - min_lag + 1);
    for lag in min_lag..=max_lag {
        let mut numerator = 0.0;
        let mut left_energy = 0.0;
        let mut right_energy = 0.0;
        for index in lag..centered.len() {
            let left = centered[index];
            let right = centered[index - lag];
            numerator += left * right;
            left_energy += left * left;
            right_energy += right * right;
        }
        let denominator = (left_energy * right_energy).sqrt();
        correlations.push(if denominator > 0.0 {
            numerator / denominator
        } else {
            0.0
        });
    }
    let best_index = correlations
        .iter()
        .enumerate()
        .max_by(|left, right| left.1.total_cmp(right.1))?
        .0;
    let best_correlation = correlations[best_index].clamp(0.0, 1.0);
    if best_correlation < 0.05 {
        return None;
    }
    let lag = min_lag + best_index;
    let delta = if best_index > 0 && best_index + 1 < correlations.len() {
        let before = correlations[best_index - 1];
        let peak = correlations[best_index];
        let after = correlations[best_index + 1];
        let divisor = before - 2.0 * peak + after;
        if divisor.abs() > 1.0e-12 {
            (0.5 * (before - after) / divisor).clamp(-0.5, 0.5)
        } else {
            0.0
        }
    } else {
        0.0
    };
    let bpm = 60.0 * frame_rate / (lag as f64 + delta);
    if !(60.0..=180.0).contains(&bpm) {
        return None;
    }
    let secondary_peak = correlations
        .iter()
        .enumerate()
        .filter(|(index, _)| index.abs_diff(best_index) > 2)
        .map(|(_, value)| value.max(0.0))
        .fold(0.0_f64, f64::max);
    let separation = ((best_correlation - secondary_peak) / best_correlation).clamp(0.0, 1.0);
    let confidence = (0.55 + 0.45 * best_correlation) * (0.75 + 0.25 * separation);
    Some(BpmEstimate {
        bpm: quantize_bpm(bpm),
        confidence: confidence.clamp(0.0, 0.99),
    })
}

fn estimate_key(chroma: &[f64; 12]) -> Option<KeyEstimate> {
    let total = chroma.iter().sum::<f64>();
    if !total.is_finite() || total <= 1.0e-8 {
        return None;
    }
    let chroma = chroma.map(|value| value / total);
    const MAJOR: [f64; 12] = [
        6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88,
    ];
    const MINOR: [f64; 12] = [
        6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17,
    ];
    let mut candidates = Vec::with_capacity(24);
    for tonic in 0..12 {
        candidates.push((
            pearson_rotated(&chroma, &MAJOR, tonic),
            tonic,
            KeyMode::Major,
        ));
        candidates.push((
            pearson_rotated(&chroma, &MINOR, tonic),
            tonic,
            KeyMode::Minor,
        ));
    }
    candidates.sort_by(|left, right| right.0.total_cmp(&left.0));
    let (best, tonic, mode) = candidates[0];
    let second = candidates[1].0;
    if best < 0.10 {
        return None;
    }
    let tonal_strength = ((best - 0.10) / 0.65).clamp(0.0, 1.0);
    let key_separation = ((best - second) / 0.25).clamp(0.0, 1.0);
    let confidence = (tonal_strength * key_separation).clamp(0.0, 0.99);
    Some(KeyEstimate {
        key: MusicalKeyValue {
            tonic: tonic as u8,
            mode,
        },
        confidence,
    })
}

fn pearson_rotated(chroma: &[f64; 12], profile: &[f64; 12], tonic: usize) -> f64 {
    let chroma_mean = chroma.iter().sum::<f64>() / 12.0;
    let profile_mean = profile.iter().sum::<f64>() / 12.0;
    let mut numerator = 0.0;
    let mut chroma_sum = 0.0;
    let mut profile_sum = 0.0;
    for index in 0..12 {
        let left = chroma[(index + tonic) % 12] - chroma_mean;
        let right = profile[index] - profile_mean;
        numerator += left * right;
        chroma_sum += left * left;
        profile_sum += right * right;
    }
    let denominator = (chroma_sum * profile_sum).sqrt();
    if denominator > 0.0 {
        numerator / denominator
    } else {
        0.0
    }
}

fn estimate_cues(energy: &[f64], duration_seconds: f64) -> Option<CueEstimate> {
    let peak = energy.iter().copied().fold(0.0_f64, f64::max);
    if energy.len() < 2 || peak < 1.0e-4 {
        return None;
    }
    let threshold = (peak * 0.06).max(0.0005);
    let first = energy.iter().position(|value| *value >= threshold)?;
    let last = energy.iter().rposition(|value| *value >= threshold)?;
    if last.saturating_sub(first) < 4 {
        return None;
    }
    let cue_in = first as f64 * 0.5;
    let cue_out = ((last + 1) as f64 * 0.5).min(duration_seconds);
    if cue_in >= cue_out {
        return None;
    }
    let silent_blocks = energy.iter().filter(|value| **value < threshold).count() as f64;
    let silence_ratio = silent_blocks / energy.len() as f64;
    let boundary_count = usize::from(first > 0) + usize::from(last + 1 < energy.len());
    let confidence = (0.72 + 0.14 * boundary_count as f64 + 0.08 * silence_ratio).clamp(0.0, 0.96);
    Some(CueEstimate {
        cue_in,
        cue_out,
        confidence,
    })
}

#[cfg(test)]
mod formula_tests {
    use super::*;

    fn key(tonic: u8, mode: KeyMode) -> MusicalKey {
        MusicalKey {
            tonic_semitone: tonic,
            mode,
        }
    }

    #[test]
    fn key_compatibility_uses_identical_relative_fifth_and_incompatible_cases() {
        assert_eq!(
            key_compatibility(&key(0, KeyMode::Major), &key(0, KeyMode::Major)),
            1.0
        );
        assert_eq!(
            key_compatibility(&key(0, KeyMode::Major), &key(9, KeyMode::Minor)),
            0.75
        );
        assert_eq!(
            key_compatibility(&key(0, KeyMode::Major), &key(7, KeyMode::Major)),
            0.5
        );
        assert_eq!(
            key_compatibility(&key(0, KeyMode::Major), &key(2, KeyMode::Major)),
            0.0
        );
    }

    #[test]
    fn score_formula_handles_exact_tempo_phase_and_confidence_floor() {
        let score = score_components(
            120.04,
            120.01,
            &key(0, KeyMode::Major),
            &key(0, KeyMode::Major),
            16.0,
            0.0,
            0.91,
            0.92,
            0.88,
            0.89,
            0.94,
            0.95,
        );
        assert!((score.tempo_compatibility - 1.0).abs() < 1.0e-9);
        assert!((score.cue_phase_compatibility - 1.0).abs() < 1.0e-9);
        assert_eq!(score.confidence_floor, 0.88);
        assert!((score.compatibility_score - (0.40 + 0.25 + 0.20 + 0.132)).abs() < 1.0e-9);
    }

    #[test]
    fn tempo_ratio_boundary_is_inclusive_after_bpm_quantization() {
        let ratio_at_limit = score_components(
            100.0,
            103.0,
            &key(0, KeyMode::Major),
            &key(0, KeyMode::Major),
            12.0,
            0.0,
            0.9,
            0.9,
            0.9,
            0.9,
            0.9,
            0.9,
        );
        let ratio_above = score_components(
            100.0,
            103.1,
            &key(0, KeyMode::Major),
            &key(0, KeyMode::Major),
            12.0,
            0.0,
            0.9,
            0.9,
            0.9,
            0.9,
            0.9,
            0.9,
        );
        assert!((ratio_at_limit.tempo_compatibility).abs() < 1.0e-9);
        assert_eq!(ratio_above.tempo_compatibility, 0.0);
    }

    #[test]
    fn user_cue_values_override_automatic_values_and_are_quantized() {
        let analysis = SmartMedleyAnalysis {
            analysis_version: ANALYZER_VERSION.into(),
            media_sha256: Some("a".repeat(64)),
            duration_seconds: Some(30.0),
            bpm: Some(120.0),
            bpm_confidence: 0.9,
            key: Some(key(0, KeyMode::Major)),
            key_confidence: 0.9,
            cue_in_seconds: Some(0.0),
            cue_out_seconds: Some(30.0),
            cue_confidence: 0.7,
            availability: AnalysisAvailability::LowConfidence,
            fallback_reason: None,
            cache_state: AnalysisCacheState::NotAttempted,
        };
        let actual = effective_cues(
            &analysis,
            Some(UserCueOverride {
                cue_in_seconds: Some(0.127),
                cue_out_seconds: Some(29.876),
            }),
        );
        assert_eq!(actual.cue_in, Some(0.13));
        assert_eq!(actual.cue_out, Some(29.88));
        assert_eq!(actual.cue_in_confidence, 1.0);
        assert_eq!(actual.cue_out_confidence, 1.0);
        assert_eq!(actual.confidence(), 1.0);
    }

    fn analysis(
        hash: char,
        bpm: f64,
        musical_key: MusicalKey,
        cue_in: f64,
        cue_out: f64,
        cue_confidence: f64,
    ) -> SmartMedleyAnalysis {
        SmartMedleyAnalysis {
            analysis_version: ANALYZER_VERSION.into(),
            media_sha256: Some(hash.to_string().repeat(64)),
            duration_seconds: Some(60.0),
            bpm: Some(bpm),
            bpm_confidence: 1.0,
            key: Some(musical_key),
            key_confidence: 1.0,
            cue_in_seconds: Some(cue_in),
            cue_out_seconds: Some(cue_out),
            cue_confidence,
            availability: if cue_confidence >= CUE_CONFIDENCE_FLOOR {
                AnalysisAvailability::Ready
            } else {
                AnalysisAvailability::LowConfidence
            },
            fallback_reason: None,
            cache_state: AnalysisCacheState::NotAttempted,
        }
    }

    fn pair(
        current: SmartMedleyAnalysis,
        next: SmartMedleyAnalysis,
        current_user_cues: Option<UserCueOverride>,
        next_user_cues: Option<UserCueOverride>,
    ) -> SmartMedleyPairDecision {
        evaluate_pair(
            "current-occurrence".into(),
            "next-occurrence".into(),
            current,
            next,
            current_user_cues,
            next_user_cues,
            true,
        )
    }

    #[test]
    fn one_endpoint_override_does_not_raise_automatic_endpoint_confidence() {
        let current = analysis('a', 120.0, key(0, KeyMode::Major), 0.0, 40.0, 0.70);
        let next = analysis('b', 120.0, key(0, KeyMode::Major), 0.0, 40.0, 1.0);
        let override_cue_in = UserCueOverride {
            cue_in_seconds: Some(0.12),
            cue_out_seconds: None,
        };
        let cues = effective_cues(&current, Some(override_cue_in));
        assert_eq!(cues.cue_in_confidence, 1.0);
        assert_eq!(cues.cue_out_confidence, 0.70);
        assert_eq!(cues.confidence(), 0.70);

        let decision = pair(current, next, Some(override_cue_in), None);
        assert!(!decision.eligible);
        assert_eq!(decision.reason, "cue-confidence-below-0.80");
        assert_eq!(decision.mode, RecommendationMode::SmoothFallback);
    }

    #[test]
    fn synthetic_pair_key_cases_cover_identical_relative_fifth_and_incompatible() {
        let cases = [
            (key(0, KeyMode::Major), "identical", true),
            (key(9, KeyMode::Minor), "relative", true),
            (key(7, KeyMode::Major), "fifth", true),
            (key(2, KeyMode::Major), "incompatible", false),
        ];
        for (next_key, label, expected_eligible) in cases {
            let decision = pair(
                analysis('a', 120.0, key(0, KeyMode::Major), 0.0, 40.0, 1.0),
                analysis('b', 120.0, next_key, 0.0, 40.0, 1.0),
                None,
                None,
            );
            assert_eq!(decision.eligible, expected_eligible, "{label}");
            if label == "incompatible" {
                assert_eq!(decision.reason, "incompatible-key");
            }
        }
    }

    #[test]
    fn synthetic_pair_equal_bpm_and_exact_three_percent_ratio_are_deterministic() {
        let equal = pair(
            analysis('a', 120.0, key(0, KeyMode::Major), 0.0, 40.0, 1.0),
            analysis('b', 120.0, key(0, KeyMode::Major), 0.0, 40.0, 1.0),
            None,
            None,
        );
        assert!(equal.eligible);
        assert_eq!(equal.score.as_ref().unwrap().tempo_compatibility, 1.0);

        let at_limit = pair(
            analysis('a', 100.0, key(0, KeyMode::Major), 0.0, 40.0, 1.0),
            analysis('b', 103.0, key(0, KeyMode::Major), 0.0, 40.0, 1.0),
            None,
            None,
        );
        assert_eq!(at_limit.reason, "compatibility-score-below-0.70");
        assert_eq!(at_limit.score.as_ref().unwrap().tempo_compatibility, 0.0);
        assert_ne!(at_limit.reason, "tempo-ratio-above-1.03");
    }

    #[test]
    fn synthetic_pair_phase_alignment_and_half_beat_follow_score_formula() {
        let aligned = pair(
            analysis('a', 120.0, key(0, KeyMode::Major), 0.0, 40.0, 1.0),
            analysis('b', 120.0, key(7, KeyMode::Major), 0.0, 40.0, 1.0),
            None,
            None,
        );
        assert!(aligned.eligible);
        assert_eq!(aligned.score.as_ref().unwrap().cue_phase_compatibility, 1.0);

        let half_beat = pair(
            analysis('a', 120.0, key(0, KeyMode::Major), 0.0, 40.0, 1.0),
            analysis('b', 120.0, key(7, KeyMode::Major), 0.25, 40.0, 1.0),
            None,
            None,
        );
        assert_eq!(
            half_beat.score.as_ref().unwrap().cue_phase_compatibility,
            0.0
        );
        assert!(
            half_beat.score.as_ref().unwrap().compatibility_score
                < aligned.score.as_ref().unwrap().compatibility_score
        );
    }

    #[test]
    fn synthetic_pair_accepts_exact_score_floor_and_falls_back_below_it() {
        let at_floor = pair(
            analysis('a', 120.0, key(0, KeyMode::Major), 0.0, 40.0, 0.9),
            analysis('b', 120.0, key(7, KeyMode::Major), 0.20, 40.0, 0.9),
            None,
            None,
        );
        let score = at_floor.score.as_ref().unwrap().compatibility_score;
        assert!((score - SCORE_FLOOR).abs() < 1.0e-12, "score={score:.15}");
        assert!(at_floor.eligible);

        let below_floor = pair(
            analysis('a', 120.0, key(0, KeyMode::Major), 0.0, 40.0, 0.9),
            analysis('b', 120.0, key(7, KeyMode::Major), 0.21, 40.0, 0.9),
            None,
            None,
        );
        assert!(below_floor.score.as_ref().unwrap().compatibility_score < SCORE_FLOOR);
        assert!(!below_floor.eligible);
        assert_eq!(below_floor.reason, "compatibility-score-below-0.70");
        assert_eq!(below_floor.mode, RecommendationMode::SmoothFallback);
    }

    #[test]
    fn repeated_synthetic_occurrences_preserve_order_and_serialization() {
        let input = [("A", "B"), ("B", "A"), ("A", "B")];
        let evaluate = || {
            input
                .iter()
                .map(|(current, next)| {
                    let current_hash = if *current == "A" { 'a' } else { 'b' };
                    let next_hash = if *next == "A" { 'a' } else { 'b' };
                    let mut decision = evaluate_pair(
                        (*current).into(),
                        (*next).into(),
                        analysis(current_hash, 120.0, key(0, KeyMode::Major), 0.0, 40.0, 1.0),
                        analysis(next_hash, 120.0, key(0, KeyMode::Major), 0.0, 40.0, 1.0),
                        None,
                        None,
                        true,
                    );
                    // Keep each occurrence's deterministic pair result without deduplicating IDs.
                    decision.reason = format!("{}:{}", current, next);
                    decision
                })
                .collect::<Vec<_>>()
        };
        let first = evaluate();
        let second = evaluate();
        let order = first
            .iter()
            .map(|decision| {
                (
                    decision.current_track_id.as_str(),
                    decision.next_track_id.as_str(),
                )
            })
            .collect::<Vec<_>>();
        assert_eq!(order, vec![("A", "B"), ("B", "A"), ("A", "B")]);
        assert_eq!(
            serde_json::to_vec(&first).unwrap(),
            serde_json::to_vec(&second).unwrap()
        );
    }
}
