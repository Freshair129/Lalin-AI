//! RCA diagnostics for the Smart Medley analyzer (ignored by default).
//! See `.brain/rca/2026-11-09-lalin-play-smart-medley-analyzer-confidence.md`.
//! Run: `cargo test --lib smart_medley::rca_probe -- --ignored --nocapture --test-threads=1`.
use super::*;

const SR: u32 = 44_100;
const MAJOR_P: [f64; 12] = [
    6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88,
];
const MINOR_P: [f64; 12] = [
    6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17,
];

#[derive(Clone, Copy)]
struct Synth {
    bpm: f64,
    tonic: i32,
    minor: bool,
    octave_shift: i32,
    tonic_emphasis: f64,
    pulse_seconds: f64,
    fade_ms: f64,
}

fn render(s: Synth) -> Vec<f32> {
    let (scale, profile): ([i32; 7], &[f64; 12]) = if s.minor {
        ([0, 2, 3, 5, 7, 8, 10], &MINOR_P)
    } else {
        ([0, 2, 4, 5, 7, 9, 11], &MAJOR_P)
    };
    let tones: Vec<(f64, f64)> = scale
        .iter()
        .map(|i| {
            let f = 440.0 * (f64::from(s.tonic + i - 9 + 12 * s.octave_shift) / 12.0).exp2();
            let emph = if *i == 0 { s.tonic_emphasis } else { 1.0 };
            (
                std::f64::consts::TAU * f / SR as f64,
                profile[*i as usize] / 6.35 * 0.15 * emph,
            )
        })
        .collect();
    let pulse_len = (SR as f64 * s.pulse_seconds) as usize;
    let fade = (SR as f64 * s.fade_ms / 1000.0) as usize;
    let pulse: Vec<f64> = (0..pulse_len)
        .map(|n| {
            let mut env = 1.0;
            if fade > 0 {
                if n < fade {
                    env = n as f64 / fade as f64;
                } else if n + fade > pulse_len {
                    env = (pulse_len - n) as f64 / fade as f64;
                }
            }
            tones
                .iter()
                .map(|(st, a)| (st * n as f64).sin() * a)
                .sum::<f64>()
                * env
        })
        .collect();
    let frames_per_beat = SR as f64 * 60.0 / s.bpm;
    let mut out = vec![0.0_f32; SR as usize * 60];
    let mut beat = 0.0_f64;
    for (frame, slot) in out.iter_mut().enumerate() {
        let active = frame >= 2 * SR as usize && frame < 52 * SR as usize;
        let v = if active && beat < pulse_len as f64 {
            let v = pulse[beat as usize];
            beat += 1.0;
            v
        } else {
            beat += 1.0;
            0.0
        };
        *slot = ((v.clamp(-0.95, 0.95) * 32767.0).round() / 32767.0) as f32;
        if beat >= frames_per_beat {
            beat -= frames_per_beat;
        }
    }
    out
}

fn analyze(samples: &[f32]) -> (FeatureAccumulator, Option<BpmEstimate>, Option<KeyEstimate>) {
    let mut acc = FeatureAccumulator::new();
    for s in samples {
        acc.push_input(*s, SR);
    }
    let frame_rate = ANALYSIS_SAMPLE_RATE as f64 / FFT_HOP as f64;
    let bpm = estimate_bpm(&acc.onset_strength, frame_rate);
    let key = estimate_key(&acc.chroma);
    (acc, bpm, key)
}

fn key_detail(chroma: &[f64; 12]) -> String {
    let total: f64 = chroma.iter().sum();
    let c = chroma.map(|v| v / total);
    let mut cand = Vec::new();
    for t in 0..12 {
        cand.push((pearson_rotated(&c, &MAJOR_P, t), t, "maj"));
        cand.push((pearson_rotated(&c, &MINOR_P, t), t, "min"));
    }
    cand.sort_by(|a, b| b.0.total_cmp(&a.0));
    let chroma_s: Vec<String> = c.iter().map(|v| format!("{:.3}", v)).collect();
    format!(
        "top=[{} {} {:.3}] [{} {} {:.3}] [{} {} {:.3}] chroma=[{}]",
        cand[0].1,
        cand[0].2,
        cand[0].0,
        cand[1].1,
        cand[1].2,
        cand[1].0,
        cand[2].1,
        cand[2].2,
        cand[2].0,
        chroma_s.join(" ")
    )
}

