# Care Flows — Design Document

> Status (2026-03-30): **Planning complete, implementation not started.**
> Replaces the legacy nudge creation system (conditionReminderService, medication-specific nudge triggers).
> App is pre-launch with minimal beta testers — clean replacement, no migration needed.

## 1) Problem Statement

LumiBot's current nudge system is a collection of independent Cloud Functions that each create nudges on their own schedules:

- `conditionReminderService.ts` — hourly, creates BP/glucose check-in nudges
- `medicationFollowUpNudges.ts` — every 15 min, creates "did you take it?" nudges
- `actionItemReminderNudges.ts` — every 15 min, creates action item reminders

**Issues:**
- No unified lifecycle — nudges are independent documents with no concept of "Patient X is in week 2 of their HTN onboarding."
- Cadence is static — conditionProtocols says day 3, 7, then weekly regardless of patient engagement.
- No cross-nudge awareness — medication side-effect check and condition BP prompt can fire on the same day as separate nudges.
- Frequency tuning is trial-and-error — no adaptive logic based on patient responses or logging behavior.
- Debugging is hard — no audit trail showing the full sequence of interactions for a given patient + condition.

## 2) Design Decision: No External Framework

Evaluated: Rasa, Botpress, Temporal, Inngest, LangGraph, Vercel AI SDK, Flowise.

**Conclusion:** None fit. The core problem is proactive scheduled outreach with adaptive timing, not chatbot NLU or LLM orchestration. Chatbot frameworks (Rasa, Botpress) add complexity without solving scheduling. Workflow engines (Temporal, Inngest) solve scheduling but add infrastructure that doesn't justify the complexity for our current scale.

**Approach:** Custom care flow engine in Firestore + Cloud Functions. Lightweight, fits our existing stack, no new infrastructure.

## 3) Core Concept

A **care flow** is a per-patient, per-clinical-event lifecycle document that manages the full journey from diagnosis/medication change through stabilization.

Care flows **produce nudges** — they don't replace the nudge concept. The `nudges/{id}` collection, notification service (`nudgeNotificationService.ts`), mobile UI (`LumiBotContainer.tsx`), and response handler (`routes/nudges.ts`) all stay. The care flow is the brain that decides what nudge to create and when.

```
Visit processing detects clinical change
    ↓
Create careFlow document (one per patient × condition event)
    ↓
Flow engine (scheduled Cloud Function) advances flows:
    - Checks what's due
    - Checks if patient already logged (skip if yes)
    - Generates personalized nudge via AI
    - Creates nudge document
    - Waits for response
    ↓
Patient responds to nudge (existing response handler)
    ↓
Response handler updates care flow:
    - Records outcome
    - Adjusts cadence (widen on success, tighten on concern)
    - Schedules next touchpoint
```

## 4) Interaction Model

**Guided check-ins (model B)** — 2-4 turn branching flows, not open-ended chat.

Example HTN side-effect check:
```
LumiBot: "You're 5 days into amlodipine. Some people notice ankle
          swelling or dizziness. How are you feeling?"
          [Feeling fine] [Having some issues] [Already talked to my doctor]

Patient: [Having some issues]

LumiBot: "What are you experiencing?"
          [Swollen ankles] [Dizzy/lightheaded] [Headaches] [Something else]

Patient: [Dizzy/lightheaded]

LumiBot: "Dizziness can happen as your body adjusts — especially when
          standing up quickly. Stay hydrated and get up slowly. If it
          doesn't improve in a few days, mention it to your doctor.
          We'll check in again in 3 days."
```

**What makes it feel helpful vs. annoying:**
- Every prompt references WHY (connected to their medication, their condition, their data)
- Aware of what they've already done (skip if they logged today)
- Cadence decays on success ("You've been consistent — we'll check in less often now")
- Patient can say "too frequent" and the flow adapts
- Closes the loop (every log produces visible value — trend feedback, progress acknowledgment)

## 5) Phases

Each flow progresses through 4 phases:

### Understand (Days 0-2)
- Post-visit walkthrough covers condition-relevant changes (existing system)
- If new med: "Here's what [med] does and why your doctor prescribed it"
- If new diagnosis: Plain-language explanation personalized to this patient
- Optional 1-turn "tell me more" branch

