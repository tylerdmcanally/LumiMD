# LumiBot v2 Implementation Plan

## Vision

LumiBot evolves from a **notification system that pokes patients randomly** into a **contextual health companion woven into the app experience**. It appears when it has something meaningful, guides patients through post-visit changes, and feeds health data into a proper tracking hub.

**Mental model:** A friendly nurse — explains what's happening, doesn't prescribe. Walks alongside, doesn't lead. Shows you your chart and says "here's what your numbers look like, let's make sure your doctor sees this."

## Design Principles

1. **Context-rich, not context-less.** Every nudge ties back to a visit, diagnosis, or medication with plain-english explanation. Never "Log your blood pressure" — always "Dr. Smith started you on Lisinopril 5 days ago. A quick reading helps track how things are going."
2. **Present when needed, invisible when not.** LumiBot doesn't live on the home screen permanently. It appears when it has something, then gets out of the way.
3. **Guide, don't overwhelm.** Older, less tech-savvy users. Large text, simple language, clear next steps. Route patients to the right place in the app.
4. **Data goes somewhere useful.** Every reading feeds the health metrics hub. Every trend is visible. Caregivers see the data layer.
5. **Never cross the medical advice line.** (See guardrails below.)

## Medical Advice Guardrails

### The Rule
**Never attribute health outcomes to specific medications.** Show data and medications side by side — let the physician connect the dots.

### What's Safe vs. What's Not

| Crosses the line | Stays safe |
|---|---|
| "Your BP has been trending down since starting Lisinopril" | "Your BP trend this month: decreasing. Share this with your doctor." |
| "Lisinopril appears to be working" | "BP average this week: 128/82. Four weeks ago: 142/90." |
| "Missing doses is causing your glucose to rise" | "You logged 5 of 7 doses this week. Here are your glucose readings." |
| "You should increase your dose" | "That's a great question for Dr. Smith at your next visit." |
| "Your symptoms indicate hypertension" | "Here's what your numbers look like. Your care team can help you understand them." |

### Safe Patterns
- General medication info: "Atorvastatin is commonly prescribed for cholesterol" (not "was prescribed to lower *your* cholesterol")
- Always end med explanations with: "Your doctor can tell you more about why this was prescribed for you"
- Trend displays: "For tracking purposes. Your care team can help you understand what this means."
- Side effect education: "Common things to watch for include..." (general, not personalized)
- Deflection default: "That's a great question for [doctor name] at your next visit"

### Tiered Disclaimers (implement at each level)
- **Tier 1 (Global):** Settings/About screen — "LumiMD is not intended to be a substitute for professional medical advice, diagnosis, or treatment."
- **Tier 2 (Feature):** On LumiBot sections — "For informational and tracking purposes only. Not medical advice."
- **Tier 3 (Contextual):** On trend insights — "Based on the data you've logged. Share with your doctor for clinical interpretation."
- **Tier 4 (Safety):** On alerts — "If you are experiencing a medical emergency, call 911. This app is not a substitute for emergency medical services."

### AI Prompt Hardening
- Add to `insightGenerator.ts` system prompt: "Never state or imply that a medication is responsible for changes in health metrics. Never correlate medication start dates with trend changes."
- Add to `lumibotAI.ts` system prompt: "You are informational only. Never recommend starting, stopping, or changing medications. Never diagnose conditions. Always recommend consulting the care team for clinical questions."
- Validate all AI-generated content: strip any sentences containing "since starting [medication]", "because of [medication]", "[medication] is working/not working"

---

## Phase 1: Context-Rich Nudges (Fix Existing) — COMPLETE

> **Status:** Implemented and verified on 2026-03-09.
>
> **What was done:**
> - Added `NudgeContext` interface to SDK (`packages/sdk/src/models/lumibot.ts`) and backend (`functions/src/types/lumibot.ts`) with fields: visitId, visitDate, providerName, diagnosisName, medicationName, medicationDose, medicationStartDate, daysSinceMedStart, lastReading, readingCount, trackingReason
> - Added `getLastByType()` and `getRecentByType()` methods to `HealthLogDomainService`
> - Built `buildNudgeContext()` helper in `lumibotAnalyzer.ts` — assembles context from params + fetches last reading and count from HealthLogDomainService
> - Updated `createNudge()`, `createConditionNudges()`, `createFollowUpNudge()`, and `analyzeVisitWithDelta()` to populate context
> - Updated `medicationFollowUpNudges.ts` trigger to pass context (medicationName, medicationDose, trackingReason)
> - Updated `nudges.ts` GET routes to include context in response; fixed Cache-Control from `max-age=30` to `no-cache`; updated auto-follow-ups to include context
> - Hardened AI prompts in `insightGenerator.ts`, `lumibotAI.ts`, and `intelligentNudgeGenerator.ts` with medical advice guardrails and unsafe pattern regex validation
> - Rewrote `NudgeCard.tsx` to display context section (last reading, reading count)
> - Created `PostLogFeedback.tsx` modal component with normal/caution flows, mini trend, Tier 3 disclaimer
> - Rewrote `LumiBotContainer.tsx` to route post-log results through PostLogFeedback (normal/caution) or SafetyAlert (warning/emergency)
> - Added Tier 1 medical disclaimer to Settings screen (`mobile/app/settings.tsx`)
> - Fixed 3 test suites (nudges.history, nudges.activePatch, shares.invites) — updated Cache-Control expectations to match route changes
>
> **Deviations from plan:**
> - `providerName` is not extracted from visits (not in `VisitSummaryResult`). Field accepted as optional; will be populated when available in future.
> - PostLogFeedback uses nudge context's `lastReading` as "previous reading" rather than fetching last 3-5 values. Full trend deferred to Phase 3 when health hub navigation is enabled.
> - `getLastReadingByType` returns raw `HealthLogRecord` instead of pre-formatted value — formatting done at call site for flexibility.
>
> **Test results:** Backend builds clean. **All 107 test suites pass (554/554 tests).** Fixed all pre-existing failures: Cache-Control test expectations updated to `no-cache`, soft-delete `deletedAt: null` added to mock action data, time-sensitive repo bridge tests pinned with `jest.useFakeTimers`, and query count expectations updated.

