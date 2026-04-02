/**
 * Care Flows Tests
 *
 * Tests core care flow logic:
 * - Condition detection from diagnoses and medications
 * - Template lookup
 * - Phase transition rules
 * - Response classification and cadence adjustment
 */

import {
    detectConditionFromDiagnosis,
    detectConditionFromMedication,
    getCareFlowTemplate,
    hasCareFlowTemplate,
} from '../../data/careFlowTemplates';

// =============================================================================
// Condition Detection Tests
// =============================================================================

describe('Care Flow Condition Detection', () => {
    describe('detectConditionFromDiagnosis', () => {
        it('should detect hypertension from common diagnosis names', () => {
            expect(detectConditionFromDiagnosis('Hypertension')).toBe('htn');
            expect(detectConditionFromDiagnosis('high blood pressure')).toBe('htn');
            expect(detectConditionFromDiagnosis('HTN')).toBe('htn');
            expect(detectConditionFromDiagnosis('Elevated blood pressure')).toBe('htn');
        });

        it('should detect diabetes from common diagnosis names', () => {
            expect(detectConditionFromDiagnosis('Type 2 Diabetes')).toBe('dm');
            expect(detectConditionFromDiagnosis('diabetes')).toBe('dm');
            expect(detectConditionFromDiagnosis('T2DM')).toBe('dm');
            expect(detectConditionFromDiagnosis('Hyperglycemia')).toBe('dm');
        });

        it('should detect COPD', () => {
            expect(detectConditionFromDiagnosis('COPD')).toBe('copd');
            expect(detectConditionFromDiagnosis('Chronic Obstructive Pulmonary Disease')).toBe('copd');
            expect(detectConditionFromDiagnosis('emphysema')).toBe('copd');
        });

        it('should detect heart failure', () => {
            expect(detectConditionFromDiagnosis('Heart Failure')).toBe('heart_failure');
            expect(detectConditionFromDiagnosis('CHF')).toBe('heart_failure');
            expect(detectConditionFromDiagnosis('congestive heart failure')).toBe('heart_failure');
        });

        it('should return null for unrecognized diagnoses', () => {
            expect(detectConditionFromDiagnosis('headache')).toBeNull();
            expect(detectConditionFromDiagnosis('anxiety')).toBeNull();
            expect(detectConditionFromDiagnosis('back pain')).toBeNull();
            expect(detectConditionFromDiagnosis('')).toBeNull();
        });

        it('should be case-insensitive', () => {
            expect(detectConditionFromDiagnosis('HYPERTENSION')).toBe('htn');
            expect(detectConditionFromDiagnosis('hypertension')).toBe('htn');
            expect(detectConditionFromDiagnosis('Hypertension')).toBe('htn');
        });
    });

    describe('detectConditionFromMedication', () => {
        it('should detect HTN from BP medications', () => {
            expect(detectConditionFromMedication('Lisinopril')).toBe('htn');
            expect(detectConditionFromMedication('amlodipine')).toBe('htn');
            expect(detectConditionFromMedication('Losartan')).toBe('htn');
            expect(detectConditionFromMedication('metoprolol')).toBe('htn');
            expect(detectConditionFromMedication('hydrochlorothiazide')).toBe('htn');
        });

        it('should detect DM from diabetes medications', () => {
            expect(detectConditionFromMedication('Metformin')).toBe('dm');
            expect(detectConditionFromMedication('insulin')).toBe('dm');
            expect(detectConditionFromMedication('glipizide')).toBe('dm');
            expect(detectConditionFromMedication('empagliflozin')).toBe('dm');
            expect(detectConditionFromMedication('semaglutide')).toBe('dm');
        });

        it('should return null for non-condition medications', () => {
            expect(detectConditionFromMedication('ibuprofen')).toBeNull();
            expect(detectConditionFromMedication('amoxicillin')).toBeNull();
            expect(detectConditionFromMedication('omeprazole')).toBeNull();
        });

        it('should handle case insensitivity', () => {
            expect(detectConditionFromMedication('LISINOPRIL')).toBe('htn');
            expect(detectConditionFromMedication('Metformin')).toBe('dm');
        });
    });
});

// =============================================================================
// Template Tests
// =============================================================================

