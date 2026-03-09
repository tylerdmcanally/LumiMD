/**
 * Walkthrough Generator
 *
 * Pre-computes a patient-friendly walkthrough from existing visit processing
 * output (VisitSummaryResult). Zero additional LLM calls — reformats the
 * structured data GPT-4 already produced during visit summarization.
 */

import * as functions from 'firebase-functions';
import type { VisitSummaryResult, DiagnosisDetail } from './openai';
import type {
  VisitWalkthrough,
  WalkthroughDiagnosis,
  WalkthroughMedicationStarted,
  WalkthroughMedicationStopped,
  WalkthroughMedicationChanged,
  WalkthroughActionItem,
  WalkthroughTrackingPlan,
  WalkthroughFollowUp,
  WalkthroughSuggestedQuestion,
} from '../types/lumibot';

// =============================================================================
// Constants
// =============================================================================

const MEDICATION_DISCLAIMER = 'Your doctor can tell you more about why this was prescribed for you.';
const MAX_SUGGESTED_QUESTIONS = 3;

// Map condition keywords to health log types for tracking plans
const CONDITION_TO_TRACKING: Record<string, { what: string; why: string }> = {
  hypertension: { what: 'Blood pressure', why: 'To help track how things are going' },
  'high blood pressure': { what: 'Blood pressure', why: 'To help track how things are going' },
  diabetes: { what: 'Blood sugar', why: 'To help track how things are going' },
  'type 2 diabetes': { what: 'Blood sugar', why: 'To help track how things are going' },
  'type 1 diabetes': { what: 'Blood sugar', why: 'To help track how things are going' },
  obesity: { what: 'Weight', why: 'To help track your progress' },
  'weight management': { what: 'Weight', why: 'To help track your progress' },
};

// =============================================================================
// Main Generator
// =============================================================================

export function generateVisitWalkthrough(
  summary: VisitSummaryResult,
): VisitWalkthrough | null {
  try {
    const whatHappened = buildWhatHappened(summary);
    const whatChanged = buildWhatChanged(summary);
    const whatsNext = buildWhatsNext(summary);
    const suggestedQuestions = buildSuggestedQuestions(summary);

    // Skip walkthrough if visit had no meaningful content
    const hasContent =
      whatHappened.diagnoses.length > 0 ||
      whatHappened.keyTopics.length > 0 ||
      whatChanged.medicationsStarted.length > 0 ||
      whatChanged.medicationsStopped.length > 0 ||
      whatChanged.medicationsChanged.length > 0 ||
      whatChanged.newActionItems.length > 0 ||
      whatsNext.followUps.length > 0;

    if (!hasContent) {
      functions.logger.info('[walkthroughGenerator] Skipping — no meaningful content in visit');
      return null;
    }

    return {
      generatedAt: new Date().toISOString(),
      steps: {
        whatHappened,
        whatChanged,
        whatsNext,
      },
      suggestedQuestions,
    };
  } catch (error) {
    functions.logger.error('[walkthroughGenerator] Failed to generate walkthrough:', error);
    return null;
  }
}

// =============================================================================
// Step Builders
// =============================================================================

function buildWhatHappened(summary: VisitSummaryResult): VisitWalkthrough['steps']['whatHappened'] {
  const diagnoses: WalkthroughDiagnosis[] = [];

  // Use diagnosesDetailed if available for richer data
  if (summary.diagnosesDetailed && summary.diagnosesDetailed.length > 0) {
    for (const detail of summary.diagnosesDetailed) {
      const edu = findDiagnosisEducation(summary, detail.name);
      diagnoses.push({
        name: detail.name,
        isNew: detail.status === 'new' || detail.status === 'suspected',
        plainEnglish: edu?.summary || buildDiagnosisPlainEnglish(detail),
      });
    }
  } else if (summary.diagnoses.length > 0) {
    for (const name of summary.diagnoses) {
      const edu = findDiagnosisEducation(summary, name);
      diagnoses.push({
        name,
        isNew: false, // Can't determine from plain string list
        plainEnglish: edu?.summary || 'Discussed during this visit.',
      });
    }
  }

  // Key topics: imaging/labs ordered that aren't follow-ups
  const keyTopics: string[] = [];
  if (summary.testsOrdered) {
    for (const test of summary.testsOrdered) {
      if (test.name) {
        keyTopics.push(test.name);
      }
    }
  } else if (summary.imaging.length > 0) {
    keyTopics.push(...summary.imaging);
  }

  return {
    title: "Here's what we heard",
    diagnoses,
    keyTopics: keyTopics.slice(0, 5),
    flagPrompt: 'Does this sound right? If something seems off, take a look at the full summary. Your care team can help clarify anything.',
  };
}

