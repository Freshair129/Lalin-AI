#![recursion_limit = "256"]

//! Local Smart Medley v1.1 fixture, freeze, evaluation, and blinded-render kit.

use lalin_play_lib::smart_medley::{
    analyze_pinned_media, evaluate_pinned_pair, KeyMode, MusicalKey, SmartMedleyAnalysis,
    SmartMedleyPairDecision, ANALYZER_VERSION,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, HashSet},
    env,
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    path::{Component, Path, PathBuf},
};
use symphonia::core::{
    codecs::audio::AudioDecoderOptions,
    errors::Error as SymphoniaError,
    formats::{probe::Hint, FormatOptions, TrackType},
    io::MediaSourceStream,
    meta::MetadataOptions,
};

const MANIFEST_VERSION: &str = "smart-medley-evidence/v1";
const RESULT_VERSION: &str = "smart-medley-results/v1";
const SAMPLE_RATE: u32 = 44_100;
const CHANNELS: u16 = 2;
const DEFAULT_CROSSFADE_SECONDS: f64 = 5.0;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct Manifest {
    schema_version: String,
    source: String,
    licence: String,
    pairs: Vec<Pair>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct Pair {
    pair_id: String,
    stratum: String,
    expected_eligibility: bool,
    clips: [Clip; 2],
    #[serde(default)]
    notes: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct Clip {
    clip_id: String,
    path: String,
    sha256: String,
    source_url: Option<String>,
    licence: String,
    attribution: String,
    bpm: Option<f64>,
    tonic: Option<u8>,
    mode: Option<KeyMode>,
    cue_in_window: Option<CueWindow>,
    cue_out_window: Option<CueWindow>,
    #[serde(default)]
    allowed_keys: Vec<MusicalKey>,
    #[serde(default)]
    notes: String,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct CueWindow {
    min_seconds: f64,
    max_seconds: f64,
}

#[derive(Clone)]
struct ListeningPick {
    pair_id: String,
    condition: String,
    current_clip: Clip,
    next_clip: Clip,
    current_path: PathBuf,
    next_path: PathBuf,
    current_analysis: SmartMedleyAnalysis,
    next_analysis: SmartMedleyAnalysis,
    transition_id: String,
}

fn main() {
    // Tauri async commands run on Tokio worker threads (2 MiB stack); mirror that instead of
    // the 1 MiB Windows main-thread stack so the evidence run matches the in-app analyzer.
    let worker = std::thread::Builder::new()
        .name("smart-medley-evidence".into())
        .stack_size(2 * 1024 * 1024)
        .spawn(run)
        .expect("evidence worker thread starts");
    let result = worker
        .join()
        .unwrap_or_else(|_| Err("evidence worker panicked".into()));
    if let Err(error) = result {
        eprintln!("Smart Medley evidence kit failed: {error}");
        std::process::exit(2);
    }
}

fn run() -> Result<(), String> {
    let mut args = env::args().skip(1);
    let Some(command) = args.next() else {
        return Err(usage());
    };
    let options = parse_options(args.collect())?;
    match command.as_str() {
        "generate" => generate(&required_path(&options, "--out")?),
        "freeze" => freeze(&required_path(&options, "--manifest")?),
        "evaluate" => evaluate(
            &required_path(&options, "--manifest")?,
            &required_path(&options, "--out")?,
        ),
        "listening" => listening(
            &required_path(&options, "--manifest")?,
            &required_path(&options, "--results")?,
            required(&options, "--seed")?
                .parse::<u64>()
                .map_err(|_| "--seed must be an unsigned integer".to_string())?,
            options
                .get("--crossfade-seconds")
                .map_or(Ok(DEFAULT_CROSSFADE_SECONDS), |value| {
                    value
                        .parse::<f64>()
                        .map_err(|_| "--crossfade-seconds must be a number".to_string())
                })?,
            &required_path(&options, "--out")?,
        ),
        "--help" | "help" => {
            println!("{}", usage());
            Ok(())
        }
        _ => Err(usage()),
    }
}

fn usage() -> String {
    "Usage:\n  smart-medley-evidence generate --out <dir>\n  smart-medley-evidence freeze --manifest <manifest.json>\n  smart-medley-evidence evaluate --manifest <manifest.frozen.json> --out <results.jsonl>\n  smart-medley-evidence listening --manifest <manifest.frozen.json> --results <results.jsonl> --seed <n> [--crossfade-seconds <2..12>] --out <dir>".into()
}

fn parse_options(args: Vec<String>) -> Result<BTreeMap<String, String>, String> {
    let mut parsed = BTreeMap::new();
    let mut index = 0;
    while index < args.len() {
        let key = &args[index];
        if !key.starts_with("--") {
            return Err(format!("unexpected positional argument: {key}"));
        }
        let value = args
            .get(index + 1)
            .ok_or_else(|| format!("missing value for {key}"))?;
        if value.starts_with("--") || parsed.insert(key.clone(), value.clone()).is_some() {
            return Err(format!("missing value or duplicate option: {key}"));
        }
        index += 2;
    }
    Ok(parsed)
}

fn required<'a>(options: &'a BTreeMap<String, String>, key: &str) -> Result<&'a str, String> {
    options
        .get(key)
        .map(String::as_str)
        .ok_or_else(|| format!("required option missing: {key}"))
}

fn required_path(options: &BTreeMap<String, String>, key: &str) -> Result<PathBuf, String> {
    Ok(PathBuf::from(required(options, key)?))
}

fn generate(out: &Path) -> Result<(), String> {
    fs::create_dir_all(out).map_err(|error| format!("cannot create output directory: {error}"))?;
    let audio_dir = out.join("audio");
    fs::create_dir_all(&audio_dir)
        .map_err(|error| format!("cannot create audio directory: {error}"))?;
    let mut pairs = Vec::with_capacity(20);
    for index in 0..20 {
        let (expected, stratum) = match index {
            0..=9 => (true, "clear-rhythmic"),
            10..=13 => (false, "tempo-mismatch"),
            14..=16 => (false, "high-confidence-incompatible"),
            17 => (false, "low-confidence-challenge"),
            18..=19 => (false, "non-music"),
            _ => unreachable!(),
        };
        let pair_id = format!("SYN-{:02}", index + 1);
        let bpm_a = 96.0 + (index % 10) as f64 * 4.0;
        let bpm_b = if (10..14).contains(&index) {
            bpm_a * 1.08
        } else {
            bpm_a
        };
        let (tonic_a, mode_a, tonic_b, mode_b) = if expected {
            match index % 3 {
                0 => (0, KeyMode::Major, 0, KeyMode::Major),
                1 => (0, KeyMode::Major, 9, KeyMode::Minor),
                _ => (0, KeyMode::Major, 7, KeyMode::Major),
            }
        } else if (14..17).contains(&index) {
            (0, KeyMode::Major, 2, KeyMode::Major)
        } else {
            (0, KeyMode::Major, 0, KeyMode::Major)
        };
        let mut clips = Vec::with_capacity(2);
        for side in 0..2 {
            let clip_id = format!("{pair_id}-{}", if side == 0 { "A" } else { "B" });
            let relative_path = format!("audio/{clip_id}.wav");
            let clip_bpm = if side == 0 { bpm_a } else { bpm_b };
            let tonic = if side == 0 { tonic_a } else { tonic_b };
            let mode = if side == 0 { mode_a } else { mode_b };
            let signal = if index == 17 && side == 1 {
                SignalKind::ShortMusic
            } else if index >= 18 {
                SignalKind::Noise
            } else {
                SignalKind::Rhythmic
            };
            let bytes = synthesize_wav(index, side, clip_bpm, tonic, mode, signal);
            let sha256 = sha256_bytes(&bytes);
            write_same_or_new(&out.join(&relative_path), &bytes)?;
            let (cue_in, cue_out) = if signal == SignalKind::ShortMusic {
                (55.0, 59.0)
            } else {
                (2.0, 52.0)
            };
            let has_musical_reference = signal != SignalKind::Noise;
            clips.push(Clip {
                clip_id,
                path: relative_path,
                sha256,
                source_url: None,
                licence: "generated".into(),
                attribution: "Deterministic local synthetic signal; no third-party audio".into(),
                bpm: has_musical_reference.then_some(clip_bpm),
                tonic: has_musical_reference.then_some(tonic),
                mode: has_musical_reference.then_some(mode),
                cue_in_window: has_musical_reference.then_some(cue_window(cue_in, 0.5, 60.0)),
                cue_out_window: has_musical_reference.then_some(cue_window(cue_out, 0.5, 60.0)),
                allowed_keys: Vec::new(),
                notes: format!("By construction: {signal:?}; 44.1-kHz stereo PCM16, 60 seconds"),
            });
        }
        let pair = Pair {
            pair_id,
            stratum: stratum.into(),
            expected_eligibility: expected,
            clips: [clips.remove(0), clips.remove(0)],
            notes: if expected {
                "Deterministic rhythmic pair; BPM equal and cue starts/ends phase-aligned by construction".into()
            } else {
                match stratum {
                    "tempo-mismatch" => "BPM ratio is greater than 1.03 by construction".into(),
                    "high-confidence-incompatible" => {
                        "Major tonic separation is incompatible by construction".into()
                    }
                    "low-confidence-challenge" => {
                        "One clip has less than eight seconds of active rhythmic material".into()
                    }
                    _ => "Both clips contain deterministic broadband noise without musical tones"
                        .into(),
                }
            },
        };
        pairs.push(pair);
    }
    let manifest = Manifest {
        schema_version: MANIFEST_VERSION.into(),
        source: "synthetic".into(),
        licence: "generated".into(),
        pairs,
    };
    validate_manifest(&manifest)?;
    let manifest_bytes = pretty_json(&manifest)?;
    write_same_or_new(&out.join("manifest.synthetic.json"), &manifest_bytes)?;
    println!(
        "Generated 20 deterministic synthetic pairs (40 clips) in {}",
        out.display()
    );
    Ok(())
}

#[derive(Clone, Copy, Debug, PartialEq)]
enum SignalKind {
    Rhythmic,
    ShortMusic,
    Noise,
}

fn cue_window(center: f64, half_width: f64, duration: f64) -> CueWindow {
    CueWindow {
        min_seconds: (center - half_width).max(0.0),
        max_seconds: (center + half_width).min(duration),
    }
}

fn synthesize_wav(
    pair_index: usize,
    side: usize,
    bpm: f64,
    tonic: u8,
    mode: KeyMode,
    kind: SignalKind,
) -> Vec<u8> {
    let frame_count = SAMPLE_RATE as usize * 60;
    let mut bytes = Vec::with_capacity(44 + frame_count * CHANNELS as usize * 2);
    bytes.extend_from_slice(b"RIFF");
    bytes.extend_from_slice(&(36_u32 + (frame_count * 4) as u32).to_le_bytes());
    bytes.extend_from_slice(b"WAVEfmt ");
    bytes.extend_from_slice(&16_u32.to_le_bytes());
    bytes.extend_from_slice(&1_u16.to_le_bytes());
    bytes.extend_from_slice(&CHANNELS.to_le_bytes());
    bytes.extend_from_slice(&SAMPLE_RATE.to_le_bytes());
    bytes.extend_from_slice(&(SAMPLE_RATE * CHANNELS as u32 * 2).to_le_bytes());
    bytes.extend_from_slice(&(CHANNELS * 2).to_le_bytes());
    bytes.extend_from_slice(&16_u16.to_le_bytes());
    bytes.extend_from_slice(b"data");
    bytes.extend_from_slice(&((frame_count * CHANNELS as usize * 2) as u32).to_le_bytes());

    let active_start = if kind == SignalKind::ShortMusic {
        55.0
    } else {
        2.0
    };
    let active_end = if kind == SignalKind::ShortMusic {
        59.0
    } else {
        52.0
    };
    let pulse_width_frames = (SAMPLE_RATE as f64 * 0.18) as usize;
    let frames_per_beat = SAMPLE_RATE as f64 * 60.0 / bpm;
    const MAJOR_PROFILE: [f64; 12] = [
        6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88,
    ];
    const MINOR_PROFILE: [f64; 12] = [
        6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17,
    ];
    let (scale, profile): ([i32; 7], &[f64; 12]) = if mode == KeyMode::Major {
        ([0, 2, 4, 5, 7, 9, 11], &MAJOR_PROFILE)
    } else {
        ([0, 2, 3, 5, 7, 8, 10], &MINOR_PROFILE)
    };
    let tone_gain = 0.15 + ((pair_index * 2 + side) % 7) as f64 * 0.002;
    let mut phases = vec![0.0_f64; scale.len()];
    let tone_specs = scale
        .iter()
        .map(|interval| {
            let frequency = 440.0 * (f64::from(tonic as i32 + *interval - 9) / 12.0).exp2();
            let step = std::f64::consts::TAU * frequency / SAMPLE_RATE as f64;
            let tonic_emphasis = if *interval == 0 { 2.0 } else { 1.0 };
            let amplitude = profile[*interval as usize] / 6.35 * tone_gain * tonic_emphasis;
            (step, amplitude)
        })
        .collect::<Vec<_>>();
    let mut pulse = Vec::with_capacity(pulse_width_frames);
    for _ in 0..pulse_width_frames {
        pulse.push(
            phases
                .iter()
                .zip(&tone_specs)
                .map(|(phase, (_, amplitude))| phase.sin() * amplitude)
                .sum::<f64>(),
        );
        for (phase, (step, _)) in phases.iter_mut().zip(&tone_specs) {
            *phase = (*phase + step).rem_euclid(std::f64::consts::TAU);
        }
    }
    let mut beat_frame = 0.0_f64;
    let mut noise = 0x9e37_79b9_7f4a_7c15_u64 ^ ((pair_index as u64 + 1) << 8) ^ side as u64;
    let mut chunk = Vec::with_capacity(16_384 * 4);
    for frame in 0..frame_count {
        let active = frame >= (active_start * SAMPLE_RATE as f64) as usize
            && frame < (active_end * SAMPLE_RATE as f64) as usize;
        let sample = if kind == SignalKind::Noise && active {
            noise ^= noise << 13;
            noise ^= noise >> 7;
            noise ^= noise << 17;
            (((noise >> 32) as u32 as i32) as f64 / i32::MAX as f64) * 0.18
        } else if active && kind != SignalKind::Noise && beat_frame < pulse_width_frames as f64 {
            let value = pulse[beat_frame as usize];
            beat_frame += 1.0;
            value
        } else {
            if kind != SignalKind::Noise {
                beat_frame += 1.0;
            }
            0.0
        };
        let pcm = (sample.clamp(-0.95, 0.95) * i16::MAX as f64).round() as i16;
        chunk.extend_from_slice(&pcm.to_le_bytes());
        chunk.extend_from_slice(&pcm.to_le_bytes());
        if beat_frame >= frames_per_beat {
            beat_frame -= frames_per_beat;
        }
        if chunk.len() >= 16_384 * 4 {
            bytes.extend_from_slice(&chunk);
            chunk.clear();
        }
    }
    bytes.extend_from_slice(&chunk);
    bytes
}

fn write_same_or_new(path: &Path, bytes: &[u8]) -> Result<(), String> {
    if path.exists() {
        let existing = hash_file(path)?;
        if existing != sha256_bytes(bytes) {
            return Err(format!(
                "refusing to replace different existing file: {}",
                path.display()
            ));
        }
        return Ok(());
    }
    let parent = path.parent().ok_or("output path has no parent")?;
    fs::create_dir_all(parent).map_err(|error| format!("cannot create output parent: {error}"))?;
    let mut output = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)
        .map_err(|error| format!("cannot create {}: {error}", path.display()))?;
    output
        .write_all(bytes)
        .map_err(|error| format!("cannot write {}: {error}", path.display()))
}

