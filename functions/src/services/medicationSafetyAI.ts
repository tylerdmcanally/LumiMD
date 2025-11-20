/**
 * AI-Powered Medication Safety Service
 *
 * Uses OpenAI GPT-4o-mini with PharmD-level prompting to detect:
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
import { MedicationChangeEntry } from './openai';
import { MedicationSafetyWarning, normalizeMedicationName } from './medicationSafety';

const db = () => admin.firestore();
const cacheCollection = () => db().collection('medicationSafetyCache');

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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
const buildCacheDocId = (userId: string, cacheKey: string) => `${userId}_${cacheKey}`;

async function getCachedResult(
  userId: string,
  cacheKey: string
): Promise<MedicationSafetyWarning[] | null> {
  try {
    const docId = buildCacheDocId(userId, cacheKey);
    let cacheDoc = await cacheCollection().doc(docId).get();

    // Backwards compatibility: fall back to legacy doc ID if needed
    if (!cacheDoc.exists) {
      cacheDoc = await cacheCollection().doc(cacheKey).get();
    }

    if (!cacheDoc.exists) {
      return null;
    }

    const data = cacheDoc.data()!;
    const cacheAge = Date.now() - data.createdAt.toMillis();
    const MAX_CACHE_AGE = 30 * 24 * 60 * 60 * 1000; // 30 days

    if (cacheAge > MAX_CACHE_AGE) {
      // Cache expired
      return null;
    }

    functions.logger.info('[medicationSafetyAI] Cache hit', { cacheKey });
    return data.warnings as MedicationSafetyWarning[];
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
  metadata: { newMedication: string; currentMedications: string[]; allergies: string[] }
): Promise<void> {
  try {
    await cacheCollection()
      .doc(buildCacheDocId(userId, cacheKey))
      .set({
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
  allergies: string[]
): string {
  // Simple hash: join all data and hash it
  const data = [
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
export async function clearMedicationSafetyCacheForUser(userId: string): Promise<void> {
  try {
    const snapshot = await cacheCollection().where('userId', '==', userId).get();
    if (snapshot.empty) {
      return;
    }

    let batch = db().batch();
    snapshot.docs.forEach((doc, index) => {
      batch.delete(doc.ref);
      if ((index + 1) % 450 === 0) {
        batch.commit();
        batch = db().batch();
      }
    });

    await batch.commit();
    functions.logger.info('[medicationSafetyAI] Cleared medication safety cache for user', {
      userId,
      deletedDocs: snapshot.size,
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
  excludeMedicationId?: string
): Promise<MedicationSafetyWarning[]> {
  try {
    // Fetch current medications and allergies
    const [medsSnapshot, userDoc] = await Promise.all([
      db().collection('medications').where('userId', '==', userId).get(),
      db().collection('users').doc(userId).get(),
    ]);

    const newMedNormalized = normalizeMedicationName(newMedication.name);

    const activeMedicationDocs = medsSnapshot.docs
      .filter((doc) => {
        if (excludeMedicationId && doc.id === excludeMedicationId) {
          return false;
        }

        const data = doc.data();
        const active = data?.active === true;
        const stopped = Boolean(
          data?.stoppedAt &&
            typeof data.stoppedAt === 'object' &&
            typeof data.stoppedAt.toDate === 'function',
        );
        const deleted = data?.deleted === true || data?.archived === true;
        if (!active || stopped || deleted) {
          return false;
        }

        const medName = typeof data?.name === 'string' ? data.name : '';
        const medNormalized = medName ? normalizeMedicationName(medName) : '';

        if (medNormalized && medNormalized === newMedNormalized) {
          return false;
        }

        return true;
      });

    const currentMedications = activeMedicationDocs.map((doc) => {
      const data = doc.data();
      return formatMedication({
        name: data.name,
        dose: data.dose,
        frequency: data.frequency,
      });
    });

    const allergies = userDoc.exists ? (userDoc.data()?.allergies || []) : [];

    // Generate cache key
    const cacheKey = generateCacheKey(
      formatMedication(newMedication),
      currentMedications,
      allergies
    );

    // Check cache first
    const cachedResult = await getCachedResult(userId, cacheKey);
    if (cachedResult) {
      return cachedResult;
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
      model: 'gpt-4o-mini',
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
    await cacheResult(userId, cacheKey, warnings, {
      newMedication: formatMedication(newMedication),
      currentMedications,
      allergies,
    });

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
