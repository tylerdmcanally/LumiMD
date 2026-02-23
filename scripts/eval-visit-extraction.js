#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const DEFAULT_GOLD_PATH = path.resolve(process.cwd(), 'scripts/fixtures/visit-extraction-gold.sample.json');

function readJsonFile(filePath) {
  const resolved = path.resolve(process.cwd(), filePath);
  const raw = fs.readFileSync(resolved, 'utf8');
  return JSON.parse(raw);
}

function normalizeText(value) {
  if (typeof value !== 'string') return '';
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function toUniqueSet(values) {
  const normalized = values
    .map((value) => normalizeText(value))
    .filter(Boolean);
  return new Set(normalized);
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function extractMedicationNames(entries) {
  return asArray(entries)
    .map((entry) => {
      if (typeof entry === 'string') return entry;
      if (entry && typeof entry === 'object' && typeof entry.name === 'string') {
        return entry.name;
      }
      return '';
    })
    .filter(Boolean);
}

function extractFollowUpTasks(entries) {
  return asArray(entries)
    .map((entry) => {
      if (typeof entry === 'string') return entry;
      if (entry && typeof entry === 'object') {
        if (typeof entry.task === 'string') return entry.task;
        if (typeof entry.description === 'string') return entry.description;
      }
      return '';
    })
    .filter(Boolean);
}

function extractCasePayload(caseEntry, preferredKey) {
  if (!caseEntry || typeof caseEntry !== 'object') {
    return {};
  }

  if (preferredKey && caseEntry[preferredKey] && typeof caseEntry[preferredKey] === 'object') {
    return caseEntry[preferredKey];
  }

  if (caseEntry.predicted && typeof caseEntry.predicted === 'object') {
    return caseEntry.predicted;
  }

  if (caseEntry.actual && typeof caseEntry.actual === 'object') {
    return caseEntry.actual;
  }

  if (caseEntry.expected && typeof caseEntry.expected === 'object') {
    return caseEntry.expected;
  }

  return caseEntry;
}

function getFieldValues(payload, fieldPath) {
  if (!payload || typeof payload !== 'object') {
    return [];
  }

  if (fieldPath === 'diagnoses') {
    return asArray(payload.diagnoses).filter((item) => typeof item === 'string');
  }

  if (fieldPath === 'medications.started') {
    return extractMedicationNames(payload.medications && payload.medications.started);
  }

  if (fieldPath === 'medications.stopped') {
    return extractMedicationNames(payload.medications && payload.medications.stopped);
  }

  if (fieldPath === 'medications.changed') {
    return extractMedicationNames(payload.medications && payload.medications.changed);
  }

  if (fieldPath === 'followUps') {
    if (Array.isArray(payload.followUps) && payload.followUps.length > 0) {
      return extractFollowUpTasks(payload.followUps);
    }
    return asArray(payload.nextSteps).filter((item) => typeof item === 'string');
  }

  return [];
}

function scoreSets(expectedSet, predictedSet) {
  let tp = 0;
  expectedSet.forEach((item) => {
    if (predictedSet.has(item)) tp += 1;
  });

  const fp = [...predictedSet].filter((item) => !expectedSet.has(item)).length;
  const fn = [...expectedSet].filter((item) => !predictedSet.has(item)).length;

  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

  return { tp, fp, fn, precision, recall, f1 };
}

function formatPct(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function evaluate(goldCases, predictedCases) {
  const predictedById = new Map();
  predictedCases.forEach((entry) => {
    if (entry && typeof entry.id === 'string') {
      predictedById.set(entry.id, entry);
    }
  });

  const fields = [
    'diagnoses',
    'medications.started',
    'medications.stopped',
    'medications.changed',
    'followUps',
  ];

  const aggregate = {};
  fields.forEach((field) => {
    aggregate[field] = { tp: 0, fp: 0, fn: 0 };
  });

  const perCase = [];

  goldCases.forEach((goldCase) => {
    if (!goldCase || typeof goldCase.id !== 'string') return;

    const predictedCase = predictedById.get(goldCase.id);
    const expectedPayload = extractCasePayload(goldCase, 'expected');
    const predictedPayload = extractCasePayload(predictedCase || {}, 'predicted');

    const caseResult = { id: goldCase.id, fields: {} };

    fields.forEach((field) => {
      const expectedSet = toUniqueSet(getFieldValues(expectedPayload, field));
      const predictedSet = toUniqueSet(getFieldValues(predictedPayload, field));
      const metrics = scoreSets(expectedSet, predictedSet);

      caseResult.fields[field] = metrics;
      aggregate[field].tp += metrics.tp;
      aggregate[field].fp += metrics.fp;
      aggregate[field].fn += metrics.fn;
    });

    perCase.push(caseResult);
  });

  const summary = {};
  let totalTp = 0;
  let totalFp = 0;
  let totalFn = 0;

  fields.forEach((field) => {
    const stats = aggregate[field];
    const precision = stats.tp + stats.fp > 0 ? stats.tp / (stats.tp + stats.fp) : 0;
    const recall = stats.tp + stats.fn > 0 ? stats.tp / (stats.tp + stats.fn) : 0;
    const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

    summary[field] = { ...stats, precision, recall, f1 };
    totalTp += stats.tp;
    totalFp += stats.fp;
    totalFn += stats.fn;
  });

  const microPrecision = totalTp + totalFp > 0 ? totalTp / (totalTp + totalFp) : 0;
  const microRecall = totalTp + totalFn > 0 ? totalTp / (totalTp + totalFn) : 0;
  const microF1 = microPrecision + microRecall > 0
    ? (2 * microPrecision * microRecall) / (microPrecision + microRecall)
    : 0;

  return {
    fields,
    perCase,
    summary,
    micro: {
      tp: totalTp,
      fp: totalFp,
      fn: totalFn,
      precision: microPrecision,
      recall: microRecall,
      f1: microF1,
    },
  };
}

function printResults(result) {
  console.log('\nVisit Extraction Evaluation');
  console.log('===========================');

  console.log('\nField-Level Metrics');
  result.fields.forEach((field) => {
    const metrics = result.summary[field];
    console.log(
      `- ${field}: P=${formatPct(metrics.precision)} R=${formatPct(metrics.recall)} F1=${formatPct(metrics.f1)} ` +
      `(TP=${metrics.tp}, FP=${metrics.fp}, FN=${metrics.fn})`
    );
  });

  console.log('\nMicro Average');
  console.log(
    `- P=${formatPct(result.micro.precision)} R=${formatPct(result.micro.recall)} F1=${formatPct(result.micro.f1)} ` +
    `(TP=${result.micro.tp}, FP=${result.micro.fp}, FN=${result.micro.fn})`
  );

  console.log('\nPer-Case F1 (micro across tracked fields)');
  result.perCase.forEach((caseResult) => {
    let tp = 0;
    let fp = 0;
    let fn = 0;
    result.fields.forEach((field) => {
      tp += caseResult.fields[field].tp;
      fp += caseResult.fields[field].fp;
      fn += caseResult.fields[field].fn;
    });
    const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
    const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
    const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
    console.log(`- ${caseResult.id}: F1=${formatPct(f1)} (TP=${tp}, FP=${fp}, FN=${fn})`);
  });
}

function main() {
  const predictionsPath = process.argv[2];
  const goldPath = process.argv[3] || DEFAULT_GOLD_PATH;

  if (!predictionsPath) {
    console.error('Usage: node scripts/eval-visit-extraction.js <predictions.json> [gold.json]');
    process.exit(1);
  }

  const goldData = readJsonFile(goldPath);
  const predictionsData = readJsonFile(predictionsPath);

  const goldCases = Array.isArray(goldData.cases) ? goldData.cases : [];
  const predictedCases = Array.isArray(predictionsData.cases)
    ? predictionsData.cases
    : Array.isArray(predictionsData)
      ? predictionsData
      : [];

  if (goldCases.length === 0) {
    console.error(`Gold fixture has no cases: ${goldPath}`);
    process.exit(1);
  }

  if (predictedCases.length === 0) {
    console.error(`Predictions fixture has no cases: ${predictionsPath}`);
    process.exit(1);
  }

  const result = evaluate(goldCases, predictedCases);
  printResults(result);
}

main();
