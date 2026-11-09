//! Permanent synthetic regression sweeps for the Smart Medley analyzer.
//! See `.brain/rca/2026-11-09-lalin-play-smart-medley-analyzer-confidence.md`.
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

fn render(s: Synth, duration_seconds: f64) -> Vec<f32> {
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
    let mut out = vec![0.0_f32; (SR as f64 * duration_seconds) as usize];
    let active_start = (duration_seconds * 0.1).min(2.0) * SR as f64;
    let active_end = (duration_seconds * 0.9).min(52.0) * SR as f64;
    let mut beat = 0.0_f64;
    for (frame, slot) in out.iter_mut().enumerate() {
        let active = frame as f64 >= active_start && (frame as f64) < active_end;
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

fn analyze(samples: &[f32]) -> DecodedFeatures {
    let mut acc = FeatureAccumulator::new();
    for s in samples {
        acc.push_input(*s, SR);
    }
    acc.finish(samples.len() as f64 / SR as f64)
}

#[test]
fn generator_key_sweep_covers_all_tonics_modes_and_octaves() {
    let base = Synth {
        bpm: 120.0,
        tonic: 0,
        minor: false,
        octave_shift: 0,
        tonic_emphasis: 2.0,
        pulse_seconds: 0.18,
        fade_ms: 0.0,
    };
    let mut minimum_confidence = 1.0_f64;
    let mut cases = 0;
    for minor in [false, true] {
        for tonic in 0..12 {
            for octave_shift in [-1, 0, 1] {
                // A 0.18 s pure-sine burst is spectrally ~±5.5 Hz wide, wider than half a
                // semitone below ~250 Hz, so the low octave uses 0.30 s notes; the generator's
                // own register (octave 0) keeps its 0.18 s pulses.
                let pulse_seconds = if octave_shift < 0 { 0.30 } else { 0.18 };
                let features = analyze(&render(
                    Synth {
                        tonic,
                        minor,
                        octave_shift,
                        pulse_seconds,
                        ..base
                    },
                    8.0,
                ));
                let estimate = features.key.unwrap_or_else(|| {
                    panic!(
                        "no key estimate for tonic={tonic}, minor={minor}, octave={octave_shift}"
                    )
                });
                let expected_mode = if minor {
                    KeyMode::Minor
                } else {
                    KeyMode::Major
                };
                let correct =
                    estimate.key.tonic == tonic as u8 && estimate.key.mode == expected_mode;
                assert!(
                    correct || estimate.confidence < KEY_CONFIDENCE_FLOOR,
                    "wrong high-confidence key for tonic={tonic}, minor={minor}, octave={octave_shift}: got {:?} at {:.3}",
                    estimate.key,
                    estimate.confidence
                );
                assert!(
                    correct,
                    "wrong key for tonic={tonic}, minor={minor}, octave={octave_shift}: got {:?} at {:.3}",
                    estimate.key,
                    estimate.confidence
                );
                assert!(
                    estimate.confidence >= KEY_CONFIDENCE_FLOOR,
                    "low key confidence for tonic={tonic}, minor={minor}, octave={octave_shift}: {:.3}",
                    estimate.confidence
                );
                minimum_confidence = minimum_confidence.min(estimate.confidence);
                cases += 1;
            }
        }
    }
    println!("key sweep: {cases} cases, minimum confidence {minimum_confidence:.3}");
}

#[test]
fn generator_bpm_sweep_has_no_octave_errors_and_meets_confidence_floor() {
    let base = Synth {
        bpm: 120.0,
        tonic: 9,
        minor: true,
        octave_shift: 0,
        tonic_emphasis: 2.0,
        pulse_seconds: 0.18,
        fade_ms: 0.0,
    };
    let mut tempos: Vec<f64> = (60..=180).step_by(3).map(f64::from).collect();
    tempos.extend((118..=132).map(f64::from));
    tempos.sort_by(f64::total_cmp);
    tempos.dedup();
    let mut minimum_confidence = 1.0_f64;
    let mut maximum_error_percent = 0.0_f64;
    for bpm in &tempos {
        let truth = *bpm;
        let features = analyze(&render(Synth { bpm: truth, ..base }, 20.0));
        let estimate = features
            .bpm
            .unwrap_or_else(|| panic!("no BPM estimate at {truth} BPM"));
        let error_percent = (estimate.bpm - truth).abs() / truth * 100.0;
        assert!(
            error_percent <= 1.5,
            "BPM estimate {:.1} at {bpm:.1} is off by {error_percent:.2}%",
            estimate.bpm
        );
        assert!(
            estimate.confidence >= BPM_CONFIDENCE_FLOOR,
            "BPM confidence {:.3} is below {:.2} at {bpm:.1} BPM (estimate {:.1})",
            estimate.confidence,
            BPM_CONFIDENCE_FLOOR,
            estimate.bpm
        );
        minimum_confidence = minimum_confidence.min(estimate.confidence);
        maximum_error_percent = maximum_error_percent.max(error_percent);
    }
    println!(
        "BPM sweep: {} tempos, minimum confidence {minimum_confidence:.3}, maximum error {maximum_error_percent:.2}%",
        tempos.len()
    );
}

#[test]
fn noise_silence_heavy_and_short_clips_fail_closed() {
    let base = Synth {
        bpm: 120.0,
        tonic: 0,
        minor: false,
        octave_shift: 0,
        tonic_emphasis: 2.0,
        pulse_seconds: 0.18,
        fade_ms: 0.0,
    };

    let mut state = 0x9e37_79b9_7f4a_7c15_u64;
    let noise = (0..SR as usize * 20)
        .map(|_| {
            state ^= state << 13;
            state ^= state >> 7;
            state ^= state << 17;
            (((state >> 32) as u32 as i32) as f64 / i32::MAX as f64 * 0.18) as f32
        })
        .collect::<Vec<_>>();
    assert_below_confidence_floors(&analyze(&noise), "broadband noise");

    let mut sparse = render(base, 20.0);
    let pulse_end = 2 * SR as usize + (SR as f64 * base.pulse_seconds) as usize;
    for (index, sample) in sparse.iter_mut().enumerate() {
        if !(2 * SR as usize..pulse_end).contains(&index) {
            *sample = 0.0;
        }
    }
    assert_below_confidence_floors(&analyze(&sparse), "one pulse in a silence-heavy clip");

    let short = render(base, 4.0);
    assert_below_confidence_floors(&analyze(&short), "four-second clip");
}

fn assert_below_confidence_floors(features: &DecodedFeatures, label: &str) {
    assert!(
        features
            .bpm
            .map_or(true, |estimate| estimate.confidence < BPM_CONFIDENCE_FLOOR),
        "{label} returned BPM confidence at or above the floor: {:?}",
        features.bpm
    );
    assert!(
        features
            .key
            .map_or(true, |estimate| estimate.confidence < KEY_CONFIDENCE_FLOOR),
        "{label} returned key confidence at or above the floor: {:?}",
        features.key
    );
}