fn freeze(input: &Path) -> Result<(), String> {
    let (manifest, root) = read_manifest(input)?;
    validate_manifest(&manifest)?;
    for pair in &manifest.pairs {
        for clip in &pair.clips {
            let path = resolve_clip_path(&root, clip)?;
            let actual = hash_file(&path)?;
            if actual != clip.sha256.to_ascii_lowercase() {
                return Err(format!("clip hash changed or is missing: {}", clip.clip_id));
            }
        }
    }
    let bytes = pretty_json(&manifest)?;
    let output = parent_dir(input).join("manifest.frozen.json");
    let sidecar = output.with_extension("sha256");
    write_new_only(&output, &bytes)?;
    write_new_only(&sidecar, format!("{}\n", sha256_bytes(&bytes)).as_bytes())?;
    println!("Frozen manifest: {}", output.display());
    println!("SHA-256: {}", sha256_bytes(&bytes));
    Ok(())
}

fn write_new_only(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let parent = parent_dir(path);
    fs::create_dir_all(parent)
        .map_err(|error| format!("cannot create output directory: {error}"))?;
    let mut output = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)
        .map_err(|error| {
            format!(
                "refusing to overwrite or cannot create {}: {error}",
                path.display()
            )
        })?;
    output.write_all(bytes).map_err(|error| error.to_string())
}

