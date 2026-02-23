import axios from 'axios';
import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { externalDrugDataConfig } from '../config';
import type { MedicationChangeEntry } from './openai';
import { MedicationSafetyWarning, normalizeMedicationName } from './medicationSafety';
import { FirestoreExternalDrugSafetyCacheRepository } from './repositories/externalDrugSafetyCache/FirestoreExternalDrugSafetyCacheRepository';
import { ExternalDrugSafetyCacheRepository } from './repositories/externalDrugSafetyCache/ExternalDrugSafetyCacheRepository';

const db = () => admin.firestore();

type ExternalInteraction = {
  description?: string;
  severity?: string;
  rxcui1?: string;
  rxcui2?: string;
  name1?: string;
  name2?: string;
};

type RxNavApproximateResponse = {
  approximateGroup?: {
    candidate?: Array<{ rxcui?: string; score?: string }>;
  };
};

type RxNavInteractionResponse = {
  interactionTypeGroup?: Array<{
    sourceName?: string;
    interactionType?: Array<{
      interactionPair?: Array<{
        interactionConcept?: Array<{
          minConceptItem?: { rxcui?: string; name?: string };
        }>;
        severity?: string;
        description?: string;
      }>;
    }>;
  }>;
};

const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

type ExternalDrugDataDependencies = {
  cacheRepository?: Pick<
    ExternalDrugSafetyCacheRepository,
    'getByUserAndCacheKey' | 'setByUserAndCacheKey'
  >;
  fetchApproximateRxcui?: (term: string) => Promise<string | null>;
  fetchInteractions?: (rxcuis: string[]) => Promise<ExternalInteraction[]>;
};

function resolveDependencies(
  overrides: ExternalDrugDataDependencies = {},
): Required<ExternalDrugDataDependencies> {
  return {
    cacheRepository:
      overrides.cacheRepository ?? new FirestoreExternalDrugSafetyCacheRepository(db()),
    fetchApproximateRxcui: overrides.fetchApproximateRxcui ?? fetchApproximateRxcui,
    fetchInteractions: overrides.fetchInteractions ?? fetchInteractions,
  };
}

const mapSeverity = (value?: string): MedicationSafetyWarning['severity'] => {
  const normalized = (value || '').toLowerCase();
  if (normalized.includes('high')) return 'high';
  if (normalized.includes('moderate')) return 'moderate';
  if (normalized.includes('low')) return 'low';
  return 'moderate';
};

const generateCacheKey = (newRxcui: string, currentRxcuis: string[]): string => {
  const crypto = require('crypto');
  const data = [newRxcui, ...currentRxcuis.slice().sort()].join('|');
  return crypto.createHash('md5').update(data).digest('hex');
};

const getTimestampNow = (): admin.firestore.Timestamp => {
  const firestoreNamespace = admin.firestore as unknown as {
    Timestamp?: { now?: () => admin.firestore.Timestamp };
  };

  if (typeof firestoreNamespace.Timestamp?.now === 'function') {
    return firestoreNamespace.Timestamp.now();
  }

  const now = new Date();
  return {
    toDate: () => now,
    toMillis: () => now.getTime(),
  } as admin.firestore.Timestamp;
};

const getCachedResult = async (
  userId: string,
  cacheKey: string,
  cacheRepository: Pick<ExternalDrugSafetyCacheRepository, 'getByUserAndCacheKey'>,
): Promise<MedicationSafetyWarning[] | null> => {
  try {
    const cacheDoc = await cacheRepository.getByUserAndCacheKey(userId, cacheKey);
    if (!cacheDoc) {
      return null;
    }

    const createdAt = cacheDoc.createdAt;
    if (!createdAt || typeof createdAt.toMillis !== 'function') {
      return null;
    }

    const cacheAge = Date.now() - createdAt.toMillis();
    if (cacheAge > CACHE_TTL_MS) {
      return null;
    }

    functions.logger.info('[externalDrugData] Cache hit', { cacheKey });
    return Array.isArray(cacheDoc.warnings)
      ? (cacheDoc.warnings as MedicationSafetyWarning[])
      : null;
  } catch (error) {
    functions.logger.warn('[externalDrugData] Cache check failed:', error);
    return null;
  }
};

const cacheResult = async (
  userId: string,
  cacheKey: string,
  warnings: MedicationSafetyWarning[],
  metadata: { newRxcui: string; currentRxcuis: string[] },
  cacheRepository: Pick<ExternalDrugSafetyCacheRepository, 'setByUserAndCacheKey'>,
): Promise<void> => {
  try {
    await cacheRepository.setByUserAndCacheKey(userId, cacheKey, {
      warnings,
      createdAt: getTimestampNow(),
      userId,
      newRxcui: metadata.newRxcui,
      currentRxcuis: metadata.currentRxcuis,
    });
  } catch (error) {
    functions.logger.warn('[externalDrugData] Cache write failed:', error);
  }
};