### Goal
Every nudge explains WHY it exists, shows relevant history, and gives meaningful post-log feedback.

### 1.1 — Enrich Nudge Data Model

**Firestore `nudges/{id}` — new fields:**

```typescript
{
  // Existing fields stay unchanged...

  // NEW: Context fields
  context: {
    visitId?: string;           // Which visit triggered this
    visitDate?: string;         // When the visit occurred
    providerName?: string;      // "Dr. Smith" (from visit transcript extraction)
    diagnosisName?: string;     // "High blood pressure" (plain english)
    medicationName?: string;    // Already exists, move here too
    medicationDose?: string;    // "10mg daily"
    medicationStartDate?: string; // When it was started
    daysSinceMedStart?: number; // Computed at nudge creation
    lastReading?: {             // Most recent health log of this type
      value: string;            // "142/90" or "126 mg/dL"
      date: string;             // "March 4"
      alertLevel?: string;      // "normal" | "caution" etc.
    };
    readingCount?: number;      // How many readings logged so far
    trackingReason?: string;    // "to help track how things are going" (plain english)
  };
}
```

**Where to modify:**
- SDK types: `packages/sdk/src/models/lumibot.ts` — add `context` to `Nudge` interface
- Backend types: `functions/src/types/lumibot.ts` — mirror SDK changes
- Nudge creation: `functions/src/services/lumibotAnalyzer.ts` — populate context at creation time (lines 280-429)
- Follow-up creation: `functions/src/triggers/medicationFollowUpNudges.ts` — populate context (lines 191-214)
- Follow-up from response: `functions/src/routes/nudges.ts` — populate context on auto-follow-ups (lines 331-360)

### 1.2 — Populate Context at Nudge Creation

**In `lumibotAnalyzer.ts` (`analyzeVisitWithDelta`):**

When creating nudges, fetch and attach:
1. Provider name from visit data (`visit.providerName` or extract from transcript)
2. Diagnosis plain-english name (from `visit.diagnosesDetailed[].name`)
3. Medication details (name, dose, frequency from `visit.medications.started[]`)
4. Last health reading of matching type (query `healthLogs` collection, most recent by type)
5. Reading count (count of healthLogs for this user + type)

**In `medicationFollowUpNudges.ts`:**

When creating follow-up nudges, fetch and attach:
1. Medication details from the reminder's linked medication document
2. Visit that originated this medication (if tracked)
3. Last dose log status

### 1.3 — Fetch Last Reading for Context

**New utility function** in `functions/src/services/domain/healthLogs/HealthLogDomainService.ts`:

```typescript
async getLastReadingByType(userId: string, type: HealthLogType): Promise<{
  value: string;      // Formatted: "142/90" or "126 mg/dL"
  date: string;       // "March 4"
  alertLevel?: AlertLevel;
} | null>
```

Called during nudge creation to populate `context.lastReading`.

### 1.4 — Update NudgeCard UI with Context

**File: `mobile/components/lumibot/NudgeCard.tsx` (187 lines)**

Current card shows: icon + title + message + action buttons.

New card shows:
```
[Heart icon]  Blood Pressure Check
"Dr. Smith started you on Lisinopril 5 days ago for blood
 pressure. A quick reading helps track how things are going."

 Last reading: 142/90 on March 4          ← NEW context line

 [  Log Blood Pressure  ]    [ Not now ]
```

Changes:
- Add context section below message (conditional — only if `nudge.context` exists)
- Show last reading with date if available
- Show reading count: "You've logged 3 readings so far" (if > 0)
- Style: smaller text, muted color, informational tone

### 1.5 — Post-Log Feedback with Trend Context

**Current flow:** Patient logs BP → green checkmark "Looking Good" → dismisses.

**New flow:** Patient logs BP → feedback card with trend context → link to health hub.

**Modify `LumiBotContainer.tsx` (305 lines):**

After `useCreateHealthLog` mutation succeeds, instead of just showing SafetyAlert:

1. If `alertLevel === 'normal'`:
   - Show: "Got it — 134/86. Here's how that compares to your recent readings."
   - Mini trend: last 3-5 values inline (text, not chart)
   - Disclaimer: "Your care team can help you understand your numbers."
   - Link: "View your BP trend →" (navigates to health screen)

2. If `alertLevel === 'caution'` or `'warning'`:
   - Show existing SafetyAlert
   - Add: "Consider sharing this with your care team."
   - Link: "View your BP trend →"

3. If `alertLevel === 'emergency'`:
   - Show existing SafetyAlert (unchanged — Call 911 button stays)

**New component: `PostLogFeedback.tsx`**
- Location: `mobile/components/lumibot/PostLogFeedback.tsx`
- Props: `{ reading, recentReadings, alertLevel, healthLogType, onViewTrend, onDismiss }`
- Shows formatted current value, mini trend (last 3-5 text values), contextual message, nav link
- Never correlates readings with medications

### 1.6 — Harden AI Prompts

**File: `functions/src/services/insightGenerator.ts`**
Add to system prompt:
```
CRITICAL SAFETY RULES:
- Never state or imply that a medication is responsible for changes in health metrics
- Never correlate medication start dates with trend changes
- Never use phrases like "since starting [medication]" or "[medication] appears to be working"
- Present data trends factually. Let the patient's care team interpret clinical significance.
- Always recommend sharing trends with their doctor for clinical interpretation.
```

