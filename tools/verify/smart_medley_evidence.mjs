#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const CONFIDENCE_FLOORS = { bpm: 0.8, key: 0.75, cue: 0.8 };
const FALSE_CONFIDENCE_LIMITS = { bpm: 0.1, key: 0.15, cue: 0.1 };
const WILSON_Z_95 = 1.959963984540054;
const STRATUM_ELIGIBILITY = {
  'clear-rhythmic': true,
  'ambiguous-high-confidence-compatible': true,
  'ambiguous-low-confidence': false,
  'high-confidence-incompatible': false,
  'low-confidence-challenge': false,
  'non-music': false,
  'low-quality-unsupported': false,
  'tempo-mismatch': false,
};

export function wilson95(successes, total) {
  if (!Number.isInteger(successes) || !Number.isInteger(total) || total <= 0 || successes < 0 || successes > total) {
    return null;
  }
  const z2 = WILSON_Z_95 ** 2;
  const p = successes / total;
  const denominator = 1 + z2 / total;
  const center = (p + z2 / (2 * total)) / denominator;
  const margin = WILSON_Z_95 * Math.sqrt((p * (1 - p) / total) + (z2 / (4 * total ** 2))) / denominator;
  return { lower: Math.max(0, center - margin), upper: Math.min(1, center + margin) };
}

export function binaryMetric({ name, successes, total, minimum = 1, rule, pass }) {
  const interval = wilson95(successes, total);
  if (total < minimum) {
    return { name, status: 'INSUFFICIENT_SAMPLE', successes, total, value: total ? successes / total : null, interval, rule };
  }
  const value = successes / total;
  return { name, status: pass(value, successes, total) ? 'PASS' : 'FAIL', successes, total, value, interval, rule };
}

export function falseConfidenceMetric(name, incorrect, accepted, limit) {
  const allowed = Math.floor(limit * accepted);
  const interval = wilson95(incorrect, accepted);
  const rule = `errors <= floor(${limit} x accepted), minimum 20 accepted estimates`;
  if (accepted < 20) {
    return { name, status: 'INSUFFICIENT_SAMPLE', incorrect, accepted, value: accepted ? incorrect / accepted : null, allowed, interval, limit, rule };
  }
  return {
    name,
    status: incorrect <= allowed ? 'PASS' : 'FAIL',
    incorrect,
    accepted,
    value: incorrect / accepted,
    allowed,
    interval,
    limit,
    rule,
  };
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export function verifyFrozenManifest(path) {
  const bytes = readFileSync(path);
  const manifest = JSON.parse(bytes.toString('utf8'));
  if (manifest.schemaVersion !== 'smart-medley-evidence/v1') throw new Error('unsupported manifest schema');
  const root = realpathSync(dirname(resolve(path)));
  const expectedFileHash = readFileSync(path.replace(/\.json$/i, '.sha256'), 'utf8').trim().toLowerCase();
  if (sha256(bytes) !== expectedFileHash) throw new Error('frozen manifest file hash changed');
  for (const pair of manifest.pairs ?? []) {
    for (const clip of pair.clips ?? []) {
      const pathParts = typeof clip.path === 'string' ? clip.path.split(/[\\/]/) : [];
      if (!clip.path || isAbsolute(clip.path) || clip.path.includes(':') || pathParts.some(part => !part || part === '.' || part === '..')) {
        throw new Error(`unsafe relative clip path for ${clip.clipId}`);
      }
      const clipPath = realpathSync(resolve(root, clip.path));
      const rel = relative(root, clipPath);
      if (rel === '..' || rel.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) || isAbsolute(rel)) {
        throw new Error(`clip escaped its fixture directory: ${clip.clipId}`);
      }
      if (sha256(readFileSync(clipPath)) !== String(clip.sha256).toLowerCase()) {
        throw new Error(`frozen clip hash changed: ${clip.clipId}`);
      }
    }
  }
  return { manifest, manifestSha256: sha256(bytes), root };
}

function inWindow(value, window) {
  return Number.isFinite(value)
    && window
    && value >= window.minSeconds - 1e-9
    && value <= window.maxSeconds + 1e-9;
}

function acceptedEstimate(analysis, dimension) {
  if (dimension === 'bpm') return analysis?.bpmConfidence >= CONFIDENCE_FLOORS.bpm;
  if (dimension === 'key') return analysis?.keyConfidence >= CONFIDENCE_FLOORS.key;
  return analysis?.cueConfidence >= CONFIDENCE_FLOORS.cue;
}

function keyMatches(estimate, clip) {
  if (!estimate) return false;
  const allowed = [{ tonicSemitone: clip.tonic, mode: clip.mode }, ...(clip.allowedKeys ?? [])];
  return allowed.some(key => key.tonicSemitone === estimate.tonicSemitone && key.mode === estimate.mode);
}

