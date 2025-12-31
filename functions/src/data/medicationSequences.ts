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

// Response types mapped to specific question contexts
export type MedNudgeResponseType =
    // Pickup check: Got it / Not yet
    | 'got_it' | 'not_yet'
    // Started check: Taking it / Not yet / Trouble
    | 'taking_it' | 'having_trouble'
    // Feeling/side effects: Good/None / Okay/Mild / Issues/Concerning
    | 'good' | 'okay' | 'issues'
    | 'none' | 'mild' | 'concerning';

// Step types matched to question purpose
export type MedNudgeStepType =
    | 'pickup_check'     // Got it / Not yet
    | 'started_check'    // Taking it / Not yet / Trouble
    | 'feeling_check'    // Good / Okay / Issues
    | 'side_effects'     // None / Mild / Concerning
    | 'log_reading';     // Opens log modal

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
        // Day 1: Pickup check - simple 2 options
        {
            day: 1,
            type: 'pickup_check',
            title: 'Prescription Pickup',
            messageTemplate: "Have you picked up {medicationName} from the pharmacy?",
            responses: {
                got_it: {
                    nextStepDay: 4,
                    message: "Great! We'll check in after you've had a few days to start it.",
                },
                not_yet: {
                    snoozedays: 2,
                    message: "No problem! We'll check back in a couple days.",
                },
            },
        },
        // Day 4: Started check - 3 options including trouble
        {
            day: 4,
            type: 'started_check',
            title: 'Getting Started',
            messageTemplate: "Have you started taking {medicationName}?",
            responses: {
                taking_it: {
                    nextStepDay: 10,
                    message: "Good to hear! We'll check in again soon to see how it's going.",
                },
                not_yet: {
                    snoozedays: 3,
                    message: "No worries! We'll follow up in a few days.",
                },
                having_trouble: {
                    action: 'prompt_for_reason',
                    message: "What's making it difficult? Let us know so we can help.",
                },
            },
        },
        // Day 7: First logging nudge (for trackable meds)
        {
            day: 7,
            type: 'log_reading',
            title: 'First Check',
            messageTemplate: "Time to log a reading to see how {medicationName} is working.",
            trackingType: null, // Filled dynamically
        },
        // Day 10: Side effects check - 3 clear options
        {
            day: 10,
            type: 'side_effects',
            title: 'Side Effects Check',
            messageTemplate: "Any side effects from {medicationName}?",
            responses: {
                none: {
                    nextStepDay: 14,
                    message: "Great! That's good to hear.",
                },
                mild: {
                    nextStepDay: 14,
                    message: "Thanks for letting us know. Mild side effects often improve with time.",
                },
                concerning: {
                    action: 'log_concern',
                    message: "Thanks for telling us. This is worth discussing with your doctor.",
                },
            },
        },
        // Day 14: Second logging nudge
        {
            day: 14,
            type: 'log_reading',
            title: 'Two Week Check',
            messageTemplate: "Let's log another reading to track your progress on {medicationName}.",
            trackingType: null,
        },
        // Day 28: Overall feeling check
        {
            day: 28,
            type: 'feeling_check',
            title: 'Monthly Check-in',
            messageTemplate: "How's {medicationName} working for you overall?",
            responses: {
                good: {
                    message: "Excellent! Keep up the good work.",
                },
                okay: {
                    message: "Thanks for the update. Let us know if anything changes.",
                },
                issues: {
                    action: 'log_concern',
                    message: "Thanks for sharing. This is worth discussing with your doctor.",
                },
            },
        },
        // Day 28+: Recurring logging nudge every 2 weeks
        {
            day: 28,
            type: 'log_reading',
            title: 'Regular Check',
            messageTemplate: "Time for your regular reading while on {medicationName}.",
            trackingType: null,
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
        // Day 3: Started new dose check
        {
            day: 3,
            type: 'started_check',
            title: 'Medication Update',
            messageTemplate: "Have you started the new dose of {medicationName}?",
            responses: {
                taking_it: {
                    nextStepDay: 10,
                    message: "Good! We'll check in to see how it's going.",
                },
                not_yet: {
                    snoozedays: 2,
                    message: "We'll check back in a couple days.",
                },
                having_trouble: {
                    action: 'prompt_for_reason',
                    message: "What's making it difficult? Let us know.",
                },
            },
        },
        // Day 10: Feeling check after change
        {
            day: 10,
            type: 'feeling_check',
            title: 'Change Check-in',
            messageTemplate: "How's the change to {medicationName} going?",
            responses: {
                good: {
                    complete: true,
                    message: "Glad the transition is going smoothly!",
                },
                okay: {
                    complete: true,
                    message: "Thanks for the update. Let us know if anything changes.",
                },
                issues: {
                    complete: true,
                    action: 'log_concern',
                    message: "Thanks for letting us know. Worth mentioning to your doctor.",
                },
            },
        },
    ],
};