**File: `functions/src/services/lumibotAI.ts`**
Add to system prompt:
```
CRITICAL SAFETY RULES:
- You are informational only. You are NOT a medical professional.
- Never recommend starting, stopping, or changing medications or treatments
- Never diagnose conditions or interpret symptoms clinically
- Never attribute health changes to specific medications
- Always recommend consulting the care team for clinical questions
- Use phrases like "your care team can help you understand" and "share this with your doctor"
```

**File: `functions/src/services/intelligentNudgeGenerator.ts`**
Add output validation:
```typescript
// After AI generates nudge message, validate:
const UNSAFE_PATTERNS = [
  /since (starting|beginning|taking)/i,
  /appears to be working/i,
  /is (working|helping|effective)/i,
  /caused by|causing/i,
  /you should (stop|start|increase|decrease|change)/i,
  /diagnosis|diagnose/i,
];
// Strip or reject messages matching these patterns, fall back to template
```

### 1.7 — Add Tiered Disclaimers

- **Tier 1:** Add to Settings screen (mobile) — full "not a substitute" disclaimer
- **Tier 2:** Already exists on LumiBotBanner ("For tracking purposes only. Not medical advice.") — keep
- **Tier 3:** Add to PostLogFeedback component and any trend display
- **Tier 4:** Already exists on SafetyAlert — keep

---

## Phase 2: Post-Visit LumiBot Walkthrough — COMPLETE