function readResults(path, manifestSha256) {
  const lines = readFileSync(path, 'utf8').split(/\r?\n/).filter(line => line.trim());
  const results = lines.map((line, index) => {
    try {
      const value = JSON.parse(line);
      if (value.manifestSha256 !== manifestSha256) throw new Error('manifest hash mismatch');
      if (value.schemaVersion !== 'smart-medley-results/v1') throw new Error('unsupported result schema');
      return value;
    } catch (error) {
      throw new Error(`invalid results line ${index + 1}: ${error.message}`);
    }
  });
  return results;
}

function validateResultSet(manifest, results) {
  const byId = new Map();
  for (const result of results) {
    if (byId.has(result.pairId)) throw new Error(`duplicate pair result: ${result.pairId}`);
    byId.set(result.pairId, result);
  }
  if (byId.size !== manifest.pairs.length || manifest.pairs.some(pair => !byId.has(pair.pairId))) {
    throw new Error('results must contain exactly one record for every frozen pair');
  }
  for (const pair of manifest.pairs) {
    if (STRATUM_ELIGIBILITY[pair.stratum] !== pair.expectedEligibility) {
      throw new Error(`expected eligibility does not match stratum for ${pair.pairId}`);
    }
    const result = byId.get(pair.pairId);
    if (typeof result.eligible !== 'boolean' || !result.current || !result.next) {
      throw new Error(`result is missing pair decision or clip estimates for ${pair.pairId}`);
    }
    if (result.expectedEligibility !== pair.expectedEligibility || result.stratum !== pair.stratum) {
      throw new Error(`result labels differ from frozen manifest for ${pair.pairId}`);
    }
    if (JSON.stringify(result.clipHashes) !== JSON.stringify(pair.clips.map(clip => clip.sha256))) {
      throw new Error(`result clip hashes differ from frozen manifest for ${pair.pairId}`);
    }
  }
  return byId;
}

export function summarizeStrata(manifest, results) {
  const byId = validateResultSet(manifest, results);
  const groups = new Map();
  for (const pair of manifest.pairs) {
    const row = groups.get(pair.stratum) ?? {
      stratum: pair.stratum,
      expectedEligibility: pair.expectedEligibility,
      total: 0,
      eligible: 0,
    };
    row.total += 1;
    if (byId.get(pair.pairId).eligible) row.eligible += 1;
    groups.set(pair.stratum, row);
  }
  return [...groups.values()].map(row => ({ ...row, fallback: row.total - row.eligible }));
}

export function computeMetrics(manifest, results) {
  const byId = validateResultSet(manifest, results);
  const expectedEligible = manifest.pairs.filter(pair => pair.expectedEligibility);
  const clearEligible = expectedEligible.filter(pair => pair.stratum === 'clear-rhythmic');
  const expectedIneligible = manifest.pairs.filter(pair => !pair.expectedEligibility);
  const eligibleCount = pairs => pairs.filter(pair => byId.get(pair.pairId).eligible === true).length;
  const rows = [
    binaryMetric({
      name: 'clear coverage',
      successes: eligibleCount(clearEligible),
      total: clearEligible.length,
      rule: 'eligible / clear expected-eligible >= 80%',
      pass: rate => rate >= 0.8,
    }),
    binaryMetric({
      name: 'combined compatible coverage',
      successes: eligibleCount(expectedEligible),
      total: expectedEligible.length,
      rule: 'eligible / all expected-eligible >= 60%',
      pass: rate => rate >= 0.6,
    }),
    binaryMetric({
      name: 'pair false-positive rate',
      successes: eligibleCount(expectedIneligible),
      total: expectedIneligible.length,
      minimum: 20,
      rule: 'false positives <= floor(5% x expected-ineligible pairs), minimum 20 pairs',
      pass: (rate, falsePositives, total) => falsePositives <= Math.floor(0.05 * total),
    }),
  ];

  const dimensionCounts = { bpm: [0, 0], key: [0, 0], cue: [0, 0] };
  for (const pair of manifest.pairs) {
    const result = byId.get(pair.pairId);
    for (let index = 0; index < 2; index += 1) {
      const clip = pair.clips[index];
      const analysis = index === 0 ? result.current : result.next;
      if (clip.bpm != null && acceptedEstimate(analysis, 'bpm')) {
        dimensionCounts.bpm[1] += 1;
        if (!Number.isFinite(analysis.bpm) || Math.abs(analysis.bpm - clip.bpm) > clip.bpm * 0.02 + 1e-9) {
          dimensionCounts.bpm[0] += 1;
        }
      }
      if (clip.tonic != null && clip.mode != null && acceptedEstimate(analysis, 'key')) {
        dimensionCounts.key[1] += 1;
        if (!keyMatches(analysis.key, clip)) dimensionCounts.key[0] += 1;
      }
      if (clip.cueInWindow != null && clip.cueOutWindow != null && acceptedEstimate(analysis, 'cue')) {
        dimensionCounts.cue[1] += 1;
        if (!inWindow(analysis.cueInSeconds, clip.cueInWindow) || !inWindow(analysis.cueOutSeconds, clip.cueOutWindow)) {
          dimensionCounts.cue[0] += 1;
        }
      }
    }
  }
  for (const dimension of ['bpm', 'key', 'cue']) {
    const [incorrect, accepted] = dimensionCounts[dimension];
    rows.push(falseConfidenceMetric(`${dimension} false-confidence`, incorrect, accepted, FALSE_CONFIDENCE_LIMITS[dimension]));
  }

  for (const [name, strata] of [
    ['low-confidence challenge fallback', new Set(['low-confidence-challenge', 'ambiguous-low-confidence'])],
    ['non-music zero suggestions', new Set(['non-music'])],
    ['low-quality zero suggestions', new Set(['low-quality-unsupported'])],
  ]) {
    const subset = manifest.pairs.filter(pair => strata.has(pair.stratum));
    rows.push(binaryMetric({
      name,
      successes: subset.filter(pair => byId.get(pair.pairId).eligible === false).length,
      total: subset.length,
      rule: 'all listed stratum pairs fall back',
      pass: (_rate, fallbacks, total) => fallbacks === total,
    }));
  }
  return rows;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else cell += character;
    } else if (character === '"') quoted = true;
    else if (character === ',') {
      row.push(cell);
      cell = '';
    } else if (character === '\n') {
      row.push(cell.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      cell = '';
    } else cell += character;
  }
  if (quoted) throw new Error('ratings CSV has an unclosed quoted field');
  if (cell.length || row.length) {
    row.push(cell.replace(/\r$/, ''));
    rows.push(row);
  }
  return rows;
}