#[test]
#[ignore]
fn probe_key() {
    let base = Synth {
        bpm: 120.0,
        tonic: 0,
        minor: false,
        octave_shift: 0,
        tonic_emphasis: 2.0,
        pulse_seconds: 0.18,
        fade_ms: 0.0,
    };
    println!("== generator-faithful, all tonics ==");
    for minor in [false, true] {
        for tonic in 0..12 {
            let (acc, _, key) = analyze(&render(Synth {
                tonic,
                minor,
                ..base
            }));
            println!(
                "tonic={tonic:2} minor={minor} conf={:.3} est={:?} {}",
                key.as_ref().map(|k| k.confidence).unwrap_or(-1.0),
                key.as_ref().map(|k| (k.key.tonic, k.key.mode)),
                key_detail(&acc.chroma)
            );
        }
    }
    println!("== C major variants ==");
    for (label, s) in [
        (
            "octave+1",
            Synth {
                octave_shift: 1,
                ..base
            },
        ),
        (
            "octave-1",
            Synth {
                octave_shift: -1,
                ..base
            },
        ),
        (
            "no-emphasis",
            Synth {
                tonic_emphasis: 1.0,
                ..base
            },
        ),
        (
            "fade5ms",
            Synth {
                fade_ms: 5.0,
                ..base
            },
        ),
    ] {
        let (acc, _, key) = analyze(&render(s));
        println!(
            "{label:12} conf={:.3} {}",
            key.as_ref().map(|k| k.confidence).unwrap_or(-1.0),
            key_detail(&acc.chroma)
        );
    }
    // Pure theory: ideal K-S profile chroma itself and generator 7-note chroma.
    let ideal_major = MAJOR_P;
    println!("ideal KS-major chroma: {}", key_detail(&ideal_major));
    let mut seven = [0.0; 12];
    for i in [0usize, 2, 4, 5, 7, 9, 11] {
        seven[i] = MAJOR_P[i] * if i == 0 { 2.0 } else { 1.0 };
    }
    println!("seven-note emph2 (amplitude): {}", key_detail(&seven));
    let mut seven1 = [0.0; 12];
    for i in [0usize, 2, 4, 5, 7, 9, 11] {
        seven1[i] = MAJOR_P[i];
    }
    println!("seven-note emph1 (amplitude): {}", key_detail(&seven1));
}

#[test]
#[ignore]
fn probe_bpm() {
    let base = Synth {
        bpm: 120.0,
        tonic: 9,
        minor: true,
        octave_shift: 0,
        tonic_emphasis: 2.0,
        pulse_seconds: 0.18,
        fade_ms: 0.0,
    };
    for bpm in [
        60.0, 63.0, 66.0, 70.0, 75.0, 80.0, 90.0, 96.0, 100.0, 110.0, 118.0, 120.0, 123.0, 124.0,
        126.0, 128.0, 130.0, 140.0, 150.0, 160.0, 174.0,
    ] {
        let (acc, est, _) = analyze(&render(Synth { bpm, ..base }));
        let frame_rate = ANALYSIS_SAMPLE_RATE as f64 / FFT_HOP as f64;
        let lag_exact = 60.0 * frame_rate / bpm;
        println!(
            "bpm={bpm:5.1} lag={lag_exact:6.2} est={:?} frames={}",
            est.as_ref()
                .map(|e| (e.bpm, (e.confidence * 1000.0).round() / 1000.0)),
            acc.onset_strength.len()
        );
    }
}