### Establish (Days 3-14)
- First BP check-in (day 3) — baseline prompt with context on why it matters
- Side-effect check (day 3 for new meds) — drug-specific, AI-generated questions
- Combined touchpoint (day 7) — med + BP in ONE interaction, not two
- Adaptive after day 7 — interval based on engagement and readings
- Side-effect follow-up only if they reported issues earlier

### Maintain (Week 3+)
- Weekly BP prompt (skip weeks where patient logged unprompted)
- Monthly trend summary ("This month your BP averaged X, down from Y")
- Escalate if readings trending up or no engagement for 2+ weeks

### Coast (Week 8+ if stable)
- Biweekly or monthly check-in
- Re-escalate on any concerning reading or new med change
- New visit with BP changes → restart at Phase 1

### Phase transitions
- understand → establish: after day 2 OR first log received
- establish → maintain: after day 14 OR 5+ normal readings
- maintain → coast: after week 8 with consecutiveNormalCount >= 6
- Any → escalate: BP > 180/120, 3+ concerning responses, no engagement 2+ weeks

## 6) Firestore Schema

### `careFlows/{id}`

```typescript
interface CareFlow {
  id: string;
  userId: string;
  visitId: string;

  // Trigger
  trigger: 'new_medication' | 'new_diagnosis' | 'med_change' | 'med_restart';
  condition: 'htn' | 'dm' | 'copd' | 'asthma' | 'heart_failure';

  // Clinical links
  medicationId?: string;
  medicationName?: string;
  diagnosisName?: string;

  // State
  status: 'active' | 'paused' | 'completed' | 'cancelled';
  phase: 'understand' | 'establish' | 'maintain' | 'coast';

  // Adaptive cadence
  cadence: {
    currentIntervalDays: number;
    consecutiveNormalCount: number;
    lastEscalationReason?: string;
    patientRequestedSlowdown?: boolean;
  };

  // Audit trail (append-only)
  touchpoints: CareFlowTouchpoint[];

  // Scheduling (indexed for flow engine query)
  nextTouchpointAt: Timestamp | null;
  nextTouchpointType: string;

  // AI personalization context
  context: {
    visitDate: string;
    providerName?: string;
    medicationDose?: string;
    medicationStartDate?: string;
    knownSideEffects?: string[];        // AI-generated for specific drug
    patientHistory?: string;            // relevant comorbidities
    reportedIssues: string[];           // accumulates from responses
  };

  createdAt: Timestamp;
  updatedAt: Timestamp;
}

interface CareFlowTouchpoint {
  type: 'educate' | 'side_effect_check' | 'log_prompt' | 'trend_summary'
      | 'celebration' | 'escalation' | 'combined';
  scheduledAt: Timestamp;
  deliveredAt?: Timestamp;
  nudgeId?: string;
  responseReceived?: boolean;
  responseValue?: string;
  responseSummary?: string;
  outcome: 'pending' | 'positive' | 'neutral' | 'concerning' | 'no_response';
  phaseAtTime: string;
}
```

### Indexes needed
- `careFlows` composite: `status == 'active'` + `nextTouchpointAt ASC` (flow engine query)
- `careFlows` composite: `userId` + `condition` + `status` (dedup: one active flow per user × condition)

## 7) HTN Flow Template

```typescript
const HTN_FLOW_TEMPLATE = {
  condition: 'htn',
  metric: 'bp',

  phases: {
    understand: {
      duration: { days: 2 },
      touchpoints: [
        { day: 0, type: 'educate', topic: 'what_htn_means' },
        { day: 0, type: 'educate', topic: 'new_med_intro', condition: 'has_new_med' },
      ],
    },
    establish: {
      duration: { days: 14 },
      touchpoints: [
        { day: 3, type: 'log_prompt' },
        { day: 3, type: 'side_effect_check', condition: 'has_new_med' },
        { day: 7, type: 'combined', subtypes: ['log_prompt', 'side_effect_followup'] },
      ],
      defaultInterval: 4,
    },
    maintain: {
      defaultInterval: 7,
      monthlySummary: true,
    },
    coast: {
      defaultInterval: 14,
      monthlySummary: true,
    },
  },

  cadenceRules: {
    decayAfterNormal: 3,
    decayMultiplier: 1.5,
    maxInterval: 14,
    minInterval: 2,
    escalateAfterNoResponse: 14,
    escalateBPSystolic: 180,
    escalateBPDiastolic: 120,
  },
};
```

