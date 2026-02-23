/**
 * AI-Powered Medication Safety Service
 *
 * Uses OpenAI GPT-4.1-mini with PharmD-level prompting to detect:
 * - Duplicate therapy
 * - Drug interactions
 * - Allergy conflicts
 *
 * This complements the hardcoded safety checks with comprehensive AI analysis.
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';
import OpenAI from 'openai';
import { openAIConfig } from '../config';
import { MedicationChangeEntry } from './openai';
import { MedicationSafetyWarning, normalizeMedicationName } from './medicationSafety';
import { MedicationDomainService } from './domain/medications/MedicationDomainService';
import { UserDomainService } from './domain/users/UserDomainService';
import { FirestoreMedicationSafetyCacheRepository } from './repositories/medicationSafetyCache/FirestoreMedicationSafetyCacheRepository';
import { MedicationSafetyCacheRepository } from './repositories/medicationSafetyCache/MedicationSafetyCacheRepository';
import { FirestoreMedicationRepository } from './repositories/medications/FirestoreMedicationRepository';
import { FirestoreUserRepository } from './repositories/users/FirestoreUserRepository';

const db = () => admin.firestore();

type MedicationSafetyAIDependencies = {
  medicationService?: Pick<MedicationDomainService, 'listAllForUser'>;
  userService?: Pick<UserDomainService, 'getById'>;
  cacheRepository?: Pick<
    MedicationSafetyCacheRepository,
    'getByUserAndCacheKey' | 'setByUserAndCacheKey' | 'listByUser' | 'deleteByIds'
  >;
};

function resolveDependencies(
  overrides: MedicationSafetyAIDependencies = {},
): Required<MedicationSafetyAIDependencies> {
  return {
    medicationService:
      overrides.medicationService ??
      new MedicationDomainService(new FirestoreMedicationRepository(db())),
    userService:
      overrides.userService ?? new UserDomainService(new FirestoreUserRepository(db())),
    cacheRepository:
      overrides.cacheRepository ?? new FirestoreMedicationSafetyCacheRepository(db()),
  };
}

let openAIClient: OpenAI | null = null;
let openAIWarningLogged = false;

const getOpenAIClient = (): OpenAI | null => {
  if (openAIClient) {
    return openAIClient;
  }

  const apiKey = openAIConfig.apiKey?.trim();

  if (!apiKey) {
    if (!openAIWarningLogged) {
      functions.logger.warn(
        '[medicationSafetyAI] OPENAI_API_KEY not configured; AI safety checks will be skipped'
      );
      openAIWarningLogged = true;
    }
    return null;
  }

  openAIClient = new OpenAI({ apiKey });
  return openAIClient;
};

interface AIWarningResponse {
  warnings: Array<{
    type: 'duplicate_therapy' | 'drug_interaction' | 'allergy_alert';
    severity: 'critical' | 'high' | 'moderate' | 'low';
    message: string;
    details: string;
    conflictingMedication?: string;
    allergen?: string;
    recommendation: string;
    clinicalReasoning: string;
  }>;
  overallAssessment: {
    safe: boolean;
    requiresUrgentAction: boolean;
    summary: string;
  };
}

// Load prompt template
let promptTemplate: string;
try {
  const promptPath = path.join(__dirname, '../../prompts/medication-safety-check.txt');
  promptTemplate = fs.readFileSync(promptPath, 'utf-8');
} catch (error) {
  functions.logger.error('[medicationSafetyAI] Failed to load prompt template:', error);
  // Fallback to embedded prompt if file not found
  promptTemplate = `You are a clinical pharmacist performing medication safety review.

New Medication: {{newMedication}}
Current Medications: {{currentMedications}}
Allergies: {{allergies}}

Analyze for duplicate therapy, drug interactions, and allergy conflicts.
Return JSON: {"warnings": [...], "overallAssessment": {...}}`;
}

/**
 * Render prompt template with variables
 */
function renderPrompt(variables: {
  newMedication: string;
  currentMedications: string;
  allergies: string;
  demographics?: string;
}): string {
  return promptTemplate
    .replace('{{newMedication}}', variables.newMedication)
    .replace('{{currentMedications}}', variables.currentMedications)
    .replace('{{allergies}}', variables.allergies)
    .replace('{{demographics}}', variables.demographics || 'Not provided');
}

/**
 * Format medication for prompt
 */
function formatMedication(med: { name: string; dose?: string; frequency?: string }): string {
  const parts = [med.name];
  if (med.dose) parts.push(med.dose);
  if (med.frequency) parts.push(med.frequency);
  return parts.join(' ');
}

/**
 * Check cache for previous AI safety check results
 * Cache key: hash of (new med name + current med names + allergies)
 */