> **Status:** Implemented and verified on 2026-03-09.
>
> **What was done:**
> - Added `VisitWalkthrough` type hierarchy to SDK (`packages/sdk/src/models/lumibot.ts`) and backend (`functions/src/types/lumibot.ts`) — includes step types, suggested questions, and API request/response types
> - Created `walkthroughGenerator.ts` — pure function that reformats `VisitSummaryResult` into patient-friendly walkthrough steps (zero LLM calls). Maps diagnoses, medications, education data, follow-ups, and conditions to tracking plans
> - Created `walkthroughQA.ts` — Q&A service with 3-tier answer strategy: (1) match from visit education data, (2) match from visit summary/follow-ups, (3) guarded LLM fallback with strict medical advice guardrails and unsafe response validation
> - Added `walkthroughGeneration` as 6th post-commit operation in `visitProcessor.ts` and `visitPostCommitOperations.ts` — runs in parallel with other post-commit ops, stores result on visit document as `walkthrough` field
> - Added `POST /v1/visits/:id/ask` endpoint in `visits.ts` — validates question (max 500 chars), checks visit ownership, builds Q&A context from visit data, returns `{ answer, source, disclaimer }`
> - Added `visits.ask()` method to SDK API client
> - Created `VisitWalkthrough.tsx` bottom-sheet overlay — 3-step navigation (What Happened → What Changed → What's Next + Q&A), flag flow, suggested questions with expand/collapse, free-form Q&A input, medical disclaimers
> - Updated `visit-detail.tsx` — auto-shows walkthrough on first open via AsyncStorage check, "Review with LumiBot" button persists after dismissal, flag action closes walkthrough and shows alert
>
> **Deviations from plan:**
> - `walkthroughGenerator.ts` takes `VisitSummaryResult` directly rather than `visitRef + visitData` — cleaner API since only the summary result is needed
> - Walkthrough skips generation (returns null) if visit has no meaningful content (no diagnoses, no medication changes, no follow-ups) — avoids empty walkthroughs
> - The "Flag something" flow uses a simple Alert instead of a complex flagging queue — clean, safe redirect per plan
> - Q&A unsafe question detection uses regex patterns to pre-filter questions that try to get medical advice (dose changes, stop/start meds, self-diagnosis)
> - AI-generated Q&A responses pass through unsafe response pattern validation — if caught, falls back to safe deflection
>
> **Test results:** Backend builds clean. **All 107 test suites pass (554/554 tests).** No new test failures.

### Goal
When a visit finishes processing, LumiBot guides the patient through what happened, what changed, and what's next — like having a friendly nurse in the room.

### 2.1 — Pre-compute Walkthrough During Visit Processing

**File: `functions/src/services/visitProcessor.ts` (576 lines)**

Add a new post-commit operation (alongside existing delta analysis, line ~430):

```typescript
// NEW: Generate LumiBot walkthrough content
const walkthroughResult = await generateVisitWalkthrough(visitRef, visitData, summaryResult);
```

**New service: `functions/src/services/walkthroughGenerator.ts`**

Generates structured walkthrough content during visit processing (not on-demand) to avoid latency and extra LLM costs at read time.

**Input:** Visit summary result (diagnoses, medications, followUps, education)
**Output:** Stored on the visit document as `walkthrough` field:

```typescript
interface VisitWalkthrough {
  generatedAt: string;
  steps: {
    whatHappened: {
      title: string;          // "Here's what we heard"
      diagnoses: Array<{
        name: string;
        isNew: boolean;
        plainEnglish: string;  // "High blood pressure — this means..."
      }>;
      keyTopics: string[];     // Other discussed topics
      flagPrompt: string;      // "Does this sound right? If something seems off, you can flag it."
    };
    whatChanged: {
      title: string;           // "Here's what changed"
      medicationsStarted: Array<{
        name: string;
        dose: string;
        frequency: string;
        plainEnglish: string;  // "Commonly prescribed for cholesterol"
        disclaimer: string;    // "Your doctor can tell you more about why this was prescribed"
      }>;
      medicationsStopped: Array<{
        name: string;
        plainEnglish: string;
      }>;
      medicationsChanged: Array<{
        name: string;
        change: string;        // "Dose increased from 5mg to 10mg"
        plainEnglish: string;
      }>;
      newActionItems: Array<{
        description: string;
        dueDate?: string;
        type?: string;
      }>;
    };
    whatsNext: {
      title: string;           // "Here's what's coming up"
      trackingPlans: Array<{
        what: string;          // "Blood pressure"
        why: string;           // "To help track how things are going"
        when: string;          // "I'll check in with you in a few days"
      }>;
      followUps: Array<{
        description: string;
        dueBy?: string;
      }>;
      closingMessage: string;  // "I'll be here if you need anything. Remember, your care team is always the best resource."
    };
  };
  suggestedQuestions: Array<{
    question: string;          // "What is Atorvastatin used for?"
    answer: string;            // Pre-computed from visit education data
    source: 'visit_education' | 'general';
  }>;
}
```

**Generation approach (hybrid):**
- Steps 1-3 (`whatHappened`, `whatChanged`, `whatsNext`) are generated from structured visit data — NO additional LLM call needed. The visit processing already extracts diagnoses, medications, followUps, and education content. The walkthrough generator reformats this into patient-friendly walkthrough steps.
- `suggestedQuestions` are generated from `visit.education.medications[]` and `visit.education.diagnoses[]` which GPT-4 already produces during visit processing. Map medication education fields (purpose, sideEffects, whenToCallDoctor) to Q&A format.
- Only the `plainEnglish` descriptions for new medications/diagnoses may optionally use a lightweight LLM call if the education data is insufficient. But prefer pulling from the existing `education` field first.

**Store on visit document:**
```typescript
// In visitProcessor.ts, after summary generation
await visitRef.update({
  walkthrough: walkthroughData,
  // ... existing fields
});
```

### 2.2 — Visit Detail Overlay Component

**New component: `mobile/components/VisitWalkthrough.tsx`**

A bottom-sheet overlay that appears on first visit detail open after processing completes.

**Behavior:**
- When patient opens a completed visit AND `visit.walkthrough` exists AND the walkthrough hasn't been dismissed for this visit:
  - Show a bottom sheet overlay (not full-screen — summary is visible behind it)
  - Steps presented as swipeable cards or a vertical scroll
  - "Dismiss" button always visible → collapses to a small "Review with LumiBot" button on the visit detail screen
  - After dismissal, button persists on visit detail for re-access
- Track dismissal in local storage: `walkthroughDismissed_{visitId}: true`

**Step-by-step layout:**

```
┌──────────────────────────────────────┐
│  LumiBot                        ✕   │
│  "Let's go through your visit"      │
│                                      │
│  ── Here's what we heard ──         │
│                                      │
│  • High blood pressure (new)        │
│    Your doctor identified this as    │
│    a new condition to watch.        │
│                                      │
│  • Diabetes management              │
│    Discussed during this visit.     │
│                                      │
│  Does this sound right?             │
│  [ Flag something ]   [ Looks good ]│
│                                      │
│            Step 1 of 3    [ Next → ] │
└──────────────────────────────────────┘
```

**Flag flow:**
- "Flag something" → Closes walkthrough → Scrolls to visit summary → Shows toast: "Take a look at the full summary. If something doesn't match what you remember, contact your care team for follow-up."
- No complex flagging queue. Clean, safe redirect.

**After Step 3 ("What's next"):**
- Show suggested questions (2-3 based on visit content)
- Each question expands to show pre-computed answer
- "Ask something else" text input → guarded Q&A (see 2.3)
- Close button → dismiss walkthrough

### 2.3 — Follow-Up Q&A (Guarded)

**Location:** Bottom of walkthrough overlay, after Step 3.

**Suggested questions** (pre-computed, no LLM call):
- Generated from `visit.education.medications[]`: "What is [med] used for?" → `education.purpose`
- Generated from `visit.education.medications[]`: "What side effects should I watch for with [med]?" → `education.sideEffects`
- Generated from `visit.education.diagnoses[]`: "What should I watch for with [diagnosis]?" → `education.watchFor`
- Max 3 questions, prioritized by: new medications > changed medications > new diagnoses

**"Ask something else" flow:**
1. User types free-form question
2. First: attempt to answer from existing visit data
   - Search `visit.education`, `visit.summary`, `visit.followUps` for relevant content
   - If match found → display answer with source: "Based on your visit on [date]"
3. If no match: LLM call as last resort
   - System prompt includes strict guardrails (see medical advice section)
   - Context: visit education data, medication list (names only, no correlation with outcomes)
   - Default response for anything clinical: "That's a great question for [provider name or 'your care team'] at your next visit."
4. All answers include: "This is based on information from your visit. Your care team is always the best resource."

**New API endpoint:**
```
POST /v1/visits/:id/ask
Body: { question: string }
Response: {
  answer: string;
  source: 'visit_education' | 'visit_summary' | 'ai_generated';
  disclaimer: string;
}
```

**Implementation in:** `functions/src/routes/visits.ts` — add new route
**New service:** `functions/src/services/walkthroughQA.ts` — question matching + guarded LLM fallback

### 2.4 — Visit Detail Screen Changes

**File: `mobile/app/visit-detail.tsx` (1,238 lines)**

Changes:
1. Add walkthrough state management:
   ```typescript
   const [walkthroughVisible, setWalkthroughVisible] = useState(false);
   const [walkthroughDismissed, setWalkthroughDismissed] = useState(false);
   ```

2. On mount, check if walkthrough should show:
   ```typescript
   useEffect(() => {
     if (visit?.walkthrough && visit?.processingStatus === 'completed') {
       const dismissed = await AsyncStorage.getItem(`walkthrough_${visitId}`);
       if (!dismissed) setWalkthroughVisible(true);
     }
   }, [visit]);
   ```

3. Add VisitWalkthrough overlay component (rendered above ScrollView)

4. After dismissal, show persistent button:
   ```tsx
   {walkthroughDismissed && visit?.walkthrough && (
     <TouchableOpacity onPress={() => setWalkthroughVisible(true)}>
       <Text>Review with LumiBot</Text>
     </TouchableOpacity>
   )}
   ```

---

## Phase 3: Health Metrics Hub (Enable + Evolve) — COMPLETE

> **Status:** Implemented and verified on 2026-03-09.
>
> **What was done:**
> - Enabled health feature flag — changed `config.ts` from `EXPO_PUBLIC_HEALTH_ENABLED === 'true'` (opt-in) to `!== 'false'` (opt-out, enabled by default)
> - Added `health` Stack.Screen to `_layout.tsx` with `slide_from_right` animation
> - Installed `react-native-svg` via `npx expo install`; built custom SVG line charts directly (no third-party charting library needed) for full control over elder-friendly design
> - Rewrote `health.tsx` as a full Health Metrics Hub with: metric type selector (BP/Glucose/Weight), period selector (7/30/90 days), SVG trend charts (multi-series for BP systolic/diastolic), insight cards from trend analyzer, recent readings list with source labels and alert indicators, FAB + log menu for manual entry, Tier 2 medical disclaimer
> - Added `GET /v1/health-logs/insights` endpoint to `healthLogs.ts` — uses existing `analyzeTrends()` from `trendAnalyzer.ts`, returns insights array with `Cache-Control: private, no-cache`
> - Added `TrendInsight` and `HealthInsightsResponse` types to SDK (`packages/sdk/src/models/lumibot.ts`)
> - Added `insights()` method to SDK API client (`api-client.ts`)
> - Added `useHealthInsights` hook to SDK hooks and mobile hooks wrapper
> - Wired `PostLogFeedback.onViewTrend` to navigate to health screen with type param: `router.push({ pathname: '/health', params: { type } })`
> - Added "Health" GlanceableCard to home screen Quick Overview section — navigates to `/health`
> - Health screen accepts `type` param from navigation to pre-select the metric type
>
> **Deviations from plan:**
> - Used custom SVG charts via `react-native-svg` instead of a third-party charting library (`react-native-chart-kit`, `victory-native`). This gives full control over the visual style and avoids adding a heavy dependency. Charts are simple, clean, and elder-friendly.
> - Symptom Check History (3.5) and Side Effects History (3.6) deferred to Phase 4 — these sections surface LumiBot-specific data that aligns better with the caregiver intelligence phase. The health screen is designed to be easily extended with additional sections.
> - `highlight` param (scroll to specific log) accepted but not yet implemented — future enhancement when needed.
> - Removed the old feature-flag disabled state from `health.tsx` — the screen is always enabled now (controlled via config).
>
> **Test results:** Backend builds clean. **All 107 test suites pass (554/554 tests).** No new test failures.

### Goal
Give health data a proper home. Enable the existing health screen, add trend visualization, and make it the destination LumiBot routes patients to.

### 3.1 — Enable Health Screen

**File: `mobile/app/_layout.tsx`**
- Remove or default-enable the `EXPO_PUBLIC_HEALTH_ENABLED` feature flag
- Ensure health tab/button is visible in navigation

**File: `mobile/app/health.tsx`**
- Currently feature-flagged but functional with latest readings + FAB logging

### 3.2 — Add Trend Charts to Mobile

**Current state:** Mobile shows latest readings only. Caregiver portal has Recharts line charts. Mobile needs similar but React Native compatible.

**Add to health screen:**
- Simple trend lines for BP (systolic/diastolic), glucose, weight over selectable period (7/30/90 days)
- Use a React Native charting library (e.g., `react-native-chart-kit` or `victory-native`)
- Below each chart: insight cards from trend analyzer when available

**New section in `health.tsx`:**
```tsx
<TrendSection
  type="bp"
  logs={bpLogs}
  period={selectedPeriod}
  insights={bpInsights}
/>
```

### 3.3 — Surface Trend Analyzer Insights

**Current state:** `trendAnalyzer.ts` detects patterns (morning BP spikes, glucose spikes, weight jumps) and creates nudges — but insights are never shown on the health screen.

**New API endpoint or extend existing:**
```
GET /v1/health-logs/insights?type=bp&days=30
Response: {
  insights: Array<{
    severity: 'positive' | 'info' | 'attention' | 'concern';
    pattern: string;
    title: string;
    message: string;    // Pre-written lifestyle suggestion, NOT medication correlation
    data: { current, previous, change, direction };
  }>;
}
```

**Display as cards below charts on health screen:**
```
[Green card]  "Your BP has been stable this week"
              "Great work! Keep up the healthy habits."

[Yellow card]  "Morning readings tend to run higher"
               "Focus on stress management and watch sodium intake."
               "Share this pattern with your doctor."
```

### 3.4 — LumiBot → Health Hub Navigation

After logging via a LumiBot nudge (PostLogFeedback component from Phase 1):
- "View your BP trend →" button navigates to health screen with the relevant type pre-selected
- Pass navigation params: `router.push({ pathname: '/health', params: { type: 'bp', highlight: logId } })`
- Health screen scrolls to relevant chart/section

### 3.5 — Symptom Check History

**Current gap:** Symptom checks (breathing, swelling, energy, cough, orthopnea) are logged via LumiBot but not visible on the health screen.

**Add to health screen:**
- New section: "Symptom Check History"
- Shows timeline of symptom check results with severity indicators
- Links back to originating visit if available

### 3.6 — Side Effects History

**Current gap:** Side effects reported via LumiBot modal are stored but not surfaced.

**Add to health screen:**
- New section: "Reported Side Effects"
- Shows timeline of side effect reports with linked medication
- Useful for patient to review before a doctor visit

---

## Phase 4: Caregiver Intelligence — COMPLETE

> **Status:** Implemented and verified on 2026-03-09.
>
> **What was done:**
> - Created `GET /v1/care/:patientId/nudge-history` endpoint (`functions/src/routes/care/nudgeHistory.ts`) — returns nudge history with response data + stats (total, responded, dismissed, pending, responseRate). Registered in `care.ts`.
> - Extended `GET /v1/care/:patientId/alerts` with two LumiBot-sourced alert types: `missed_checkins` (3+ unanswered nudges for 3+ days) and `medication_trouble` (patient reported "having_trouble", "issues", or "concerning" responses)
> - Extended `GET /v1/care/:patientId/health-logs` to include `insights` array from `analyzeTrends()` — same trend analyzer used by mobile Phase 3
> - Added `useCareNudgeHistory` hook + `CareTrendInsight` type + updated `CareHealthLogsResponse` and `CareAlert` types in web portal hooks
> - Enhanced caregiver health page (`web-portal/app/care/[patientId]/health/page.tsx`) with 4 new sections: Trend Insights cards, LumiBot Check-ins (stats + response history), Symptom Check History timeline, Side Effects & Medication Issues timeline
> - Added cross-patient Health Overview card to caregiver dashboard (`web-portal/app/care/page.tsx`) — rule-based priority ranking: "Needs attention" (emergency/warning readings, concerning trends) > "Monitor" (attention trends, stale data) > "Doing well" (stable readings). Shows per-patient vitals summary with click-through to health page.
> - Updated alert icon mapping in dashboard to handle `missed_checkins` and `medication_trouble` types
>
> **Deviations from plan:**
> - Stats in nudge-history include `pending` count (not in original spec) — useful for caregivers to see outstanding check-ins
> - Health Overview panel uses client-side per-patient `useCareHealthLogs` calls rather than extending the overview endpoint — avoids adding latency to the main overview API for all users; works well for typical 1-3 patient cardinality
> - Symptom Check and Side Effects timelines render from nudge history data (not a separate endpoint) — keeps it simple with one API call
> - `concerning_reading` alert type from plan was already covered by existing `health_warning` type — no new type needed
>
> **Test results:** Backend builds clean. **All 107 test suites pass (554/554 tests).** `npx next build` passes for web portal.

### Goal
LumiBot-captured data flows into caregiver views. A health assistant helps caregivers identify trends across patients they care for.

### 4.1 — Existing Caregiver Health Page Enhancement

**File: `web-portal/app/care/[patientId]/health/page.tsx` (548 lines)**

Currently has: overview cards (BP, glucose, weight), alert banner, line charts, recent readings table.

**Enhancements:**
- Add trend insight cards (same data as mobile Phase 3.3, via existing `/v1/care/:patientId/health-logs` with insights)
- Add nudge response history section: "LumiBot Check-ins" showing what nudges the patient received and how they responded
- Add symptom check timeline
- Add side effects timeline

### 4.2 — Caregiver Alerts from LumiBot Data

**File: `functions/src/routes/care/alerts.ts`**

Extend alerts to include:
- Concerning health readings logged via LumiBot (alertLevel: warning/emergency)
- Missed nudge responses (patient hasn't responded to check-ins in X days)
- Concerning nudge responses (patient reported "having_trouble" or "issues" with medication)

**New alert types:**
```typescript
type CaregiverAlert = {
  type: 'concerning_reading' | 'missed_checkins' | 'medication_trouble' | ...existing;
  severity: 'info' | 'warning' | 'urgent';
  message: string;
  data: Record<string, unknown>;
  createdAt: string;
};
```

### 4.3 — Nudge Response Visibility

**New API endpoint:**
```
GET /v1/care/:patientId/nudge-history?limit=20&days=30
Response: {
  nudges: Array<{
    id: string;
    type: NudgeType;
    title: string;
    status: NudgeStatus;
    responseValue?: string | object;
    createdAt: string;
    completedAt?: string;
  }>;
  stats: {
    total: number;
    responded: number;
    dismissed: number;
    responseRate: number;  // percentage
  };
}
```

**Display on caregiver patient detail page:**
- "LumiBot Activity" section showing response rate and recent interactions
- Expandable cards showing nudge → response pairs

### 4.4 — Caregiver Health Assistant

**New feature on caregiver dashboard (`/care`):**

A summary view that helps caregivers identify cross-patient trends and areas needing attention.

**Implementation approach:**
- Aggregate health data across all patients the caregiver has access to
- Highlight: patients with declining trends, missed check-ins, concerning responses
- Simple priority ranking: "Needs attention" > "Monitor" > "Doing well"
- No AI needed initially — rule-based from existing trend analyzer output

**UI:** Add a "Health Overview" card on the caregiver dashboard (`/care` page) showing:
```
┌─────────────────────────────────────────┐
│  Health Overview                        │
│                                         │
│  [!] Mom — BP trending up this week     │
│  [✓] Dad — All readings stable          │
│  [?] Aunt Sue — No readings in 5 days   │
└─────────────────────────────────────────┘
```

---

## Phase 0: Clean Start (Pre-Requisite) — COMPLETE

### Goal
Purge stale data from dev Firestore so the v2 system starts fresh. Old nudges without context fields, orphaned health logs, and test data would create confusion and inconsistent behavior.

> **Status:** Executed successfully against `lumimd-dev` on 2026-03-09. Temporary files removed.
>
> **Results:** 62 nudges deleted, 956 healthLogs deleted, 0 medicationLogs (none from nudge_response), 10 visits postCommitStatus cleared, 0 walkthrough fields (none existed). Core visit data (summaries, diagnoses, medications) verified intact. Medications and actions collections untouched.
>
> **Deviation:** Skipped step 6 ("RESET PersonalRN patient state") — state is computed in-memory from Firestore queries, not stored as a separate document.

### 0.1 — Firestore Data Cleanup Script

**Create: `functions/src/scripts/lumibotV2CleanStart.ts`**

A one-time migration script (run manually via Firebase shell or a temporary HTTP endpoint) that:

```typescript
async function lumibotV2CleanStart(dryRun: boolean = true) {
  const results = {
    nudgesDeleted: 0,
    healthLogsDeleted: 0,
    medicationLogsDeleted: 0,
    visitsWalkthroughCleared: 0,
    nudgeFieldsOnVisitsCleared: 0,
  };

  // 1. DELETE all nudges (hard delete, not soft delete — this is test data)
  //    Old nudges lack context fields and will render incorrectly in v2 UI
  const nudges = await db.collection('nudges').get();
  // Batch delete in 450-doc chunks (Firestore batch limit)

  // 2. DELETE all healthLogs
  //    Old logs were created without proper source tracking or nudge linkage
  //    Starting fresh ensures all data flows through v2 pipeline
  const healthLogs = await db.collection('healthLogs').get();
  // Batch delete in 450-doc chunks

  // 3. DELETE all medicationLogs from nudge responses
  //    These were created by old nudge responses and should be regenerated cleanly
  const medLogs = await db.collection('medicationLogs')
    .where('source', '==', 'nudge_response').get();
  // Batch delete in 450-doc chunks

  // 4. CLEAR walkthrough fields on visits (if any exist from testing)
  //    Ensures walkthroughs are regenerated with final v2 format
  const visitsWithWalkthrough = await db.collection('visits')
    .where('walkthrough', '!=', null).get();
  // Batch update: set walkthrough to FieldValue.delete()

  // 5. CLEAR any LumiBot-related fields on visits
  //    postCommitStatus for lumibot operations, delta analysis results
  //    Don't touch: summary, diagnoses, medications, education (those are valid)
  const visitsWithPostCommit = await db.collection('visits')
    .where('postCommitStatus', '!=', null).get();
  // Batch update: reset postCommitStatus to allow re-processing

  // 6. RESET PersonalRN patient state (if stored in Firestore)
  //    Old frequency tier calculations based on stale data
  //    Let the system recalculate from fresh state

  return results;
}
```

**Run modes:**
- `dryRun: true` — logs what would be deleted, deletes nothing (run first to verify)
- `dryRun: false` — performs the deletions

**Expose as temporary endpoint:**
```typescript
// In functions/src/routes/ — temporary, remove after running
router.post('/v1/admin/lumibot-v2-clean-start', adminAuthMiddleware, async (req, res) => {
  const dryRun = req.query.dryRun !== 'false';
  const results = await lumibotV2CleanStart(dryRun);
  res.json({ dryRun, results });
});
```

**Safety:**
- Requires admin auth (not regular user auth)
- Dry run by default — must explicitly pass `?dryRun=false`
- Only runs against `lumimd-dev` project (add project ID check)
- Logs every deletion for audit trail
- **Never run against production** — add explicit check: `if (projectId === 'lumimd') throw new Error('Cannot run clean start against production')`

### 0.2 — Collections to Purge

| Collection | Action | Reason |
|---|---|---|
| `nudges` | Hard delete ALL | No context fields, stale sequences, old format. All test data. |
| `healthLogs` | Hard delete ALL | No proper source tracking, no nudge linkage. All test data. |
| `medicationLogs` (source: nudge_response) | Hard delete matching | Only logs created by old nudge responses. Keep manually-created medication logs. |
| `visits` (walkthrough field) | Clear field | Remove any test walkthrough data so v2 generates fresh. |
| `visits` (postCommitStatus) | Reset field | Allow LumiBot post-commit operations to re-run on next visit processing. |

### 0.3 — Collections to KEEP (Do Not Touch)

| Collection | Reason |
|---|---|
| `visits` (core fields) | Summaries, diagnoses, medications, education — all valid. Only clear LumiBot-specific fields. |
| `medications` | Active medication list is independent of LumiBot. |
| `actions` | Action items from visits are independent of LumiBot. |
| `medicationReminders` | Reminder schedules are independent of LumiBot. |
| `medicationLogs` (source: manual) | Manually logged doses are valid data. |
| `users` | User profiles untouched. |
| `shares` | Caregiver sharing untouched. |
| `caregiverMessages` | Messages untouched. |
| `devices` | Push tokens untouched. |

### 0.4 — Post-Cleanup Verification

After running the clean start script, verify:

```bash
# Check collections are empty
firebase firestore:get nudges --project lumimd-dev          # Should be empty
firebase firestore:get healthLogs --project lumimd-dev      # Should be empty

# Check visits still have core data
# Pick a known visit ID and verify summary/diagnoses/medications exist
# Verify walkthrough field is gone
# Verify postCommitStatus is cleared
```

### 0.5 — Trigger Fresh Data Generation

After cleanup, to populate v2 data:

1. **Record a new test visit** — This will flow through the full v2 pipeline: transcription → GPT-4 extraction → walkthrough generation → context-rich nudge creation
2. **Verify nudges have context fields** — Check Firestore directly for `context.visitId`, `context.providerName`, etc.
3. **Verify walkthrough generated** — Check visit document for `walkthrough` field with step structure
4. **Log health readings via LumiBot** — Verify PostLogFeedback shows trend context
5. **Check caregiver portal** — Verify new data appears in health page

### 0.6 — Cleanup the Cleanup

After verification:
- Remove the temporary `/v1/admin/lumibot-v2-clean-start` endpoint
- Delete `functions/src/scripts/lumibotV2CleanStart.ts` (or move to `scripts/archive/`)
- The script is single-use — don't leave admin endpoints in the codebase

---

## Key Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Walkthrough generation | Pre-computed during visit processing | Avoids latency at read time, no extra LLM cost per view, data already available from GPT-4 extraction |
| Follow-up Q&A | Existing visit data first, LLM fallback | Saves cost, reduces hallucination risk, data already processed and validated |
| Nudge context | Populated at creation time, not fetched at read time | Avoids N+1 queries on mobile, context is static after creation |
| Health charts on mobile | React Native charting library | Can't reuse Recharts (web-only), need native performance |
| Caregiver health assistant | Rule-based initially | Simpler, cheaper, more predictable than AI; can add AI layer later |
| Walkthrough storage | On visit document (`walkthrough` field) | Avoids separate collection, always available with visit data |
| Walkthrough dismissal tracking | AsyncStorage (local) | No need to sync dismissal state to server; per-device is fine |
| Data cleanup | Hard delete test data, not soft delete | This is dev/test data with no audit value; soft delete would leave stale docs in queries |
| Cleanup safety | Dev-only with project ID check | Prevent accidental production data loss; admin auth + dry run default |

## File Change Summary

### New Files

| File | Purpose | Phase |
|------|---------|-------|
| `functions/src/scripts/lumibotV2CleanStart.ts` | One-time Firestore cleanup script (remove after use) | 0 |
| `mobile/components/lumibot/PostLogFeedback.tsx` | Post-log trend feedback card | 1 |
| `functions/src/services/walkthroughGenerator.ts` | Pre-compute walkthrough from visit data | 2 |
| `functions/src/services/walkthroughQA.ts` | Question matching + guarded LLM fallback | 2 |
| `mobile/components/VisitWalkthrough.tsx` | Bottom-sheet walkthrough overlay | 2 |

### Modified Files

| File | Change | Phase |
|------|--------|-------|
| `packages/sdk/src/models/lumibot.ts` | Add `context` to Nudge interface, add VisitWalkthrough types | 1, 2 |
| `functions/src/types/lumibot.ts` | Mirror SDK type changes | 1, 2 |
| `functions/src/services/lumibotAnalyzer.ts` | Populate context fields during nudge creation | 1 |
| `functions/src/triggers/medicationFollowUpNudges.ts` | Populate context on follow-up nudges | 1 |
| `functions/src/routes/nudges.ts` | Populate context on auto-follow-ups | 1 |
| `mobile/components/lumibot/NudgeCard.tsx` | Display context (visit, last reading, history) | 1 |
| `mobile/components/lumibot/LumiBotContainer.tsx` | PostLogFeedback flow instead of just SafetyAlert | 1 |
| `functions/src/services/insightGenerator.ts` | Harden AI prompt with medical advice guardrails | 1 |
| `functions/src/services/lumibotAI.ts` | Harden AI prompt with medical advice guardrails | 1 |
| `functions/src/services/intelligentNudgeGenerator.ts` | Add unsafe pattern validation | 1 |
| `functions/src/services/visitProcessor.ts` | Add walkthrough generation to post-commit ops | 2 |
| `functions/src/routes/visits.ts` | Add POST /v1/visits/:id/ask endpoint | 2 |
| `mobile/app/visit-detail.tsx` | Add walkthrough overlay + "Review with LumiBot" button | 2 |
| `mobile/app/health.tsx` | Enable, add charts, insights, symptom/side-effect history | 3 |
| `mobile/app/_layout.tsx` | Enable health screen navigation | 3 |
| `web-portal/app/care/[patientId]/health/page.tsx` | Add insights, nudge history, symptoms, side effects | 4 |
| `functions/src/routes/care/alerts.ts` | Extend with LumiBot-sourced alerts | 4 |
| `functions/src/routes/care.ts` | Add nudge-history endpoint | 4 |

---

## Implementation Notes

### Visit Document — New `walkthrough` Field
Stored directly on the visit document in Firestore. No separate collection needed. Available whenever visit data is fetched. Approximately 2-5KB of structured JSON per visit.

### Nudge Context — Populated Once at Creation
Context fields are set when the nudge is created and never updated. This avoids complex sync logic. If underlying data changes (e.g., medication discontinued), the nudge should be dismissed via existing orphan cleanup, not updated.

### Mobile Chart Library
Evaluate: `victory-native` (most flexible), `react-native-chart-kit` (simpler), or `react-native-gifted-charts`. Match the visual style of the existing caregiver portal charts. Must support: line charts, multi-series (BP systolic/diastolic), reference lines, and responsive sizing.

### LLM Call Budget
- Phase 1: Zero additional LLM calls (context populated from existing data)
- Phase 2: Walkthrough generation — zero additional calls (reformats existing GPT-4 output). Q&A — occasional fallback call for unanswered questions only.
- Phase 3: Zero (trend insights already computed by trendAnalyzer)
- Phase 4: Zero initially (rule-based caregiver assistant)

### Testing Strategy
- Unit tests for walkthrough generator (input: mock visit summary → output: walkthrough structure)
- Unit tests for unsafe pattern validation in AI output
- Unit tests for nudge context population
- Integration tests for Q&A endpoint (visit data matching + LLM fallback)
- Manual testing for walkthrough overlay UX on various screen sizes
- Verify all disclaimers render correctly at each tier

### Existing Infrastructure to Leverage
- `visit.education.diagnoses[]` and `visit.education.medications[]` — already GPT-4-generated patient education content. Walkthrough and Q&A should pull from these first.
- `trendAnalyzer.ts` — already detects BP/glucose/weight patterns with safe, lifestyle-framed messaging.
- `personalRNService.ts` — frequency tier system already determines how often to nudge based on patient state.
- `deltaAnalyzer.ts` — already compares new visit data against patient context for intelligent nudge creation.
- Caregiver health page — already has charts, tables, and date range selector. Phase 4 extends, doesn't rebuild.
- Onboarding step-by-step UI pattern — reusable for walkthrough step navigation.