const fetchApproximateRxcui = async (term: string): Promise<string | null> => {
  const normalized = normalizeMedicationName(term);
  if (!normalized) return null;

  const url = `${externalDrugDataConfig.baseUrl}/approximateTerm.json`;
  const response = await axios.get<RxNavApproximateResponse>(url, {
    params: {
      term: normalized,
      maxEntries: 1,
      option: 1,
    },
    timeout: externalDrugDataConfig.timeoutMs,
  });

  const candidate = response.data?.approximateGroup?.candidate?.[0];
  return candidate?.rxcui || null;
};

const fetchInteractions = async (rxcuis: string[]): Promise<ExternalInteraction[]> => {
  const url = `${externalDrugDataConfig.baseUrl}/interaction/list.json`;
  const response = await axios.get<RxNavInteractionResponse>(url, {
    params: {
      rxcuis: rxcuis.join('+'),
    },
    timeout: externalDrugDataConfig.timeoutMs,
  });

  const interactions: ExternalInteraction[] = [];
  const groups = response.data?.interactionTypeGroup || [];
  groups.forEach((group) => {
    group.interactionType?.forEach((type) => {
      type.interactionPair?.forEach((pair) => {
        const concept1 = pair.interactionConcept?.[0]?.minConceptItem;
        const concept2 = pair.interactionConcept?.[1]?.minConceptItem;
        interactions.push({
          description: pair.description,
          severity: pair.severity,
          rxcui1: concept1?.rxcui,
          rxcui2: concept2?.rxcui,
          name1: concept1?.name,
          name2: concept2?.name,
        });
      });
    });
  });

  return interactions;
};

const filterInteractionsForNewMedication = (
  interactions: ExternalInteraction[],
  newRxcui: string,
  currentRxcuis: string[]
): ExternalInteraction[] => {
  const currentSet = new Set(currentRxcuis);
  return interactions.filter((interaction) => {
    if (!interaction.rxcui1 || !interaction.rxcui2) {
      return false;
    }
    const involvesNew =
      interaction.rxcui1 === newRxcui || interaction.rxcui2 === newRxcui;
    const involvesCurrent =
      currentSet.has(interaction.rxcui1) || currentSet.has(interaction.rxcui2);
    return involvesNew && involvesCurrent;
  });
};

const buildRxcuiPair = (interaction: ExternalInteraction): string[] => {
  const pair: string[] = [];
  if (typeof interaction.rxcui1 === 'string' && interaction.rxcui1.length > 0) {
    pair.push(interaction.rxcui1);
  }
  if (typeof interaction.rxcui2 === 'string' && interaction.rxcui2.length > 0) {
    pair.push(interaction.rxcui2);
  }
  return pair;
};

export const runExternalSafetyChecks = async (
  userId: string,
  newMedication: MedicationChangeEntry,
  currentMedications: Array<{ name: string }>,
  dependencyOverrides: ExternalDrugDataDependencies = {},
): Promise<MedicationSafetyWarning[]> => {
  if (!externalDrugDataConfig.enabled) {
    return [];
  }

  const dependencies = resolveDependencies(dependencyOverrides);

  try {
    const newRxcui = await dependencies.fetchApproximateRxcui(newMedication.name);
    if (!newRxcui) {
      return [];
    }

    const currentRxcuis = (
      await Promise.all(
        currentMedications.map((med) => dependencies.fetchApproximateRxcui(med.name))
      )
    ).filter((value): value is string => Boolean(value));

    if (currentRxcuis.length === 0) {
      return [];
    }

    const cacheKey = generateCacheKey(newRxcui, currentRxcuis);
    const cached = await getCachedResult(userId, cacheKey, dependencies.cacheRepository);
    if (cached) {
      return cached;
    }

    const interactions = await dependencies.fetchInteractions([newRxcui, ...currentRxcuis]);
    const relevant = filterInteractionsForNewMedication(
      interactions,
      newRxcui,
      currentRxcuis
    );

    const warnings: MedicationSafetyWarning[] = relevant.map((interaction) => {
      const otherName =
        interaction.rxcui1 === newRxcui ? interaction.name2 : interaction.name1;

      const warning: MedicationSafetyWarning = {
        type: 'drug_interaction',
        severity: mapSeverity(interaction.severity),
        message: 'External interaction detected',
        details: interaction.description || 'External interaction detected.',
        recommendation: 'Discuss this interaction with your provider to ensure safe use.',
        source: 'external',
        externalIds: {
          rxcuiPair: buildRxcuiPair(interaction),
        },
      };

      if (otherName) {
        warning.conflictingMedication = otherName;
      }

      return warning;
    });

    await cacheResult(
      userId,
      cacheKey,
      warnings,
      {
        newRxcui,
        currentRxcuis,
      },
      dependencies.cacheRepository,
    );

    return warnings;
  } catch (error) {
    functions.logger.error('[externalDrugData] External safety checks failed:', error);
    return [];
  }
};