async function getCachedResult(
  userId: string,
  cacheKey: string,
  cacheRepository: Pick<MedicationSafetyCacheRepository, 'getByUserAndCacheKey'>,
): Promise<MedicationSafetyWarning[] | null> {
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
    const MAX_CACHE_AGE = 30 * 24 * 60 * 60 * 1000; // 30 days

    if (cacheAge > MAX_CACHE_AGE) {
      // Cache expired
      return null;
    }

    functions.logger.info('[medicationSafetyAI] Cache hit', { cacheKey });
    return Array.isArray(cacheDoc.warnings)
      ? (cacheDoc.warnings as MedicationSafetyWarning[])
      : null;
  } catch (error) {
    functions.logger.warn('[medicationSafetyAI] Cache check failed:', error);
    return null;
  }
}

/**
 * Store AI safety check results in cache
 */
async function cacheResult(
  userId: string,
  cacheKey: string,
  warnings: MedicationSafetyWarning[],
  metadata: { newMedication: string; currentMedications: string[]; allergies: string[] },
  cacheRepository: Pick<MedicationSafetyCacheRepository, 'setByUserAndCacheKey'>,
): Promise<void> {
  try {
    await cacheRepository.setByUserAndCacheKey(userId, cacheKey, {
        warnings,
        createdAt: admin.firestore.Timestamp.now(),
        userId,
        newMedication: metadata.newMedication,
        currentMedications: metadata.currentMedications,
        allergies: metadata.allergies,
      });
  } catch (error) {
    functions.logger.warn('[medicationSafetyAI] Cache write failed:', error);
    // Non-critical, continue
  }
}

/**
 * Generate cache key from medication data
 */
function generateCacheKey(
  newMed: string,
  currentMeds: string[],
  allergies: string[],
  canonicalSignature?: { newMedication: string; currentMedications: string[] }
): string {
  // Simple hash: join all data and hash it
  const canonicalParts = canonicalSignature
    ? [canonicalSignature.newMedication.toLowerCase().trim(), ...canonicalSignature.currentMedications.slice().sort()]
    : [];

  const data = [
    ...canonicalParts,
    newMed.toLowerCase().trim(),
    ...currentMeds.map(m => m.toLowerCase().trim()).sort(),
    ...allergies.map(a => a.toLowerCase().trim()).sort(),
  ].join('|');

  // Use Node's crypto for simple hash
  const crypto = require('crypto');
  return crypto.createHash('md5').update(data).digest('hex');
}

/**
 * Convert AI warning to our standard format
 * Note: Only include optional fields if they are defined (Firestore doesn't accept undefined)
 */
function convertAIWarning(aiWarning: AIWarningResponse['warnings'][0]): MedicationSafetyWarning {
  const warning: MedicationSafetyWarning = {
    type: aiWarning.type,
    severity: aiWarning.severity,
    message: aiWarning.message,
    details: aiWarning.details,
    recommendation: aiWarning.recommendation,
  };

  // Only add optional fields if they exist
  if (aiWarning.conflictingMedication) {
    warning.conflictingMedication = aiWarning.conflictingMedication;
  }
  if (aiWarning.allergen) {
    warning.allergen = aiWarning.allergen;
  }

  return warning;
}

/**
 * Run AI-based medication safety checks
 */
export async function clearMedicationSafetyCacheForUser(
  userId: string,
  dependencies: MedicationSafetyAIDependencies = {},
): Promise<void> {
  const resolvedDependencies = resolveDependencies(dependencies);
  try {
    const cachedRecords = await resolvedDependencies.cacheRepository.listByUser(userId);
    if (cachedRecords.length === 0) {
      return;
    }

    const deletedDocs = await resolvedDependencies.cacheRepository.deleteByIds(
      cachedRecords.map((record) => record.id),
    );
    functions.logger.info('[medicationSafetyAI] Cleared medication safety cache for user', {
      userId,
      deletedDocs,
    });
  } catch (error) {
    functions.logger.error('[medicationSafetyAI] Failed to clear cache for user', {
      userId,
      error,
    });
  }
}