fn parent_dir(path: &Path) -> &Path {
    path.parent()
        .filter(|parent| !parent.as_os_str().is_empty())
        .unwrap_or_else(|| Path::new("."))
}

fn evaluate(manifest_path: &Path, out: &Path) -> Result<(), String> {
    let (manifest, root, manifest_hash) = read_frozen_manifest(manifest_path)?;
    fs::create_dir_all(parent_dir(out))
        .map_err(|error| format!("cannot create results directory: {error}"))?;
    let mut output = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(out)
        .map_err(|error| format!("refusing to overwrite or cannot create results: {error}"))?;
    for pair in &manifest.pairs {
        let current_path = resolve_clip_path(&root, &pair.clips[0])?;
        let next_path = resolve_clip_path(&root, &pair.clips[1])?;
        let current_hash = hash_file(&current_path)?;
        let next_hash = hash_file(&next_path)?;
        if current_hash != pair.clips[0].sha256 || next_hash != pair.clips[1].sha256 {
            return Err(format!(
                "frozen input changed before evaluation: {}",
                pair.pair_id
            ));
        }
        let current = analyze_pinned_media(&current_path, &current_hash)?;
        let next = analyze_pinned_media(&next_path, &next_hash)?;
        let decision = evaluate_pinned_pair(
            pair.clips[0].clip_id.clone(),
            pair.clips[1].clip_id.clone(),
            current.clone(),
            next.clone(),
        );
        let record = result_json(pair, &current, &next, &decision, &manifest_hash);
        serde_json::to_writer(&mut output, &record).map_err(|error| error.to_string())?;
        output.write_all(b"\n").map_err(|error| error.to_string())?;
    }
    output.flush().map_err(|error| error.to_string())?;
    println!(
        "Evaluated {} pairs with analyzer {}",
        manifest.pairs.len(),
        ANALYZER_VERSION
    );
    Ok(())
}