function buildWhatChanged(summary: VisitSummaryResult): VisitWalkthrough['steps']['whatChanged'] {
  const medicationsStarted: WalkthroughMedicationStarted[] = [];
  const medicationsStopped: WalkthroughMedicationStopped[] = [];
  const medicationsChanged: WalkthroughMedicationChanged[] = [];

  for (const med of summary.medications.started) {
    const edu = findMedicationEducation(summary, med.name);
    medicationsStarted.push({
      name: med.name,
      dose: med.dose || '',
      frequency: med.frequency || '',
      plainEnglish: edu?.purpose || 'Prescribed during this visit.',
      disclaimer: MEDICATION_DISCLAIMER,
    });
  }

  for (const med of summary.medications.stopped) {
    medicationsStopped.push({
      name: med.name,
      plainEnglish: med.note || 'Discontinued during this visit.',
    });
  }

  for (const med of summary.medications.changed) {
    const changeParts: string[] = [];
    if (med.dose) changeParts.push(`Dose: ${med.dose}`);
    if (med.frequency) changeParts.push(`Frequency: ${med.frequency}`);
    const changeDesc = changeParts.length > 0
      ? changeParts.join(', ')
      : (med.note || 'Updated during this visit');

    medicationsChanged.push({
      name: med.name,
      change: changeDesc,
      plainEnglish: med.note || 'Your doctor adjusted this medication.',
    });
  }

  // Action items from follow-ups
  const newActionItems: WalkthroughActionItem[] = [];
  const followUps = summary.followUps || [];
  for (const fu of followUps) {
    newActionItems.push({
      description: fu.task || 'Follow up',
      dueDate: fu.dueAt || fu.timeframe || undefined,
      type: fu.type || undefined,
    });
  }

  // Fallback to nextSteps if no structured follow-ups
  if (newActionItems.length === 0 && summary.nextSteps.length > 0) {
    for (const step of summary.nextSteps) {
      if (step.trim()) {
        newActionItems.push({ description: step.trim() });
      }
    }
  }

  return {
    title: "Here's what changed",
    medicationsStarted,
    medicationsStopped,
    medicationsChanged,
    newActionItems: newActionItems.slice(0, 10),
  };
}

function buildWhatsNext(summary: VisitSummaryResult): VisitWalkthrough['steps']['whatsNext'] {
  // Build tracking plans from diagnoses that map to vitals
  const trackingPlans: WalkthroughTrackingPlan[] = [];
  const seenTrackingTypes = new Set<string>();

  const allDiagnoses = summary.diagnosesDetailed
    ? summary.diagnosesDetailed.map((d) => d.name)
    : summary.diagnoses;

  for (const diagName of allDiagnoses) {
    const lower = diagName.toLowerCase();
    for (const [keyword, tracking] of Object.entries(CONDITION_TO_TRACKING)) {
      if (lower.includes(keyword) && !seenTrackingTypes.has(tracking.what)) {
        seenTrackingTypes.add(tracking.what);
        trackingPlans.push({
          ...tracking,
          when: "I'll check in with you in a few days",
        });
      }
    }
  }

  // Build follow-ups from structured data
  const followUps: WalkthroughFollowUp[] = [];
  const fuItems = summary.followUps || [];
  for (const fu of fuItems) {
    followUps.push({
      description: fu.task || 'Follow up',
      dueBy: fu.dueAt || fu.timeframe || undefined,
    });
  }

  if (followUps.length === 0) {
    for (const step of summary.nextSteps) {
      if (step.trim()) {
        followUps.push({ description: step.trim() });
      }
    }
  }

  return {
    title: "Here's what's coming up",
    trackingPlans,
    followUps: followUps.slice(0, 8),
    closingMessage: "I'll be here if you need anything. Remember, your care team is always the best resource for questions about your health.",
  };
}

function buildSuggestedQuestions(summary: VisitSummaryResult): WalkthroughSuggestedQuestion[] {
  const questions: WalkthroughSuggestedQuestion[] = [];

  // Priority: new medications > changed medications > new diagnoses
  const edu = summary.education || { diagnoses: [], medications: [] };

  // Medication questions (purpose + side effects)
  for (const medEdu of edu.medications) {
    if (questions.length >= MAX_SUGGESTED_QUESTIONS) break;
    if (medEdu.purpose) {
      questions.push({
        question: `What is ${medEdu.name} used for?`,
        answer: medEdu.purpose,
        source: 'visit_education',
      });
    }
  }

  for (const medEdu of edu.medications) {
    if (questions.length >= MAX_SUGGESTED_QUESTIONS) break;
    if (medEdu.sideEffects) {
      questions.push({
        question: `What side effects should I watch for with ${medEdu.name}?`,
        answer: medEdu.sideEffects,
        source: 'visit_education',
      });
    }
  }

  // Diagnosis questions
  for (const diagEdu of edu.diagnoses) {
    if (questions.length >= MAX_SUGGESTED_QUESTIONS) break;
    if (diagEdu.watchFor) {
      questions.push({
        question: `What should I watch for with ${diagEdu.name}?`,
        answer: diagEdu.watchFor,
        source: 'visit_education',
      });
    }
  }

  return questions.slice(0, MAX_SUGGESTED_QUESTIONS);
}

// =============================================================================
// Helpers
// =============================================================================

function findDiagnosisEducation(
  summary: VisitSummaryResult,
  diagnosisName: string,
): { summary?: string; watchFor?: string } | undefined {
  const edu = summary.education?.diagnoses;
  if (!edu) return undefined;
  const lower = diagnosisName.toLowerCase();
  return edu.find((d) => d.name.toLowerCase() === lower);
}

function findMedicationEducation(
  summary: VisitSummaryResult,
  medicationName: string,
): { purpose?: string; sideEffects?: string; whenToCallDoctor?: string } | undefined {
  const edu = summary.education?.medications;
  if (!edu) return undefined;
  const lower = medicationName.toLowerCase();
  return edu.find((m) => m.name.toLowerCase() === lower);
}

function buildDiagnosisPlainEnglish(detail: DiagnosisDetail): string {
  if (detail.status === 'new') {
    return 'Your doctor identified this as a new condition to watch.';
  }
  if (detail.status === 'suspected') {
    return 'Your doctor wants to look into this further.';
  }
  if (detail.status === 'resolved') {
    return 'This condition has been resolved.';
  }
  return 'Discussed during this visit.';
}