export async function runAIBasedSafetyChecks(
  userId: string,
  newMedication: MedicationChangeEntry,
  excludeMedicationId?: string,
  dependencies: MedicationSafetyAIDependencies = {},
): Promise<MedicationSafetyWarning[]> {
  const resolvedDependencies = resolveDependencies(dependencies);
  const medicationService = resolvedDependencies.medicationService;
  const userService = resolvedDependencies.userService;
  const cacheRepository = resolvedDependencies.cacheRepository;

  try {
    // Fetch current medications and allergies
    const [medications, user] = await Promise.all([
      medicationService.listAllForUser(userId, { includeDeleted: true }),
      userService.getById(userId),
    ]);

    const newMedNormalized = normalizeMedicationName(newMedication.name);

    const activeMedications = medications
      .filter((record) => {
        if (excludeMedicationId && record.id === excludeMedicationId) {
          return false;
        }

        const active = record.active === true;
        const stopped = Boolean(
          record.stoppedAt &&
            typeof record.stoppedAt === 'object' &&
            typeof (record.stoppedAt as { toDate?: unknown }).toDate === 'function',
        );
        const deleted = record.deleted === true || record.archived === true;
        if (!active || stopped || deleted) {
          return false;
        }

        const medCanonical =
          (typeof record.canonicalName === 'string' && record.canonicalName) ||
          (typeof record.name === 'string' ? normalizeMedicationName(record.name) : '');

        if (medCanonical && medCanonical === newMedNormalized) {
          return false;
        }

        return true;
      });

    const currentMedications = activeMedications.map((record) => {
      return formatMedication({
        name: record.name,
        dose: record.dose,
        frequency: record.frequency,
      });
    });
    const currentMedCanonicalNames = activeMedications
      .map((record) => {
        if (typeof record.canonicalName === 'string' && record.canonicalName) {
          return record.canonicalName;
        }
        const medName = typeof record.name === 'string' ? record.name : '';
        return medName ? normalizeMedicationName(medName) : null;
      })
      .filter((value): value is string => Boolean(value));

    const allergies = Array.isArray(user?.allergies) ? user.allergies : [];

    // Generate cache key
    const cacheKey = generateCacheKey(
      formatMedication(newMedication),
      currentMedications,
      allergies,
      {
        newMedication: newMedNormalized,
        currentMedications: currentMedCanonicalNames,
      }
    );

    // Check cache first
    const cachedResult = await getCachedResult(userId, cacheKey, cacheRepository);
    if (cachedResult) {
      return cachedResult;
    }

    const openai = getOpenAIClient();
    if (!openai) {
      functions.logger.warn('[medicationSafetyAI] OpenAI client unavailable, skipping AI safety checks', {
        userId,
      });
      return [];
    }

    // Build prompt
    const prompt = renderPrompt({
      newMedication: formatMedication(newMedication),
      currentMedications:
        currentMedications.length > 0
          ? currentMedications.map((m, i) => `${i + 1}. ${m}`).join('\n')
          : 'None',
      allergies: allergies.length > 0 ? allergies.join(', ') : 'None documented',
    });

    functions.logger.info('[medicationSafetyAI] Calling OpenAI for safety check', {
      userId,
      medication: newMedication.name,
      currentMedsCount: currentMedications.length,
      allergiesCount: allergies.length,
    });

    // Call OpenAI
    const startTime = Date.now();
    const response = await openai.chat.completions.create({
      model: 'gpt-4.1-mini',
      store: false, // HIPAA COMPLIANCE: Zero data retention - data deleted immediately after response
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1, // Low temperature for consistent medical analysis
      max_tokens: 2000,
    });

    const duration = Date.now() - startTime;
    const usage = response.usage;

    functions.logger.info('[medicationSafetyAI] OpenAI response received', {
      duration,
      inputTokens: usage?.prompt_tokens,
      outputTokens: usage?.completion_tokens,
      totalTokens: usage?.total_tokens,
      estimatedCost: usage?.total_tokens
        ? ((usage.prompt_tokens * 0.15 + usage.completion_tokens * 0.60) / 1_000_000).toFixed(4)
        : 'unknown',
    });

    // Parse response
    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error('Empty response from OpenAI');
    }

    const aiResponse: AIWarningResponse = JSON.parse(content);

    // Convert to our format
    const warnings = aiResponse.warnings.map(convertAIWarning);

    // Cache result
    await cacheResult(
      userId,
      cacheKey,
      warnings,
      {
        newMedication: formatMedication(newMedication),
        currentMedications,
        allergies,
      },
      cacheRepository,
    );

    // Log warnings for monitoring
    if (warnings.length > 0) {
      functions.logger.warn('[medicationSafetyAI] AI detected warnings', {
        userId,
        medication: newMedication.name,
        warningCount: warnings.length,
        criticalCount: warnings.filter(w => w.severity === 'critical').length,
        highCount: warnings.filter(w => w.severity === 'high').length,
      });
    }

    return warnings;
  } catch (error) {
    functions.logger.error('[medicationSafetyAI] Error running AI safety checks:', error);
    // Return empty array on error - don't block medication sync
    return [];
  }
}

/**
 * Deduplicate warnings from multiple sources (hardcoded + AI)
 * Prioritize higher severity, remove near-duplicates
 */
export function deduplicateWarnings(
  warnings: MedicationSafetyWarning[]
): MedicationSafetyWarning[] {
  if (warnings.length === 0) return [];

  const uniqueWarnings = new Map<string, MedicationSafetyWarning>();

  for (const warning of warnings) {
    // Create a key based on type and conflicting entity
    const key = `${warning.type}-${warning.conflictingMedication || warning.allergen || 'general'}`.toLowerCase();

    const existing = uniqueWarnings.get(key);

    if (!existing) {
      uniqueWarnings.set(key, warning);
    } else {
      // If we have duplicate, keep the higher severity one
      const severityOrder = { critical: 0, high: 1, moderate: 2, low: 3 };
      if (severityOrder[warning.severity] < severityOrder[existing.severity]) {
        uniqueWarnings.set(key, warning);
      }
    }
  }

  // Sort by severity
  const severityOrder = { critical: 0, high: 1, moderate: 2, low: 3 };
  return Array.from(uniqueWarnings.values()).sort(
    (a, b) => severityOrder[a.severity] - severityOrder[b.severity]
  );
}