fn result_json(
    pair: &Pair,
    current: &SmartMedleyAnalysis,
    next: &SmartMedleyAnalysis,
    decision: &SmartMedleyPairDecision,
    manifest_hash: &str,
) -> Value {
    let (t, k, c, q, score) = decision
        .score
        .as_ref()
        .map(|components| {
            (
                Some(components.tempo_compatibility),
                Some(components.key_compatibility),
                Some(components.cue_phase_compatibility),
                Some(components.confidence_floor),
                Some(components.compatibility_score),
            )
        })
        .unwrap_or((None, None, None, None, None));
    json!({
        "schemaVersion": RESULT_VERSION,
        "manifestSha256": manifest_hash,
        "pairId": pair.pair_id,
        "stratum": pair.stratum,
        "expectedEligibility": pair.expected_eligibility,
        "analyzerVersion": ANALYZER_VERSION,
        "clipHashes": [pair.clips[0].sha256, pair.clips[1].sha256],
        "current": current,
        "next": next,
        "T": t,
        "K": k,
        "C": c,
        "Q": q,
        "score": score,
        "eligible": decision.eligible,
        "reason": decision.reason,
    })
}

fn listening(
    manifest_path: &Path,
    results_path: &Path,
    seed: u64,
    crossfade_seconds: f64,
    out: &Path,
) -> Result<(), String> {
    if !crossfade_seconds.is_finite() || !(2.0..=12.0).contains(&crossfade_seconds) {
        return Err(
            "crossfade duration must be between 2 and 12 seconds to match the app setting".into(),
        );
    }
    let (manifest, root, manifest_hash) = read_frozen_manifest(manifest_path)?;
    let results = read_results(results_path, &manifest_hash)?;
    let mut by_pair: BTreeMap<String, &Value> = BTreeMap::new();
    for result in &results {
        let id = string_field(result, "pairId")?;
        if by_pair.insert(id.to_string(), result).is_some() {
            return Err(format!("duplicate pair result: {id}"));
        }
    }
    if by_pair.len() != manifest.pairs.len() {
        return Err("results must contain exactly one row for each frozen pair".into());
    }
    let eligible = manifest
        .pairs
        .iter()
        .filter(|pair| {
            by_pair
                .get(&pair.pair_id)
                .is_some_and(|value| value["eligible"] == true)
        })
        .collect::<Vec<_>>();
    let controls = manifest
        .pairs
        .iter()
        .filter(|pair| {
            by_pair
                .get(&pair.pair_id)
                .is_some_and(|value| value["eligible"] == false)
        })
        .collect::<Vec<_>>();
    if eligible.len() < 8 || controls.len() < 4 {
        return Err(format!(
            "listening requires 8 analyzed eligible pairs and 4 Smooth controls; found {} and {}",
            eligible.len(),
            controls.len()
        ));
    }
    let mut rng = SeededRng::new(seed);
    let mut picks = Vec::with_capacity(12);
    let mut eligible = eligible;
    let mut controls = controls;
    rng.shuffle(&mut eligible);
    rng.shuffle(&mut controls);
    for pair in eligible.into_iter().take(8) {
        picks.push(make_pick(
            pair,
            by_pair[&pair.pair_id],
            &root,
            "smart-medley",
        )?);
    }
    for pair in controls.into_iter().take(4) {
        picks.push(make_pick(pair, by_pair[&pair.pair_id], &root, "smooth")?);
    }
    rng.shuffle(&mut picks);
    fs::create_dir_all(out).map_err(|error| format!("cannot create listening output: {error}"))?;
    let mut answers = Vec::with_capacity(12);
    let mut ratings = String::from("id,rating,artifact,notes\n");
    for (index, pick) in picks.iter().enumerate() {
        let id = format!("T{:02}", index + 1);
        let current_bytes = hash_file(&pick.current_path)?;
        let next_bytes = hash_file(&pick.next_path)?;
        if current_bytes != pick.current_clip.sha256 || next_bytes != pick.next_clip.sha256 {
            return Err(format!(
                "frozen clip changed before render: {}",
                pick.pair_id
            ));
        }
        let audio = render_transition(pick, crossfade_seconds)?;
        let path = out.join(format!("{id}.wav"));
        write_new_only(&path, &audio)?;
        answers.push(json!({
            "id": id,
            "pairId": pick.pair_id,
            "condition": pick.condition,
            "reason": pick.transition_id,
            "wavSha256": sha256_bytes(&audio),
            "clipHashes": [pick.current_clip.sha256, pick.next_clip.sha256],
        }));
        ratings.push_str(&format!("{id},,,\n"));
    }
    write_new_only(&out.join("ratings.csv"), ratings.as_bytes())?;
    let answer_key = json!({
        "schemaVersion": "smart-medley-listening-key/v1",
        "seed": seed,
        "manifestSha256": manifest_hash,
        "resultsSha256": hash_file(results_path)?,
        "crossfadeSeconds": crossfade_seconds,
        "offlineRender": true,
        "items": answers,
    });
    write_new_only(&out.join("answer-key.json"), &pretty_json(&answer_key)?)?;
    println!(
        "Rendered 12 offline transitions; answer key is separate in {}",
        out.display()
    );
    Ok(())
}

