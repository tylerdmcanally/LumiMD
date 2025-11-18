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
import { MedicationSafetyWarning } from './medicationSafety';

const db = () => admin.firestore();

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
async function getCachedResult(
  cacheKey: string
): Promise<MedicationSafetyWarning[] | null> {
  try {
    const cacheDoc = await db()
      .collection('medicationSafetyCache')
      .doc(cacheKey)
      .get();

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
  cacheKey: string,
  warnings: MedicationSafetyWarning[]
): Promise<void> {
  try {
    await db()
      .collection('medicationSafetyCache')
      .doc(cacheKey)
      .set({
        warnings,
        createdAt: admin.firestore.Timestamp.now(),
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
 */
function convertAIWarning(aiWarning: AIWarningResponse['warnings'][0]): MedicationSafetyWarning {
  return {
    type: aiWarning.type,
    severity: aiWarning.severity,
    message: aiWarning.message,
    details: aiWarning.details,
    conflictingMedication: aiWarning.conflictingMedication,
    allergen: aiWarning.allergen,
    recommendation: aiWarning.recommendation,
  };
}

/**
 * Run AI-based medication safety checks
 */
export async function runAIBasedSafetyChecks(
  userId: string,
  newMedication: MedicationChangeEntry
): Promise<MedicationSafetyWarning[]> {
  try {
    // Fetch current medications and allergies
    const [medsSnapshot, userDoc] = await Promise.all([
      db()
        .collection('medications')
        .where('userId', '==', userId)
        .where('active', '==', true)
        .get(),
      db().collection('users').doc(userId).get(),
    ]);

    const currentMedications = medsSnapshot.docs.map(doc => {
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
    const cachedResult = await getCachedResult(cacheKey);
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
    await cacheResult(cacheKey, warnings);

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
