import type { HealthKitMetric, HealthKitSyncSample } from './types';

interface RawHealthKitSample {
  id?: string;
  uuid?: string;
  startDate?: string;
  endDate?: string;
  date?: string;
  value?: number;
  systolic?: number;
  diastolic?: number;
  bloodPressureSystolicValue?: number;
  bloodPressureDiastolicValue?: number;
  bpm?: number;
  count?: number;
  unit?: string;
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value !== 'number' || Number.isNaN(value) || !Number.isFinite(value)) {
    return null;
  }
  return value;
}

function toIso(value?: string): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function extractDayString(sample: RawHealthKitSample): string {
  if (typeof sample.date === 'string' && sample.date.length >= 10) {
    return sample.date.slice(0, 10);
  }

  if (typeof sample.startDate === 'string' && sample.startDate.length >= 10) {
    return sample.startDate.slice(0, 10);
  }

  return new Date().toISOString().slice(0, 10);
}

export function buildHealthKitV2SourceId(metric: HealthKitMetric, sample: RawHealthKitSample): string {
  if (metric === 'steps') {
    return `steps:day:${extractDayString(sample)}`;
  }

  const uuid = sample.uuid?.trim() || sample.id?.trim();
  if (uuid) {
    return `${metric}:uuid:${uuid}`;
  }

  const start = toIso(sample.startDate) ?? 'unknown';
  const end = toIso(sample.endDate) ?? start;
  return `${metric}:window:${start}:${end}`;
}

export function normalizeHealthKitV2Sample(
  metric: HealthKitMetric,
  raw: unknown,
): HealthKitSyncSample | null {
  const sample = (raw ?? {}) as RawHealthKitSample;
  const dayString = extractDayString(sample);
  const defaultRecordedAt = `${dayString}T12:00:00.000Z`;
  const recordedAt = metric === 'steps'
    ? (toIso(sample.endDate) ?? defaultRecordedAt)
    : (toIso(sample.startDate) ?? toIso(sample.date) ?? new Date().toISOString());
  const sourceId = buildHealthKitV2SourceId(metric, sample);

  if (metric === 'bp') {
    const systolic = toFiniteNumber(sample.systolic ?? sample.bloodPressureSystolicValue ?? sample.value);
    const diastolic = toFiniteNumber(sample.diastolic ?? sample.bloodPressureDiastolicValue);
    if (systolic === null || diastolic === null) return null;

    return {
      metric,
      sourceId,
      recordedAt,
      value: {
        systolic: Math.round(systolic),
        diastolic: Math.round(diastolic),
      },
    };
  }

  if (metric === 'glucose') {
    const reading = toFiniteNumber(sample.value);
    if (reading === null) return null;

    return {
      metric,
      sourceId,
      recordedAt,
      value: { reading: Math.round(reading) },
    };
  }

  if (metric === 'weight') {
    const weight = toFiniteNumber(sample.value);
    if (weight === null) return null;

    return {
      metric,
      sourceId,
      recordedAt,
      value: {
        weight: Number(weight.toFixed(1)),
        unit: sample.unit === 'kg' ? 'kg' : 'lbs',
      },
    };
  }

  if (metric === 'heart_rate') {
    const bpm = toFiniteNumber(sample.bpm ?? sample.value);
    if (bpm === null) return null;

    return {
      metric,
      sourceId,
      recordedAt,
      value: {
        bpm: Math.round(bpm),
      },
    };
  }

  if (metric === 'oxygen_saturation') {
    const rawValue = toFiniteNumber(sample.value);
    if (rawValue === null) return null;
    const percentage = rawValue <= 1 ? rawValue * 100 : rawValue;

    return {
      metric,
      sourceId,
      recordedAt,
      value: {
        percentage: Number(percentage.toFixed(1)),
      },
    };
  }

  if (metric === 'steps') {
    const count = toFiniteNumber(sample.count ?? sample.value);
    if (count === null || count < 0) return null;

    return {
      metric,
      sourceId,
      recordedAt,
      value: {
        count: Math.round(count),
        date: dayString,
      },
    };
  }

  return null;
}