fn make_pick(
    pair: &Pair,
    result: &Value,
    root: &Path,
    condition: &str,
) -> Result<ListeningPick, String> {
    let current_analysis: SmartMedleyAnalysis =
        serde_json::from_value(result["current"].clone())
            .map_err(|error| format!("invalid current analysis in results: {error}"))?;
    let next_analysis: SmartMedleyAnalysis = serde_json::from_value(result["next"].clone())
        .map_err(|error| format!("invalid next analysis in results: {error}"))?;
    Ok(ListeningPick {
        pair_id: pair.pair_id.clone(),
        condition: condition.into(),
        current_clip: pair.clips[0].clone(),
        next_clip: pair.clips[1].clone(),
        current_path: resolve_clip_path(root, &pair.clips[0])?,
        next_path: resolve_clip_path(root, &pair.clips[1])?,
        current_analysis,
        next_analysis,
        transition_id: string_field(result, "reason")?.to_string(),
    })
}

fn render_transition(pick: &ListeningPick, duration: f64) -> Result<Vec<u8>, String> {
    let current = decode_audio(&pick.current_path)?;
    let next = decode_audio(&pick.next_path)?;
    let current_duration = current.frames.len() as f64 / f64::from(current.sample_rate);
    let next_duration = next.frames.len() as f64 / f64::from(next.sample_rate);
    let (current_start, next_start) = if pick.condition == "smart-medley" {
        let cue_out = pick
            .current_analysis
            .cue_out_seconds
            .ok_or_else(|| format!("eligible result has no outgoing cue: {}", pick.pair_id))?;
        let cue_in = pick
            .next_analysis
            .cue_in_seconds
            .ok_or_else(|| format!("eligible result has no incoming cue: {}", pick.pair_id))?;
        ((cue_out - duration).max(0.0), cue_in)
    } else {
        ((current_duration - duration).max(0.0), 0.0)
    };
    if current_start + duration > current_duration + 0.001
        || next_start + duration > next_duration + 0.001
    {
        return Err(format!(
            "clip is too short for a {duration}-second render: {}",
            pick.pair_id
        ));
    }
    let frame_count = (duration * f64::from(SAMPLE_RATE)) as usize;
    let mut pcm = Vec::with_capacity(frame_count * 4);
    for frame in 0..frame_count {
        let x = frame as f64 / (frame_count - 1) as f64;
        let elapsed_seconds = frame as f64 / f64::from(SAMPLE_RATE);
        // Match PlaybackAudioEngine.curve(): 65 equal-power control points with linear interpolation.
        let curve_position = x * 64.0;
        let lower = curve_position.floor() as usize;
        let upper = (lower + 1).min(64);
        let blend = curve_position - lower as f64;
        let lower_x = lower as f64 / 64.0;
        let upper_x = upper as f64 / 64.0;
        let out_gain = (std::f64::consts::PI * lower_x / 2.0).cos() * (1.0 - blend)
            + (std::f64::consts::PI * upper_x / 2.0).cos() * blend;
        let in_gain = (std::f64::consts::PI * lower_x / 2.0).sin() * (1.0 - blend)
            + (std::f64::consts::PI * upper_x / 2.0).sin() * blend;
        let out_frame = resampled_frame(&current, current_start + elapsed_seconds);
        let in_frame = resampled_frame(&next, next_start + elapsed_seconds);
        for channel in 0..2 {
            let sample = (f64::from(out_frame[channel]) * out_gain
                + f64::from(in_frame[channel]) * in_gain)
                .clamp(-1.0, 1.0);
            pcm.extend_from_slice(&((sample * i16::MAX as f64).round() as i16).to_le_bytes());
        }
    }
    let mut wav = Vec::with_capacity(44 + pcm.len());
    wav.extend_from_slice(b"RIFF");
    wav.extend_from_slice(&(36_u32 + pcm.len() as u32).to_le_bytes());
    wav.extend_from_slice(b"WAVEfmt ");
    wav.extend_from_slice(&16_u32.to_le_bytes());
    wav.extend_from_slice(&1_u16.to_le_bytes());
    wav.extend_from_slice(&CHANNELS.to_le_bytes());
    wav.extend_from_slice(&SAMPLE_RATE.to_le_bytes());
    wav.extend_from_slice(&(SAMPLE_RATE * CHANNELS as u32 * 2).to_le_bytes());
    wav.extend_from_slice(&(CHANNELS * 2).to_le_bytes());
    wav.extend_from_slice(&16_u16.to_le_bytes());
    wav.extend_from_slice(b"data");
    wav.extend_from_slice(&(pcm.len() as u32).to_le_bytes());
    wav.extend_from_slice(&pcm);
    Ok(wav)
}