## 8) Flow Engine — Single Cloud Function

**`advanceCareFlows`** — scheduled every 15 minutes (same cycle as current system).

```
1. Query careFlows WHERE status == 'active' AND nextTouchpointAt <= now
   (batch 100, paginate if needed)

2. For each flow:
   a. Load flow template for this condition

   b. Check: patient already logged what we'd ask for?
      - Query healthLogs WHERE userId AND type == template.metric
        AND createdAt > lastTouchpoint.scheduledAt
      - If yes: skip log prompt, record touchpoint as { outcome: 'positive' },
        advance cadence, schedule next

   c. Check: pending nudge from this flow already exists?
      - If yes: don't double-send, just wait

   d. Determine touchpoint type from phase + template

   e. Generate personalized message via intelligentNudgeGenerator
      - Pass: flow.context, cadence state, recent touchpoints, trend data

   f. Create nudge in nudges/{id} with careFlowId linking back

   g. Append touchpoint to flow.touchpoints

   h. Calculate nextTouchpointAt:
      - Template schedule for fixed touchpoints (day 3, day 7)
      - cadence.currentIntervalDays for adaptive touchpoints
      - Respect quiet hours (9 PM–8 AM user timezone)
      - No more than 1 touchpoint per day per flow

3. Phase transitions (check after each touchpoint):
   - understand → establish: day > 2 OR first log received
   - establish → maintain: day > 14 OR consecutiveNormalCount >= 5
   - maintain → coast: day > 56 AND consecutiveNormalCount >= 6
   - Any → escalation logic runs on every concerning reading
```

## 9) Response Handler Changes

When `POST /v1/nudges/:id/respond` receives a response for a nudge with `careFlowId`:

```
1. Load the care flow
2. Find the touchpoint by nudgeId, update with response data
3. Evaluate outcome:

   Positive ('feeling_fine', 'none', 'taking_it', 'good'):
     → consecutiveNormalCount++
     → If >= decayAfterNormal: currentIntervalDays *= decayMultiplier
     → Dismiss any pending follow-up nudges in this flow

   Concerning ('having_trouble', 'issues', 'concerning'):
     → consecutiveNormalCount = 0
     → currentIntervalDays = max(minInterval, currentIntervalDays / 2)
     → Add detail to context.reportedIssues
     → Schedule follow-up in 3 days

   "Too frequent" (new response option):
     → patientRequestedSlowdown = true
     → currentIntervalDays = min(maxInterval, currentIntervalDays * 2)

   "Already talked to doctor":
     → Record, skip next side-effect check, maintain current cadence

4. Recalculate nextTouchpointAt
5. Save flow
```

## 10) Flow Creation — Post-Visit Hook

In `visitProcessor.ts` post-commit ops (where walkthrough generation and nudge creation already happen):

```
After visit processing completes:
1. Extract condition signals from visit data:
   - New medications matching condition drug lists
   - New diagnoses matching condition names
   - Medication changes (dose, frequency)

2. For each detected condition signal:
   - Check: active care flow already exists for this user × condition?
     - If yes and it's a med change: update flow context, restart at establish phase
     - If no: create new care flow

3. AI generates initial context:
   - Drug-specific side effects for new medications
   - Personalized explanation based on patient history
   - Store in flow.context for use by all future touchpoints
```

## 11) What Gets Deleted

Since we're pre-launch, clean replacement:

| File | Action |
|------|--------|
| `services/conditionReminderService.ts` | **Delete** — replaced by care flow templates + engine |
| `triggers/conditionReminderNudges.ts` (or equivalent scheduler) | **Delete** — replaced by `advanceCareFlows` |
| Condition-specific paths in `triggers/medicationFollowUpNudges.ts` | **Remove** — med follow-ups for condition-linked meds absorbed into flows |
| `data/conditionProtocols.ts` | **Keep + refactor** — thresholds and emergency symptoms stay, nudge schedule config moves to flow templates |

## 12) What Stays Unchanged

