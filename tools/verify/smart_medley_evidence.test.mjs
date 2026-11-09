import test from 'node:test';
import assert from 'node:assert/strict';
import { binaryMetric, computeMetrics, falseConfidenceMetric, scoreListening, summarizeStrata, wilson95 } from './smart_medley_evidence.mjs';

test('Wilson 95 percent interval for zero errors in 20 estimates', () => {
  const interval = wilson95(0, 20);
  assert.equal(interval.lower, 0);
  assert.ok(Math.abs(interval.upper - 0.16112515805281938) < 1e-12);
});

test('pair false-positive allowance uses floor rounding', () => {
  const score = successes => binaryMetric({
    name: 'pair FP',
    successes,
    total: 20,
    minimum: 20,
    pass: (_rate, count, total) => count <= Math.floor(0.05 * total),
  });
  assert.equal(score(1).status, 'PASS');
  assert.equal(score(2).status, 'FAIL');
});

test('false-confidence limits floor allowed errors and require 20 accepted estimates', () => {
  assert.equal(falseConfidenceMetric('BPM', 2, 20, 0.1).status, 'PASS');
  assert.equal(falseConfidenceMetric('BPM', 3, 20, 0.1).status, 'FAIL');
  assert.equal(falseConfidenceMetric('key', 0, 19, 0.15).status, 'INSUFFICIENT_SAMPLE');
  assert.equal(falseConfidenceMetric('key', 2, 20, 0.15).allowed, 3);
});

test('coverage reports its denominator and threshold outcome', () => {
  const score = (successes, total) => binaryMetric({
    name: 'coverage',
    successes,
    total,
    pass: rate => rate >= 0.8,
  });
  assert.equal(score(8, 10).status, 'PASS');
  assert.equal(score(7, 10).status, 'FAIL');
  assert.equal(score(0, 0).status, 'INSUFFICIENT_SAMPLE');
});

test('full metric pass uses 20 clear eligible and 20 ineligible pairs with clip-level estimates', () => {
  const makeClip = (clipId, hash) => ({
    clipId,
    sha256: hash,
    bpm: 120,
    tonic: 0,
    mode: 'major',
    cueInWindow: { minSeconds: 1.5, maxSeconds: 2.5 },
    cueOutWindow: { minSeconds: 51.5, maxSeconds: 52.5 },
    allowedKeys: [],
  });
  const analysis = () => ({
    bpm: 120,
    bpmConfidence: 0.9,
    key: { tonicSemitone: 0, mode: 'major' },
    keyConfidence: 0.9,
    cueInSeconds: 2,
    cueOutSeconds: 52,
    cueConfidence: 0.9,
  });
  const pairs = Array.from({ length: 40 }, (_, index) => {
    const expectedEligibility = index < 20;
    const pairId = `P${String(index + 1).padStart(2, '0')}`;
    const clips = [0, 1].map(side => {
      const clipId = `${pairId}-${side}`;
      return makeClip(clipId, (index * 2 + side + 1).toString(16).padStart(64, '0'));
    });
    return { pairId, stratum: expectedEligibility ? 'clear-rhythmic' : 'high-confidence-incompatible', expectedEligibility, clips };
  });
  const manifest = { pairs };
  const results = pairs.map(pair => ({
    pairId: pair.pairId,
    stratum: pair.stratum,
    expectedEligibility: pair.expectedEligibility,
    clipHashes: pair.clips.map(clip => clip.sha256),
    current: analysis(),
    next: analysis(),
    eligible: pair.expectedEligibility,
  }));
  const rows = computeMetrics(manifest, results);
  assert.equal(rows.find(row => row.name === 'clear coverage').status, 'PASS');
  assert.equal(rows.find(row => row.name === 'clear coverage').total, 20);
  assert.equal(rows.find(row => row.name === 'pair false-positive rate').status, 'PASS');
  assert.equal(rows.find(row => row.name === 'bpm false-confidence').accepted, 80);
  assert.equal(rows.find(row => row.name === 'key false-confidence').status, 'PASS');
  assert.equal(rows.find(row => row.name === 'cue false-confidence').status, 'PASS');
  const strata = summarizeStrata(manifest, results);
  assert.equal(strata.find(row => row.stratum === 'clear-rhythmic').eligible, 20);
  assert.equal(strata.find(row => row.stratum === 'high-confidence-incompatible').fallback, 20);
});

test('listening requires six eligible ratings and zero artifact flags in all twelve', () => {
  const items = [
    ...Array.from({ length: 8 }, (_, index) => ({ id: `T${String(index + 1).padStart(2, '0')}`, condition: 'smart-medley' })),
    ...Array.from({ length: 4 }, (_, index) => ({ id: `T${String(index + 9).padStart(2, '0')}`, condition: 'smooth' })),
  ];
  const key = { items };
  const rows = ['id,rating,artifact,notes', ...items.map((item, index) => `${item.id},${index < 6 ? 4 : 3},no,`)].join('\n');
  const listening = scoreListening(rows, key);
  assert.equal(listening.status, 'PASS');
  assert.equal(listening.interval.lower, wilson95(6, 8).lower);
  assert.equal(scoreListening(rows.replace('T12,3,no,', 'T12,3,yes,'), key).status, 'FAIL');
  assert.equal(scoreListening('id,rating,artifact,notes\nT01,5,no,', key).status, 'INSUFFICIENT_SAMPLE');
});