struct DecodedAudio {
    sample_rate: u32,
    frames: Vec<[f32; 2]>,
}

fn decode_audio(path: &Path) -> Result<DecodedAudio, String> {
    let file = File::open(path).map_err(|error| format!("cannot open audio clip: {error}"))?;
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
        .map_err(|error| format!("audio probe failed: {error}"))?;
    let track = format
        .default_track(TrackType::Audio)
        .ok_or("clip has no audio track")?;
    let track_id = track.id;
    let params = track
        .codec_params
        .as_ref()
        .and_then(|value| value.audio())
        .ok_or("clip has unsupported audio parameters")?;
    let mut decoder = symphonia::default::get_codecs()
        .make_audio_decoder(params, &AudioDecoderOptions::default())
        .map_err(|error| format!("audio decoder unavailable: {error}"))?;
    let mut output_rate = None;
    let mut frames = Vec::new();
    loop {
        let packet = match format.next_packet() {
            Ok(Some(packet)) => packet,
            Ok(None) => break,
            Err(SymphoniaError::ResetRequired) => {
                return Err("clip requires unsupported decoder reset".into())
            }
            Err(error) => return Err(format!("audio packet read failed: {error}")),
        };
        if packet.track_id != track_id {
            continue;
        }
        let decoded = decoder
            .decode(&packet)
            .map_err(|error| format!("audio decode failed: {error}"))?;
        let spec = decoded.spec().clone();
        let channels = spec.channels().count();
        let sample_rate = spec.rate();
        if !(1..=2).contains(&channels) || sample_rate == 0 {
            return Err("offline listening render accepts mono or stereo audio".into());
        }
        if output_rate.is_some_and(|rate| rate != sample_rate) {
            return Err("sample-rate changes within a clip are unsupported".into());
        }
        output_rate = Some(sample_rate);
        let mut samples = Vec::<f32>::new();
        samples.resize(decoded.samples_interleaved(), 0.0);
        decoded.copy_to_slice_interleaved(&mut samples);
        for frame in samples.chunks_exact(channels) {
            let stereo = if channels == 1 {
                [frame[0], frame[0]]
            } else {
                [frame[0], frame[1]]
            };
            frames.push(stereo);
        }
    }
    let sample_rate = output_rate.ok_or("clip has no decoded audio frames")?;
    Ok(DecodedAudio {
        sample_rate,
        frames,
    })
}

fn resampled_frame(audio: &DecodedAudio, seconds: f64) -> [f32; 2] {
    let position = seconds.max(0.0) * f64::from(audio.sample_rate);
    let index = position.floor() as usize;
    let fraction = (position - index as f64) as f32;
    let Some(left) = audio.frames.get(index) else {
        return [0.0, 0.0];
    };
    let Some(right) = audio.frames.get(index + 1) else {
        return *left;
    };
    [
        left[0] + (right[0] - left[0]) * fraction,
        left[1] + (right[1] - left[1]) * fraction,
    ]
}