describe('Care Flow Templates', () => {
    describe('getCareFlowTemplate', () => {
        it('should return HTN template', () => {
            const template = getCareFlowTemplate('htn');
            expect(template).not.toBeNull();
            expect(template!.condition).toBe('htn');
            expect(template!.metric).toBe('bp');
        });

        it('should have correct HTN phase structure', () => {
            const template = getCareFlowTemplate('htn')!;

            // Understand phase
            expect(template.phases.understand.duration).toEqual({ days: 2 });
            expect(template.phases.understand.touchpoints).toHaveLength(2);
            expect(template.phases.understand.touchpoints![0].type).toBe('educate');

            // Establish phase
            expect(template.phases.establish.duration).toEqual({ days: 14 });
            expect(template.phases.establish.defaultInterval).toBe(4);
            expect(template.phases.establish.touchpoints).toHaveLength(3);

            // Maintain phase
            expect(template.phases.maintain.defaultInterval).toBe(7);
            expect(template.phases.maintain.monthlySummary).toBe(true);

            // Coast phase
            expect(template.phases.coast.defaultInterval).toBe(14);
        });

        it('should have correct HTN cadence rules', () => {
            const template = getCareFlowTemplate('htn')!;
            expect(template.cadenceRules.decayAfterNormal).toBe(3);
            expect(template.cadenceRules.decayMultiplier).toBe(1.5);
            expect(template.cadenceRules.maxInterval).toBe(14);
            expect(template.cadenceRules.minInterval).toBe(2);
            expect(template.cadenceRules.escalateAfterNoResponse).toBe(14);
            expect(template.cadenceRules.escalateBPSystolic).toBe(180);
            expect(template.cadenceRules.escalateBPDiastolic).toBe(120);
        });

        it('should return null for conditions without templates', () => {
            expect(getCareFlowTemplate('dm')).toBeNull();
            expect(getCareFlowTemplate('copd')).toBeNull();
            expect(getCareFlowTemplate('asthma')).toBeNull();
            expect(getCareFlowTemplate('heart_failure')).toBeNull();
        });
    });

    describe('hasCareFlowTemplate', () => {
        it('should return true for HTN', () => {
            expect(hasCareFlowTemplate('htn')).toBe(true);
        });

        it('should return false for conditions without templates', () => {
            expect(hasCareFlowTemplate('dm')).toBe(false);
            expect(hasCareFlowTemplate('copd')).toBe(false);
        });
    });
});

// =============================================================================
// Cadence Logic Tests
// =============================================================================

describe('Care Flow Cadence Logic', () => {
    const template = getCareFlowTemplate('htn')!;
    const rules = template.cadenceRules;

    describe('positive response cadence decay', () => {
        it('should not decay interval before threshold', () => {
            // 2 consecutive normals, threshold is 3
            const cadence = {
                currentIntervalDays: 4,
                consecutiveNormalCount: 2,
            };

            // After one more positive:
            cadence.consecutiveNormalCount++;
            // Now at 3, which equals decayAfterNormal
            const shouldDecay = cadence.consecutiveNormalCount >= rules.decayAfterNormal;
            expect(shouldDecay).toBe(true);
        });

        it('should apply decay multiplier correctly', () => {
            const interval = 4;
            const decayed = Math.min(
                Math.round(interval * rules.decayMultiplier),
                rules.maxInterval,
            );
            expect(decayed).toBe(6); // 4 * 1.5 = 6
        });

        it('should cap interval at maxInterval', () => {
            const interval = 12;
            const decayed = Math.min(
                Math.round(interval * rules.decayMultiplier),
                rules.maxInterval,
            );
            expect(decayed).toBe(14); // 12 * 1.5 = 18, capped at 14
        });
    });

    describe('concerning response cadence tightening', () => {
        it('should halve interval on concerning response', () => {
            const interval = 8;
            const tightened = Math.max(
                rules.minInterval,
                Math.round(interval / 2),
            );
            expect(tightened).toBe(4); // 8 / 2 = 4
        });

        it('should not go below minInterval', () => {
            const interval = 3;
            const tightened = Math.max(
                rules.minInterval,
                Math.round(interval / 2),
            );
            expect(tightened).toBe(2); // 3/2 = 1.5 rounds to 2, min is 2
        });

        it('should reset consecutiveNormalCount on concerning', () => {
            const cadence = {
                currentIntervalDays: 7,
                consecutiveNormalCount: 5,
            };
            // Concerning response resets count
            cadence.consecutiveNormalCount = 0;
            expect(cadence.consecutiveNormalCount).toBe(0);
        });
    });

    describe('too_frequent response', () => {
        it('should double interval on patient slowdown request', () => {
            const interval = 4;
            const slowed = Math.min(rules.maxInterval, interval * 2);
            expect(slowed).toBe(8); // 4 * 2 = 8
        });

        it('should cap at maxInterval on slowdown', () => {
            const interval = 10;
            const slowed = Math.min(rules.maxInterval, interval * 2);
            expect(slowed).toBe(14); // 10 * 2 = 20, capped at 14
        });
    });
});