// =============================================================================
// Generic Chronic Medication Sequence
// =============================================================================
// For long-term medications that don't have a specific condition protocol
// or trackable metric (BP, glucose, weight). Focus on adherence and side effects.

export const genericChronicMedSequence: MedNudgeSequence = {
    id: 'generic_chronic',
    name: 'Generic Chronic Medication Check-in',
    trigger: 'medication_started',

    steps: [
        // Day 1: Pickup check
        {
            day: 1,
            type: 'pickup_check',
            title: 'Prescription Pickup',
            messageTemplate: "Have you picked up {medicationName} from the pharmacy?",
            responses: {
                got_it: {
                    nextStepDay: 7,
                    message: "Great! We'll check in after you've been taking it.",
                },
                not_yet: {
                    snoozedays: 2,
                    message: "No problem! We'll check back in a couple days.",
                },
            },
        },
        // Day 7: Feeling check
        {
            day: 7,
            type: 'feeling_check',
            title: '1 Week Check-in',
            messageTemplate: "How's {medicationName} going so far?",
            responses: {
                good: {
                    nextStepDay: 14,
                    message: "Glad to hear it's going well!",
                },
                okay: {
                    nextStepDay: 14,
                    message: "Thanks for the update. Let us know if anything changes.",
                },
                issues: {
                    action: 'log_concern',
                    message: "Thanks for letting us know. Worth discussing with your doctor.",
                },
            },
        },
        // Day 14: Side effects check
        {
            day: 14,
            type: 'side_effects',
            title: 'Side Effects Check',
            messageTemplate: "Any side effects from {medicationName}?",
            responses: {
                none: {
                    nextStepDay: 30,
                    message: "Great! That's good to hear.",
                },
                mild: {
                    nextStepDay: 30,
                    message: "Thanks for letting us know. Mild side effects often improve.",
                },
                concerning: {
                    action: 'log_concern',
                    message: "Thanks for sharing. Mention this at your next appointment.",
                },
            },
        },
        // Day 30: Monthly check-in
        {
            day: 30,
            type: 'feeling_check',
            title: '1 Month Check-in',
            messageTemplate: "How's {medicationName} working overall?",
            responses: {
                good: {
                    message: "Excellent! Keep up the good work.",
                },
                okay: {
                    message: "Thanks for the update.",
                },
                issues: {
                    action: 'log_concern',
                    message: "Thanks for letting us know. Valuable feedback for your care team.",
                },
            },
        },
        // Day 90: Quarterly recurring
        {
            day: 90,
            type: 'feeling_check',
            title: 'Quarterly Check-in',
            messageTemplate: "How's {medicationName} working for you?",
            responses: {
                good: {
                    message: "Great to hear you're doing well!",
                },
                okay: {
                    message: "Thanks for the update.",
                },
                issues: {
                    action: 'log_concern',
                    message: "Worth discussing at your next visit.",
                },
            },
            recurring: true,
            recurringIntervalDays: 90,
        },
    ],
};

// =============================================================================
// Sequence Registry
// =============================================================================

export const medicationSequences: MedNudgeSequence[] = [
    newMedicationSequence,
    changedMedicationSequence,
    genericChronicMedSequence,
];

/**
 * Get the appropriate medication sequence for a trigger
 * For 'medication_started': use generic sequence if medication has no trackable type
 */
export function getMedicationSequence(
    trigger: 'medication_started' | 'medication_changed',
    hasTrackingType: boolean = true
): MedNudgeSequence | undefined {
    if (trigger === 'medication_started') {
        // Use generic sequence for meds without BP/glucose/weight tracking
        if (!hasTrackingType) {
            return genericChronicMedSequence;
        }
        return newMedicationSequence;
    }
    return changedMedicationSequence;
}

/**
 * Generate nudge message from template
 */
export function formatMedicationMessage(template: string, medicationName: string): string {
    return template.replace(/{medicationName}/g, medicationName);
}