export function scoreListening(ratingsText, answerKey) {
  const rows = parseCsv(ratingsText);
  const header = rows.shift() ?? [];
  const required = ['id', 'rating', 'artifact', 'notes'];
  if (required.some((field, index) => header[index] !== field)) throw new Error('ratings CSV headers must be id,rating,artifact,notes');
  const ratings = new Map();
  for (const values of rows) {
    if (!values.length || values.every(value => !value.trim())) continue;
    const [id, ratingText, artifactText, notes = ''] = values;
    if (ratings.has(id)) throw new Error(`duplicate rating row: ${id}`);
    const rating = ratingText.trim() ? Number(ratingText) : null;
    const artifact = artifactText.trim().toLowerCase();
    if (rating != null && (!Number.isInteger(rating) || rating < 1 || rating > 5)) throw new Error(`rating must be 1-5 for ${id}`);
    if (artifact && !['yes', 'no'].includes(artifact)) throw new Error(`artifact must be yes/no for ${id}`);
    ratings.set(id, { rating, artifact: artifact || null, notes });
  }
  const items = answerKey.items;
  if (!Array.isArray(items) || items.length !== 12) throw new Error('answer key must contain 12 transitions');
  const ids = items.map(item => item.id);
  if (new Set(ids).size !== 12 || ids.some((id, index) => id !== `T${String(index + 1).padStart(2, '0')}`)) {
    throw new Error('answer key IDs must be unique and ordered T01-T12');
  }
  const smart = items.filter(item => item.condition === 'smart-medley');
  const controls = items.filter(item => item.condition === 'smooth');
  if (smart.length !== 8 || controls.length !== 4) throw new Error('answer key must contain eight Smart Medley and four Smooth transitions');
  const missing = items.filter(item => {
    const rating = ratings.get(item.id);
    return !rating || rating.rating == null || rating.artifact == null;
  }).length;
  const knownIds = new Set(items.map(item => item.id));
  for (const id of ratings.keys()) {
    if (!knownIds.has(id)) throw new Error(`rating ID is not present in answer key: ${id}`);
  }
  const smartRatedAtLeastFour = smart.filter(item => ratings.get(item.id)?.rating >= 4).length;
  const artifacts = items.filter(item => ratings.get(item.id)?.artifact === 'yes').map(item => item.id);
  const complete = missing === 0;
  const status = !complete ? 'INSUFFICIENT_SAMPLE' : smartRatedAtLeastFour >= 6 && artifacts.length === 0 ? 'PASS' : 'FAIL';
  return {
    name: 'blind listening',
    status,
    smartRatedAtLeastFour,
    smartTotal: 8,
    interval: wilson95(smartRatedAtLeastFour, 8),
    artifacts,
    missingRatingsOrFlags: missing,
  };
}