fn read_results(path: &Path, manifest_hash: &str) -> Result<Vec<Value>, String> {
    let text =
        fs::read_to_string(path).map_err(|error| format!("cannot read result JSONL: {error}"))?;
    let mut output = Vec::new();
    for (index, line) in text.lines().enumerate() {
        if line.trim().is_empty() {
            continue;
        }
        let value: Value = serde_json::from_str(line)
            .map_err(|error| format!("invalid result line {}: {error}", index + 1))?;
        if value["manifestSha256"] != manifest_hash {
            return Err("results were generated from a different frozen manifest".into());
        }
        output.push(value);
    }
    Ok(output)
}

fn read_manifest(path: &Path) -> Result<(Manifest, PathBuf), String> {
    let bytes = fs::read(path).map_err(|error| format!("cannot read manifest: {error}"))?;
    let manifest: Manifest = serde_json::from_slice(&bytes).map_err(|error| error.to_string())?;
    let parent = parent_dir(path);
    let root = fs::canonicalize(parent)
        .map_err(|error| format!("cannot resolve manifest directory: {error}"))?;
    Ok((manifest, root))
}

fn read_frozen_manifest(path: &Path) -> Result<(Manifest, PathBuf, String), String> {
    let (manifest, root) = read_manifest(path)?;
    validate_manifest(&manifest)?;
    let bytes = fs::read(path).map_err(|error| error.to_string())?;
    let actual_hash = sha256_bytes(&bytes);
    let sidecar = path.with_extension("sha256");
    let expected_hash = fs::read_to_string(sidecar)
        .map_err(|_| "frozen manifest SHA-256 sidecar is missing".to_string())?
        .trim()
        .to_ascii_lowercase();
    if actual_hash != expected_hash {
        return Err("frozen manifest file hash changed".into());
    }
    for pair in &manifest.pairs {
        for clip in &pair.clips {
            let clip_path = resolve_clip_path(&root, clip)?;
            if hash_file(&clip_path)? != clip.sha256.to_ascii_lowercase() {
                return Err(format!(
                    "frozen clip hash changed or is missing: {}",
                    clip.clip_id
                ));
            }
        }
    }
    Ok((manifest, root, actual_hash))
}

fn validate_manifest(manifest: &Manifest) -> Result<(), String> {
    if manifest.schema_version != MANIFEST_VERSION {
        return Err(format!(
            "unsupported manifest schema: {}",
            manifest.schema_version
        ));
    }
    if !["synthetic", "creative-commons"].contains(&manifest.source.as_str()) {
        return Err("source must be synthetic or creative-commons".into());
    }
    if manifest.source == "synthetic" && manifest.licence != "generated" {
        return Err("synthetic manifest licence must be generated".into());
    }
    if manifest.pairs.len() != 20 {
        return Err(format!(
            "manifest must contain 20 pairs; found {}",
            manifest.pairs.len()
        ));
    }
    let eligible = manifest
        .pairs
        .iter()
        .filter(|pair| pair.expected_eligibility)
        .count();
    if eligible != 10 {
        return Err(format!(
            "manifest must contain 10 expected-eligible pairs; found {eligible}"
        ));
    }
    let ineligible = manifest.pairs.len() - eligible;
    if ineligible != 10 {
        return Err(format!(
            "manifest must contain 10 expected-ineligible pairs; found {ineligible}"
        ));
    }
    if manifest.source == "creative-commons" {
        if manifest
            .pairs
            .iter()
            .filter(|pair| pair.stratum == "non-music")
            .count()
            != 4
        {
            return Err("Creative Commons manifest needs exactly four non-music pairs".into());
        }
        for clip in manifest.pairs.iter().flat_map(|pair| &pair.clips) {
            if clip.source_url.is_none() || clip.licence.eq_ignore_ascii_case("generated") {
                return Err(format!(
                    "Creative Commons URL and licence are required for {}",
                    clip.clip_id
                ));
            }
        }
    }
    let mut pair_ids = HashSet::new();
    let mut clip_ids = HashSet::new();
    let mut clip_hashes = HashSet::new();
    let pair_prefix = if manifest.source == "synthetic" {
        "SYN"
    } else {
        "CC"
    };
    for (pair_index, pair) in manifest.pairs.iter().enumerate() {
        let expected_pair_id = format!("{pair_prefix}-{:02}", pair_index + 1);
        if pair.pair_id.trim().is_empty()
            || pair.stratum.trim().is_empty()
            || !pair_ids.insert(&pair.pair_id)
        {
            return Err("pair IDs must be nonempty and unique; strata must be nonempty".into());
        }
        if pair.pair_id != expected_pair_id {
            return Err(format!(
                "pair IDs must use the opaque sequence {pair_prefix}-01..{pair_prefix}-20"
            ));
        }
        let expected_for_stratum = match pair.stratum.as_str() {
            "clear-rhythmic" | "ambiguous-high-confidence-compatible" => true,
            "ambiguous-low-confidence"
            | "high-confidence-incompatible"
            | "low-confidence-challenge"
            | "non-music"
            | "low-quality-unsupported"
            | "tempo-mismatch" => false,
            _ => return Err(format!("unsupported evidence stratum: {}", pair.stratum)),
        };
        if pair.expected_eligibility != expected_for_stratum {
            return Err(format!(
                "expected eligibility does not match stratum for {}",
                pair.pair_id
            ));
        }
        for (side, clip) in pair.clips.iter().enumerate() {
            let expected_clip_id =
                format!("{}-{}", pair.pair_id, if side == 0 { "A" } else { "B" });
            if clip.clip_id != expected_clip_id {
                return Err(format!(
                    "clip IDs must be opaque pair-side IDs: {expected_clip_id}"
                ));
            }
            if clip.clip_id.trim().is_empty() || !clip_ids.insert(&clip.clip_id) {
                return Err("clip IDs must be nonempty and unique".into());
            }
            if !is_sha256(&clip.sha256) || !clip_hashes.insert(clip.sha256.to_ascii_lowercase()) {
                return Err(format!("invalid or duplicate SHA-256 for {}", clip.clip_id));
            }
            let labelled = [
                clip.bpm.is_some(),
                clip.tonic.is_some(),
                clip.mode.is_some(),
                clip.cue_in_window.is_some(),
                clip.cue_out_window.is_some(),
            ];
            if labelled.iter().any(|present| *present) && labelled.iter().any(|present| !*present) {
                return Err(format!(
                    "BPM, key and both cue windows must be labeled together for {}",
                    clip.clip_id
                ));
            }
            if let (Some(bpm), Some(tonic), Some(cue_in), Some(cue_out)) = (
                clip.bpm,
                clip.tonic,
                clip.cue_in_window,
                clip.cue_out_window,
            ) {
                if !(60.0..=180.0).contains(&bpm) || tonic > 11 {
                    return Err(format!("invalid reference BPM/key for {}", clip.clip_id));
                }
                for window in [cue_in, cue_out] {
                    if !window.min_seconds.is_finite()
                        || !window.max_seconds.is_finite()
                        || window.min_seconds < 0.0
                        || window.min_seconds > window.max_seconds
                    {
                        return Err(format!("invalid cue window for {}", clip.clip_id));
                    }
                }
            }
            if pair.stratum == "non-music" && labelled.iter().any(|present| *present) {
                return Err(format!(
                    "non-music clips must not claim musical reference labels: {}",
                    clip.clip_id
                ));
            }
            if pair.stratum != "non-music" && !labelled.iter().all(|present| *present) {
                return Err(format!(
                    "music clips must include BPM, key and both cue windows: {}",
                    clip.clip_id
                ));
            }
            if clip.licence.trim().is_empty() || clip.attribution.trim().is_empty() {
                return Err(format!(
                    "licence and attribution are required for {}",
                    clip.clip_id
                ));
            }
            if clip
                .source_url
                .as_ref()
                .is_some_and(|url| !(url.starts_with("https://") || url.starts_with("http://")))
            {
                return Err(format!("source URL must use HTTP(S) for {}", clip.clip_id));
            }
            validate_relative_path(&clip.path)?;
            for key in &clip.allowed_keys {
                if key.tonic_semitone > 11 {
                    return Err(format!("invalid allowed key for {}", clip.clip_id));
                }
            }
        }
    }
    Ok(())
}