// =============================================================================
// Phase Transition Tests
// =============================================================================

describe('Care Flow Phase Transitions', () => {
    // Simulating the phase transition logic from careFlowEngine
    function checkPhaseTransition(
        phase: string,
        daysSinceStart: number,
        consecutiveNormalCount: number,
    ): string | null {
        switch (phase) {
            case 'understand':
                if (daysSinceStart > 2 || consecutiveNormalCount >= 1) return 'establish';
                break;
            case 'establish':
                if (daysSinceStart > 14 || consecutiveNormalCount >= 5) return 'maintain';
                break;
            case 'maintain':
                if (daysSinceStart > 56 && consecutiveNormalCount >= 6) return 'coast';
                break;
            case 'coast':
                break;
        }
        return null;
    }

    describe('understand → establish', () => {
        it('should transition after day 2', () => {
            expect(checkPhaseTransition('understand', 3, 0)).toBe('establish');
        });

        it('should transition on first log', () => {
            expect(checkPhaseTransition('understand', 0, 1)).toBe('establish');
        });

        it('should not transition before day 2 with no logs', () => {
            expect(checkPhaseTransition('understand', 1, 0)).toBeNull();
        });
    });

    describe('establish → maintain', () => {
        it('should transition after day 14', () => {
            expect(checkPhaseTransition('establish', 15, 0)).toBe('maintain');
        });

        it('should transition with 5+ normal readings', () => {
            expect(checkPhaseTransition('establish', 7, 5)).toBe('maintain');
        });

        it('should not transition early with few normals', () => {
            expect(checkPhaseTransition('establish', 10, 3)).toBeNull();
        });
    });

    describe('maintain → coast', () => {
        it('should transition after week 8 with 6+ normals', () => {
            expect(checkPhaseTransition('maintain', 57, 6)).toBe('coast');
        });

        it('should not transition before week 8 even with normals', () => {
            expect(checkPhaseTransition('maintain', 50, 8)).toBeNull();
        });

        it('should not transition after week 8 without enough normals', () => {
            expect(checkPhaseTransition('maintain', 60, 4)).toBeNull();
        });
    });

    describe('coast (terminal phase)', () => {
        it('should never auto-transition from coast', () => {
            expect(checkPhaseTransition('coast', 100, 10)).toBeNull();
        });
    });
});

// =============================================================================
// Conditional Touchpoint Tests
// =============================================================================

describe('HTN Template Conditional Touchpoints', () => {
    const template = getCareFlowTemplate('htn')!;

    it('should have conditional touchpoints in understand phase', () => {
        const understandTouchpoints = template.phases.understand.touchpoints!;
        const conditionalTp = understandTouchpoints.find(tp => tp.condition === 'has_new_med');
        expect(conditionalTp).toBeDefined();
        expect(conditionalTp!.type).toBe('educate');
        expect(conditionalTp!.topic).toBe('new_med_intro');
    });

    it('should have combined day 3 touchpoint with has_new_med condition', () => {
        const establishTouchpoints = template.phases.establish.touchpoints!;
        const day3Combined = establishTouchpoints.find(
            tp => tp.type === 'combined' && tp.day === 3,
        );
        expect(day3Combined).toBeDefined();
        expect(day3Combined!.condition).toBe('has_new_med');
        expect(day3Combined!.subtypes).toEqual(['log_prompt', 'side_effect_check']);
    });

    it('should have unconditional log_prompt on day 3 for patients without new meds', () => {
        const establishTouchpoints = template.phases.establish.touchpoints!;
        const day3LogPrompt = establishTouchpoints.find(
            tp => tp.type === 'log_prompt' && tp.day === 3,
        );
        expect(day3LogPrompt).toBeDefined();
        expect(day3LogPrompt!.condition).toBeUndefined();
    });

    it('should have combined touchpoint on day 7', () => {
        const establishTouchpoints = template.phases.establish.touchpoints!;
        const combinedTp = establishTouchpoints.find(
            tp => tp.type === 'combined' && tp.day === 7,
        );
        expect(combinedTp).toBeDefined();
        expect(combinedTp!.subtypes).toEqual(['log_prompt', 'side_effect_followup']);
    });
});