function pct(value) {
  return value == null ? 'n/a' : `${(value * 100).toFixed(1)}%`;
}

function printMetric(row) {
  let result;
  if ('incorrect' in row) {
    result = `${row.incorrect}/${row.accepted} incorrect; allowed ${row.allowed}; ${row.rule}`;
  } else {
    result = `${row.successes}/${row.total} = ${pct(row.value)}; ${row.rule ?? ''}`;
  }
  const interval = row.interval ? `${pct(row.interval.lower)}–${pct(row.interval.upper)}` : 'n/a';
  console.log(`${row.name}\t${row.status}\t${result}\t${interval}`);
}

function parseArgs(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    if (!flag?.startsWith('--') || !argv[index + 1] || values.has(flag)) throw new Error(`invalid or duplicate argument: ${flag ?? ''}`);
    values.set(flag, argv[index + 1]);
  }
  return values;
}

function requiredArg(args, name) {
  const value = args.get(name);
  if (!value) throw new Error(`required argument missing: ${name}`);
  return value;
}

function main() {
  const [command, ...rest] = process.argv.slice(2);
  if (command === '--help' || command === 'help') {
    console.log('Usage: node smart_medley_evidence.mjs score --manifest manifest.frozen.json --results results.jsonl [--also-manifest second.frozen.json --also-results second.jsonl] [--ratings ratings.csv --answer-key answer-key.json]');
    return;
  }
  if (command !== 'score') throw new Error('expected score subcommand; use --help');
  const args = parseArgs(rest);
  const { manifest, manifestSha256 } = verifyFrozenManifest(requiredArg(args, '--manifest'));
  const resultsPath = requiredArg(args, '--results');
  const results = readResults(resultsPath, manifestSha256);
  let metricManifest = manifest;
  let metricResults = results;
  if (args.has('--also-manifest') || args.has('--also-results')) {
    const { manifest: otherManifest, manifestSha256: otherManifestSha256 } = verifyFrozenManifest(requiredArg(args, '--also-manifest'));
    if (otherManifestSha256 === manifestSha256) throw new Error('combined scoring requires two distinct frozen manifests');
    const otherResults = readResults(requiredArg(args, '--also-results'), otherManifestSha256);
    metricManifest = { pairs: [...manifest.pairs, ...otherManifest.pairs] };
    metricResults = [...results, ...otherResults];
  }
  const metrics = computeMetrics(metricManifest, metricResults);
  console.log('Metric\tStatus\tResult and rule\tWilson 95% CI');
  metrics.forEach(printMetric);
  console.log('Stratum\tExpected eligibility\tPairs\tEligible recommendations\tFallbacks');
  summarizeStrata(metricManifest, metricResults).forEach(row => {
    console.log(`${row.stratum}\t${row.expectedEligibility}\t${row.total}\t${row.eligible}\t${row.fallback}`);
  });
  if (args.has('--ratings') || args.has('--answer-key')) {
    const ratings = readFileSync(requiredArg(args, '--ratings'), 'utf8');
    const answerKeyPath = requiredArg(args, '--answer-key');
    const key = JSON.parse(readFileSync(answerKeyPath, 'utf8'));
    if (key.manifestSha256 !== manifestSha256) throw new Error('listening key uses a different frozen manifest');
    if (key.resultsSha256 !== sha256(readFileSync(resultsPath))) throw new Error('listening key uses a different result file');
    const keyDirectory = dirname(resolve(answerKeyPath));
    for (const item of key.items ?? []) {
      if (!/^T(?:0[1-9]|1[0-2])$/.test(item.id) || !/^[a-f0-9]{64}$/i.test(item.wavSha256 ?? '')) {
        throw new Error('listening key contains an invalid transition ID or WAV hash');
      }
      if (sha256(readFileSync(join(keyDirectory, `${item.id}.wav`))) !== item.wavSha256.toLowerCase()) {
        throw new Error(`listening WAV changed for ${item.id}`);
      }
    }
    const listening = scoreListening(ratings, key);
    console.log(`${listening.name}\t${listening.status}\t${listening.smartRatedAtLeastFour}/8 rated ≥4; artifacts: ${listening.artifacts.length}; incomplete: ${listening.missingRatingsOrFlags}\t${pct(listening.interval.lower)}–${pct(listening.interval.upper)}`);
  }
  const statuses = [...metrics.map(metric => metric.status)];
  if (args.has('--ratings') || args.has('--answer-key')) {
    const key = JSON.parse(readFileSync(requiredArg(args, '--answer-key'), 'utf8'));
    statuses.push(scoreListening(readFileSync(requiredArg(args, '--ratings'), 'utf8'), key).status);
  }
  if (statuses.includes('FAIL')) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(`Smart Medley scorer failed: ${error.message}`);
    process.exitCode = 2;
  }
}