fn validate_relative_path(value: &str) -> Result<(), String> {
    let path = Path::new(value);
    if value.trim().is_empty()
        || path.is_absolute()
        || path
            .components()
            .any(|component| !matches!(component, Component::Normal(_)))
        || value.contains(':')
    {
        return Err(format!("clip path must be a safe relative path: {value}"));
    }
    Ok(())
}

fn resolve_clip_path(root: &Path, clip: &Clip) -> Result<PathBuf, String> {
    validate_relative_path(&clip.path)?;
    let path = fs::canonicalize(root.join(&clip.path))
        .map_err(|_| format!("clip is missing or cannot be resolved: {}", clip.clip_id))?;
    if !path.starts_with(root) || !path.is_file() {
        return Err(format!(
            "clip escaped fixture directory or is not a file: {}",
            clip.clip_id
        ));
    }
    Ok(path)
}

fn string_field<'a>(value: &'a Value, field: &str) -> Result<&'a str, String> {
    value[field]
        .as_str()
        .ok_or_else(|| format!("result record missing string field {field}"))
}

fn pretty_json(value: &impl Serialize) -> Result<Vec<u8>, String> {
    let mut bytes = serde_json::to_vec_pretty(value).map_err(|error| error.to_string())?;
    bytes.push(b'\n');
    Ok(bytes)
}

fn hash_file(path: &Path) -> Result<String, String> {
    let mut file =
        File::open(path).map_err(|error| format!("cannot open {}: {error}", path.display()))?;
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let read = file.read(&mut buffer).map_err(|error| error.to_string())?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(hex(&hasher.finalize()))
}

fn sha256_bytes(bytes: &[u8]) -> String {
    hex(&Sha256::digest(bytes))
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn is_sha256(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

struct SeededRng(u64);

impl SeededRng {
    fn new(seed: u64) -> Self {
        Self(seed ^ 0xa076_1d64_78bd_642f)
    }

    fn next(&mut self) -> u64 {
        self.0 = self.0.wrapping_add(0x9e37_79b9_7f4a_7c15);
        let mut value = self.0;
        value = (value ^ (value >> 30)).wrapping_mul(0xbf58_476d_1ce4_e5b9);
        value = (value ^ (value >> 27)).wrapping_mul(0x94d0_49bb_1331_11eb);
        value ^ (value >> 31)
    }

    fn shuffle<T>(&mut self, values: &mut [T]) {
        for index in (1..values.len()).rev() {
            let other = (self.next() as usize) % (index + 1);
            values.swap(index, other);
        }
    }
}