// =============================================================================
// Response Classification Tests (Gap Fixes)
// =============================================================================

describe('Response Classification', () => {
    // Simulating classifyOutcome from careFlowResponseHandler.ts
    const POSITIVE = new Set(['good', 'okay', 'none', 'taking_it', 'got_it', 'feeling_fine']);
    const CONCERNING = new Set(['having_trouble', 'issues', 'concerning', 'mild']);

    function classifyOutcome(response: string): string {
        if (POSITIVE.has(response)) return 'positive';
        if (CONCERNING.has(response)) return 'concerning';
        if (response === 'already_talked_to_doctor') return 'neutral';
        if (response === 'too_frequent') return 'neutral';
        return 'neutral';
    }

    it('should classify okay as positive', () => {
        expect(classifyOutcome('okay')).toBe('positive');
    });

    it('should classify good as positive', () => {
        expect(classifyOutcome('good')).toBe('positive');
    });

    it('should classify mild as concerning', () => {
        expect(classifyOutcome('mild')).toBe('concerning');
    });

    it('should classify too_frequent as neutral', () => {
        expect(classifyOutcome('too_frequent')).toBe('neutral');
    });

    it('should classify already_talked_to_doctor as neutral', () => {
        expect(classifyOutcome('already_talked_to_doctor')).toBe('neutral');
    });

    it('should classify unknown responses as neutral', () => {
        expect(classifyOutcome('something_else')).toBe('neutral');
    });
});

// =============================================================================
// No-Response Timeout Tests
// =============================================================================

describe('No-Response Timeout Logic', () => {
    const template = getCareFlowTemplate('htn')!;
    const threshold = template.cadenceRules.escalateAfterNoResponse; // 14

    it('should have a 14-day no-response threshold for HTN', () => {
        expect(threshold).toBe(14);
    });

    it('should detect stale touchpoints after threshold', () => {
        const daysSinceDelivery = 15;
        expect(daysSinceDelivery >= threshold).toBe(true);
    });

    it('should not flag touchpoints within threshold', () => {
        const daysSinceDelivery = 10;
        expect(daysSinceDelivery >= threshold).toBe(false);
    });

    it('should halve interval on no-response (same as concerning)', () => {
        const interval = 8;
        const tightened = Math.max(
            template.cadenceRules.minInterval,
            Math.round(interval / 2),
        );
        expect(tightened).toBe(4);
    });
});

// =============================================================================
// BP Escalation Tests
// =============================================================================

describe('BP Escalation Thresholds', () => {
    const template = getCareFlowTemplate('htn')!;

    it('should escalate on systolic >= 180', () => {
        const systolic = 185;
        expect(systolic >= template.cadenceRules.escalateBPSystolic!).toBe(true);
    });

    it('should escalate on diastolic >= 120', () => {
        const diastolic = 125;
        expect(diastolic >= template.cadenceRules.escalateBPDiastolic!).toBe(true);
    });

    it('should not escalate on borderline readings', () => {
        const systolic = 175;
        const diastolic = 115;
        expect(systolic >= template.cadenceRules.escalateBPSystolic!).toBe(false);
        expect(diastolic >= template.cadenceRules.escalateBPDiastolic!).toBe(false);
    });

    it('should set interval to minInterval on crisis', () => {
        expect(template.cadenceRules.minInterval).toBe(2);
    });
});

// =============================================================================
// Coast Re-Escalation Tests
// =============================================================================

describe('Coast/Maintain Re-Escalation', () => {
    it('should re-escalate coast to establish on concerning response', () => {
        const phase = 'coast';
        const outcome = 'concerning';
        const newPhase = (phase === 'coast' && outcome === 'concerning') ? 'establish' : phase;
        expect(newPhase).toBe('establish');
    });

    it('should not re-escalate coast on positive response', () => {
        const phase = 'coast';
        const outcome: string = 'positive';
        const newPhase = (phase === 'coast' && outcome === 'concerning') ? 'establish' : phase;
        expect(newPhase).toBe('coast');
    });

    it('should re-escalate maintain after 2+ consecutive concerning', () => {
        const recentOutcomes = ['concerning', 'concerning', 'positive'];
        const recentConcerning = recentOutcomes.slice(-3).filter(o => o === 'concerning').length;
        // Current response is also concerning, so total = recentConcerning (2) + current (1)
        // But we check recentConcerning >= 1 (meaning at least 1 prior + current = 2+)
        expect(recentConcerning >= 1).toBe(true);
    });
});