| Component | Why |
|-----------|-----|
| `nudges/{id}` collection | Care flows produce nudges as output |
| `nudgeNotificationService.ts` | Delivery pipeline is flow-agnostic |
| `routes/nudges.ts` response handler | Extended (not replaced) to update care flows |
| `intelligentNudgeGenerator.ts` | AI personalization layer reused by flow engine |
| `trendAnalyzer.ts` | Called by flow engine to inform branching |
| `LumiBotContainer.tsx` | Renders nudge cards regardless of source |
| `BPLogModal.tsx`, `PostLogFeedback.tsx` | Health logging UI unchanged |
| `walkthroughGenerator.ts`, `walkthroughQA.ts` | Walkthrough is a separate concern |
| `actionItemReminderNudges.ts` | Action items stay as-is (future: could become flows) |

## 13) Future Conditions

After HTN is solid, generalize with additional templates:

| Condition | Metric | Drug list | Key difference from HTN |
|-----------|--------|-----------|------------------------|
| DM (Type 2) | glucose | metformin, glipizide, insulin, etc. | Glucose has more variance; dietary context matters; A1C milestones |
| COPD | symptoms, O2 | inhalers, bronchodilators | Symptom-based (not metric-based); exacerbation detection |
| Asthma | symptoms, peak flow | inhalers, corticosteroids | Trigger tracking; rescue inhaler usage as signal |
| Heart Failure | weight, symptoms | diuretics, ACE inhibitors, beta-blockers | Daily weight is critical (fluid retention); symptom escalation is faster |

The template structure should accommodate these differences without code changes — just new template definitions.

## 14) Implementation Order

1. **Types + schema** — `CareFlow`, `CareFlowTouchpoint`, `CareFlowTemplate` interfaces
2. **HTN flow template** — condition-specific config in `data/careFlowTemplates.ts`
3. **Flow creation** — hook into visit post-processing to detect HTN signals and create flows
4. **Flow engine** — `advanceCareFlows` Cloud Function (the single scheduler)
5. **Response handler integration** — extend `POST /v1/nudges/:id/respond` to update flows
6. **AI message generation** — adapt `intelligentNudgeGenerator` to accept flow context
7. **"Skip if already logged" logic** — query healthLogs before creating log prompts
8. **Phase transition logic** — automatic progression through understand → establish → maintain → coast
9. **Delete legacy** — remove conditionReminderService and condition-specific nudge triggers
10. **Mobile UI polish** — PostLogFeedback becomes flow-aware (progress context)
11. **Test the full HTN lifecycle** — simulate a patient through all 4 phases

## 15) Key Files Reference

### Existing files to read before implementing
- `functions/src/data/conditionProtocols.ts` — BP thresholds, emergency symptoms, drug lists
- `functions/src/services/conditionReminderService.ts` — what we're replacing (understand the logic to preserve)
- `functions/src/services/intelligentNudgeGenerator.ts` — AI personalization (will be reused)
- `functions/src/services/trendAnalyzer.ts` — trend detection (will be called by flow engine)
- `functions/src/services/nudgeNotificationService.ts` — delivery pipeline (stays, understand the interface)
- `functions/src/routes/nudges.ts` — response handler (will be extended)
- `functions/src/types/lumibot.ts` — existing nudge types (will add CareFlow types alongside)
- `functions/src/services/visitProcessor.ts` — where flow creation hooks in (post-commit ops)
- `mobile/components/lumibot/LumiBotContainer.tsx` — nudge display (stays, minimal changes)
- `mobile/components/lumibot/PostLogFeedback.tsx` — post-log feedback (enhanced with flow context)

### New files to create
- `functions/src/types/careFlows.ts` — CareFlow, CareFlowTouchpoint, CareFlowTemplate types
- `functions/src/data/careFlowTemplates.ts` — HTN template (later: DM, COPD, etc.)
- `functions/src/services/careFlowEngine.ts` — flow advancement logic
- `functions/src/services/careFlowCreator.ts` — creates flows from visit processing signals
- `functions/src/triggers/advanceCareFlows.ts` — scheduled Cloud Function (every 15 min)
- `functions/src/services/repositories/careFlows/FirestoreCareFlowRepository.ts` — data access
