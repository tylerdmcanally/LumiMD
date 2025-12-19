/**
 * LumiBot Medication Nudge Sequences
 * 
 * Standard nudge sequences for medication-related check-ins.
 * Triggered when new medications are started from visit summaries.
 * 
 * Enhanced with condition-specific logging (BP, glucose) for medications
 * that treat trackable conditions.
 */

import type { TrackingType } from './medicationClasses';

// =============================================================================
// Types
// =============================================================================

export type MedNudgeResponseType = 'yes' | 'no' | 'having_issues' | 'good';
export type MedNudgeStepType = 'confirm_yes_no' | 'medication_check' | 'log_reading';

export interface MedNudgeResponse {
    nextStepDay?: number;
    snoozedays?: number;
    message: string;
    action?: 'log_concern' | 'prompt_for_reason';
    complete?: boolean;
}

export interface MedNudgeStep {
    day: number;
    type: MedNudgeStepType;
    title: string;
    messageTemplate: string; // Use {medicationName} and {trackingType} as placeholders
    responses?: Partial<Record<MedNudgeResponseType, MedNudgeResponse>>;
    // For log_reading type steps
    trackingType?: TrackingType; // 'bp' | 'glucose' | 'weight' - filled in dynamically
    recurring?: boolean;
    recurringIntervalDays?: number;
}


export interface MedNudgeSequence {
    id: string;
    name: string;
    trigger: 'medication_started' | 'medication_changed';
    steps: MedNudgeStep[];
}

// =============================================================================
// New Medication Sequence
// =============================================================================

export const newMedicationSequence: MedNudgeSequence = {
    id: 'new_medication',
    name: 'New Medication Check-in',
    trigger: 'medication_started',

    steps: [
        {
            day: 1,
            type: 'confirm_yes_no',
            title: 'Prescription Pickup',
            messageTemplate: "Your doctor started you on {medicationName}. Have you been able to pick it up from the pharmacy?",
            responses: {
                yes: {
                    nextStepDay: 4,
                    message: "Great! Let us know how it goes once you start taking it.",
                },
                no: {
                    snoozedays: 2,
                    message: "No problem! We'll check back in a couple days.",
                },
            },
        },
        {
            day: 4,
            type: 'confirm_yes_no',
            title: 'Getting Started',
            messageTemplate: "How's it going with {medicationName}? Have you been able to start taking it?",
            responses: {
                yes: {
                    nextStepDay: 7,
                    message: "Good to hear! We'll check in again soon.",
                },
                no: {
                    action: 'prompt_for_reason',
                    message: "Is there anything making it difficult to start? Let us know so we can help.",
                },
            },
        },
        // Day 7: First logging nudge (only for trackable meds like BP/glucose)
        {
            day: 7,
            type: 'log_reading',
            title: 'First Check',
            messageTemplate: "Time to log a reading to see how {medicationName} is working.",
            trackingType: null, // Filled dynamically based on medication class
        },
        {
            day: 10,
            type: 'medication_check',
            title: 'Side Effects Check',
            messageTemplate: "You've been on {medicationName} for about a week now. How are you feeling? Any side effects or concerns?",
            responses: {
                good: {
                    nextStepDay: 14,
                    message: "Glad to hear it's going well!",
                },
                having_issues: {
                    action: 'log_concern',
                    message: "Thanks for letting us know. This is worth mentioning to your doctor at your next visit.",
                },
            },
        },
        // Day 14: Second logging nudge
        {
            day: 14,
            type: 'log_reading',
            title: 'Two Week Check',
            messageTemplate: "Let's log another reading to track your progress on {medicationName}.",
            trackingType: null, // Filled dynamically
        },
        {
            day: 28,
            type: 'medication_check',
            title: 'Monthly Check-in',
            messageTemplate: "It's been about a month on {medicationName}. How are things going overall?",
            responses: {
                good: {
                    message: "Great! Keep up the good work.",
                },
                having_issues: {
                    action: 'log_concern',
                    message: "Thanks for sharing. This is definitely worth discussing with your doctor.",
                },
            },
        },
        // Day 28+: Recurring logging nudge every 2 weeks
        {
            day: 28,
            type: 'log_reading',
            title: 'Regular Check',
            messageTemplate: "Time for your regular reading while on {medicationName}.",
            trackingType: null, // Filled dynamically
            recurring: true,
            recurringIntervalDays: 14,
        },
    ],
};


// =============================================================================
// Changed Medication Sequence (shorter check-in)
// =============================================================================

export const changedMedicationSequence: MedNudgeSequence = {
    id: 'changed_medication',
    name: 'Medication Change Check-in',
    trigger: 'medication_changed',

    steps: [
        {
            day: 3,
            type: 'confirm_yes_no',
            title: 'Medication Update',
            messageTemplate: "Your {medicationName} was recently changed. Have you been able to start the new dose or formulation?",
            responses: {
                yes: {
                    nextStepDay: 10,
                    message: "Good! Let us know if you notice any changes.",
                },
                no: {
                    snoozedays: 2,
                    message: "We'll check back in a couple days.",
                },
            },
        },
        {
            day: 10,
            type: 'medication_check',
            title: 'Change Check-in',
            messageTemplate: "How's the change to {medicationName} going? Any differences from before?",
            responses: {
                good: {
                    complete: true,
                    message: "Glad the transition is going smoothly!",
                },
                having_issues: {
                    complete: true,
                    action: 'log_concern',
                    message: "Thanks for letting us know. It's worth mentioning to your doctor how the change is affecting you.",
                },
            },
        },
    ],
};

// =============================================================================
// Sequence Registry
// =============================================================================

export const medicationSequences: MedNudgeSequence[] = [
    newMedicationSequence,
    changedMedicationSequence,
];

/**
 * Get the appropriate medication sequence for a trigger
 */
export function getMedicationSequence(
    trigger: 'medication_started' | 'medication_changed'
): MedNudgeSequence | undefined {
    return medicationSequences.find(s => s.trigger === trigger);
}

/**
 * Generate nudge message from template
 */
export function formatMedicationMessage(template: string, medicationName: string): string {
    return template.replace(/{medicationName}/g, medicationName);
}
