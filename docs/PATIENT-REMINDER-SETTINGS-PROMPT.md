# Patient Reminder & Notification Settings — Phased Build Prompt

Your task: Add granular notification preferences for patients in the LumiMD iOS app.

Read this document top to bottom — it contains the full context, phased plan, adversarial tests, and file references. This document is the source of truth for this task.

---

## Context: Current State

### Notifications Patients Receive Today

| Trigger | Push Type | Frequency | What It Says | Patient Control? |
|---------|-----------|-----------|-------------|-----------------|
| **Medication Reminders** | `medication_reminder` | Every 5 min check | "Time to take your {med} ({dose})" | Yes — per-med times via medication-schedule screen |
| **Med Follow-up Nudges** | `medication_followup` | Every 15 min check | "Did you take {med}? Tap to log it" (2-4 hrs after reminder) | None |
| **Action Item Reminders** | `action_reminder` | Every 15 min check | 4-phase: "coming up" → "due today" → "3 days overdue" → "7 days overdue" | None |
| **General Nudges** | varies | Every 15 min check | Visit-context nudges (medication check-ins, condition tracking, side effects) | None |
| **Visit Ready** | post-processing | On completion | "Your visit summary is ready" | None |
| **Caregiver Message** | `caregiver_message` | Real-time | "{senderName} sent you a message" | None |

### Current Patient Controls

1. **Global push toggle** — All-or-nothing enable/disable (registers/unregisters push token via `devices` collection)
2. **Per-medication reminder times** — Set which times to be reminded (medication-schedule screen)
3. **Timezone** — Affects quiet hours (hardcoded 9pm-8am) and reminder evaluation

### What's Missing

Patients have zero per-type control. The only option is all notifications on or all off.

---

## Target Data Model

```typescript
// On users/{uid} document
notificationPreferences: {
  medicationReminders: boolean;    // "Time to take X" pushes (default: true)
  medicationFollowUps: boolean;    // "Did you take X?" nudges (default: true)
  actionReminders: boolean;        // Due-date action item reminders (default: true)
  healthNudges: boolean;           // Condition tracking, side effects, insights (default: true)
  visitReady: boolean;             // "Visit summary ready" push (default: true)
  caregiverMessages: boolean;      // Caregiver → patient messages (default: true)
  quietHoursStart: number;         // Hour 0-23 (default: 21)
  quietHoursEnd: number;           // Hour 0-23 (default: 8)
}
```

**Backwards compatibility:** When `notificationPreferences` is missing or any field is absent, default to `true` / `21` / `8`. Existing users must keep receiving everything until they explicitly change it.

---

## Phase 1 — Audit & Backend Preference Reader (no behavior changes yet)

### 1a. Read all trigger and notification files

Read these files to fully understand how each notification type is created and sent:

| File | What to learn |
|------|--------------|
| `functions/src/services/medicationReminderService.ts` | How med reminders evaluate and send pushes |
| `functions/src/triggers/medicationFollowUpNudges.ts` | How follow-up nudges are created (grace window, dedup) |
| `functions/src/triggers/actionItemReminderNudges.ts` | 4-phase action reminder logic |
| `functions/src/triggers/actionOverdueNotifier.ts` | Overdue action push logic |
| `functions/src/services/nudgeNotificationService.ts` | Nudge push sender (quiet hours, 3/day limit, priority) |
| `functions/src/routes/nudges.ts` | Nudge CRUD + response handler |
| `functions/src/routes/medicationReminders.ts` | Medication reminder CRUD |
| `functions/src/services/notifications.ts` | Low-level push notification sender |
| `functions/src/routes/users.ts` | User profile GET/PATCH |

### 1b. Build a preference reader utility

Create a helper that all triggers can import:

```typescript
// functions/src/services/notificationPreferences.ts
export interface PatientNotificationPreferences {
  medicationReminders: boolean;
  medicationFollowUps: boolean;
  actionReminders: boolean;
  healthNudges: boolean;
  visitReady: boolean;
  caregiverMessages: boolean;
  quietHoursStart: number;
  quietHoursEnd: number;
}

export function resolveNotificationPreferences(
  profile: Record<string, unknown> | null | undefined,
): PatientNotificationPreferences {
  const prefs = profile?.notificationPreferences as Record<string, unknown> | undefined;
  return {
    medicationReminders: prefs?.medicationReminders !== false,   // default true
    medicationFollowUps: prefs?.medicationFollowUps !== false,
    actionReminders: prefs?.actionReminders !== false,
    healthNudges: prefs?.healthNudges !== false,
    visitReady: prefs?.visitReady !== false,
    caregiverMessages: prefs?.caregiverMessages !== false,
    quietHoursStart: typeof prefs?.quietHoursStart === 'number' ? prefs.quietHoursStart : 21,
    quietHoursEnd: typeof prefs?.quietHoursEnd === 'number' ? prefs.quietHoursEnd : 8,
  };
}

export function isInQuietHours(
  now: Date,
  timezone: string,
  prefs: PatientNotificationPreferences,
): boolean {
  // ... use prefs.quietHoursStart / quietHoursEnd instead of hardcoded 21/8
}
```

### 1c. Ensure `GET /v1/users/me` returns `notificationPreferences`

Read `functions/src/routes/users.ts` to verify the profile response includes all fields (it likely does a spread of the doc, but confirm).

### Phase 1 — Adversarial Review

After writing the preference reader:

- [ ] **Test: defaults on empty profile** — `resolveNotificationPreferences(null)` returns all `true`, quiet hours `21`/`8`
- [ ] **Test: defaults on partial prefs** — `{ notificationPreferences: { medicationReminders: false } }` returns `medicationReminders: false`, everything else `true`
- [ ] **Test: invalid types ignored** — `{ notificationPreferences: { quietHoursStart: "abc" } }` falls back to `21`
- [ ] **Test: explicit false respected** — `{ notificationPreferences: { healthNudges: false } }` returns `healthNudges: false`
- [ ] **Test: quiet hours edge cases** — Start=0, End=23; Start=End (no quiet hours); Start > End (wraps midnight)
- [ ] Run `cd functions && npm test` to verify no regressions

---

## Phase 2 — Wire Preferences Into Backend Triggers

Gate each trigger behind the appropriate preference. **One trigger at a time, test after each.**

### 2a. Medication Reminders

- **File:** `functions/src/services/medicationReminderService.ts`
- **Gate:** Skip sending push if `prefs.medicationReminders === false`
- **Where:** After loading user profile, before calling notification service
- **Note:** The reminder document is still evaluated (so the schedule stays intact) — we just suppress the push

### 2b. Medication Follow-up Nudges

- **File:** `functions/src/triggers/medicationFollowUpNudges.ts`
- **Gate:** Skip creating nudge if `prefs.medicationFollowUps === false`
- **Cascade:** Also skip if `prefs.medicationReminders === false` (follow-ups without reminders make no sense)
- **Where:** Before inserting the nudge document

### 2c. Action Item Reminders

- **Files:** `functions/src/triggers/actionItemReminderNudges.ts` + `functions/src/triggers/actionOverdueNotifier.ts`
- **Gate:** Skip if `prefs.actionReminders === false`
- **Where:** Before creating nudge / sending push

### 2d. Health Nudges (General)

- **File:** `functions/src/services/nudgeNotificationService.ts`
- **Gate:** Skip sending push for nudge types `medication_checkin`, `condition_tracking`, `followup`, `insight` if `prefs.healthNudges === false`
- **Note:** Do NOT gate `medication_followup` here — that's covered by 2b
- **Note:** Do NOT gate `action_reminder` here — that's covered by 2c

### 2e. Visit Ready Notifications

- **File:** Find where "visit summary ready" push is sent (likely in `functions/src/services/visitProcessor.ts` or the processing pipeline)
- **Gate:** Skip if `prefs.visitReady === false`

### 2f. Caregiver Messages

- **File:** `functions/src/routes/care/messages.ts` (the POST handler sends a push after saving)
- **Gate:** Skip push if `prefs.caregiverMessages === false`
- **Note:** The message document is still saved — just the push notification is suppressed. Patient can still see messages when they open the app.

### 2g. Configurable Quiet Hours

- **Files:** `functions/src/services/nudgeNotificationService.ts`, `functions/src/services/medicationReminderService.ts`
- **Change:** Replace hardcoded `21`/`8` with `prefs.quietHoursStart`/`prefs.quietHoursEnd`
- **Note:** Med reminders may currently NOT respect quiet hours (they fire every 5 min). Decide: should med reminders respect quiet hours? (Likely yes, except for `time_sensitive` criticality.)

### Phase 2 — Adversarial Review

After each trigger change, write a test that verifies:

- [ ] **Test: pref=true sends notification** — Default behavior unchanged for users without preferences
- [ ] **Test: pref=false suppresses push** — Notification NOT sent, but data (nudge doc, message doc) still created
- [ ] **Test: med follow-up cascade** — `medicationReminders=false` also suppresses follow-up nudges even if `medicationFollowUps=true`
- [ ] **Test: health nudge type filtering** — `healthNudges=false` suppresses `condition_tracking` but NOT `medication_followup` or `action_reminder`
- [ ] **Test: caregiver message saved without push** — `caregiverMessages=false` → message document exists, push not sent, patient sees message on next app open
- [ ] **Test: custom quiet hours** — `quietHoursStart=22, quietHoursEnd=7` → notifications suppressed at 10:30pm, sent at 7:30am
- [ ] **Test: quiet hours wrap midnight** — `quietHoursStart=23, quietHoursEnd=6` → 11pm-6am is quiet
- [ ] **Test: quiet hours disabled** — `quietHoursStart=0, quietHoursEnd=0` → no quiet hours (24hr notifications OK)
- [ ] Run `cd functions && npm test` — all 554+ tests pass
- [ ] Verify no trigger sends a push without checking preferences (grep for push/notification send calls)

---

## Phase 3 — Mobile Settings UI

### 3a. Read the current patient settings screen

- **File:** `mobile/app/(patient)/settings.tsx`
- Understand current layout, existing push toggle, and how prefs are saved
- Also read caregiver settings (`mobile/app/(caregiver)/settings.tsx`) for the `savePref` / `useUpdateUserProfile` pattern and `HourPickerModal`

### 3b. Build the notification preferences section

Add to the patient settings screen, below the existing push toggle:

```
Notifications
├─ [existing global push toggle stays at top]
│
├─ REMINDERS (section header)
│  ├── Medication Reminders        [toggle]
│  │   "Reminders when it's time to take your medications"
│  ├── Dose Follow-ups             [toggle, indented, hidden if med reminders off]
│  │   "Check-in if you haven't logged a dose"
│  └── Action Item Reminders       [toggle]
│      "Due dates for follow-ups, lab work, and referrals"
│
├─ UPDATES (section header)
│  ├── Health Check-ins            [toggle]
│  │   "Periodic check-ins about your conditions and medications"
│  ├── Visit Summaries             [toggle]
│  │   "When your visit summary is ready to view"
│  └── Caregiver Messages          [toggle]
│      "Messages from your caregiver"
│
└─ SCHEDULE (section header)
   └── Quiet Hours                 [row with time display, tappable]
       "9:00 PM – 8:00 AM"        [opens dual hour picker]
```

### 3c. Implementation details

- Load `notificationPreferences` from `GET /v1/users/me` on mount (same pattern as caregiver settings)
- Save each toggle change immediately via `useUpdateUserProfile` with `{ notificationPreferences: { ...current, changedField: newValue } }`
- Use `useRef` to track latest state across rapid toggles (same pattern as caregiver `alertPrefsRef`)
- When global push is OFF, dim/disable all per-type toggles with a note: "Enable push notifications to configure individual alerts"
- When medication reminders is OFF, hide the follow-up toggle
- For quiet hours, reuse or adapt the `HourPickerModal` from caregiver settings — need two pickers (start/end)

### Phase 3 — Adversarial Review

- [ ] **Test: settings load defaults for new user** — All toggles ON, quiet hours 9pm-8am
- [ ] **Test: settings load saved prefs** — User with `medicationFollowUps: false` → that toggle is OFF, others ON
- [ ] **Test: toggle save roundtrip** — Toggle off → reload screen → toggle still off
- [ ] **Test: follow-up hidden when reminders off** — Disable med reminders → follow-up row disappears
- [ ] **Test: global push off dims all** — Push notifications disabled → all per-type toggles are disabled/dimmed
- [ ] **Test: quiet hours picker** — Change start to 10pm → displays "10:00 PM – 8:00 AM"
- [ ] **Test: rapid toggles don't lose state** — Toggle 3 things quickly → all 3 saved correctly (ref pattern)
- [ ] Run `cd mobile && npx jest` — all tests pass (including existing caregiver + patient tests)
- [ ] Visual review: settings screen looks correct on small (iPhone SE) and large (iPhone 15 Pro Max) screens

---

## Phase 4 — Integration Verification & Cleanup

### 4a. End-to-end flow verification

Walk through these scenarios by reading code paths:

1. **New user signs up** → no `notificationPreferences` on profile → all defaults to true → receives all notification types (backwards compatible)
2. **User disables med follow-ups** → saves to profile → `medicationFollowUpNudges` trigger reads profile, sees `false`, skips nudge creation → user stops getting "Did you take X?" pushes → but med reminders still fire
3. **User disables med reminders** → follow-ups also stop (cascade) → medication-schedule screen still works (times are saved, just no pushes) → user can re-enable later and pushes resume
4. **User sets quiet hours 11pm-6am** → all nudge triggers use custom window → med reminders also respect it (except `time_sensitive` criticality)
5. **User disables caregiver messages push** → caregiver can still send messages → message saved to Firestore → patient sees it when they open Messages tab → just no push notification

### 4b. Edge case review

- [ ] **User disables all types but keeps global push on** — No crashes, no pushes, no errors in Cloud Function logs
- [ ] **User has no timezone set** — Quiet hours fall back to `America/Chicago` (existing behavior)
- [ ] **Profile update race condition** — Two rapid toggles don't overwrite each other (merge, don't replace)
- [ ] **Caregiver settings vs patient settings** — Caregiver's `alertPreferences` and patient's `notificationPreferences` are separate fields, no conflicts

### 4c. Final checks

- [ ] Run `cd functions && npm test` — all backend tests pass
- [ ] Run `cd mobile && npx jest` — all mobile tests pass
- [ ] `cd functions && npm run build` — TypeScript compiles
- [ ] No `console.log` left in production code
- [ ] Update CLAUDE.md with notification preferences documentation

---

## Key Files Reference

| Purpose | Path |
|---------|------|
| Patient settings screen | `mobile/app/(patient)/settings.tsx` |
| Med schedule screen | `mobile/app/(patient)/medication-schedule.tsx` |
| Patient home | `mobile/app/(patient)/index.tsx` |
| Caregiver settings (reference pattern) | `mobile/app/(caregiver)/settings.tsx` |
| Auth context | `mobile/contexts/AuthContext.tsx` |
| Profile mutations | `mobile/lib/api/mutations.ts` (`useUpdateUserProfile`) |
| Med reminder service | `functions/src/services/medicationReminderService.ts` |
| Med follow-up trigger | `functions/src/triggers/medicationFollowUpNudges.ts` |
| Action reminder trigger | `functions/src/triggers/actionItemReminderNudges.ts` |
| Action overdue trigger | `functions/src/triggers/actionOverdueNotifier.ts` |
| Nudge notification service | `functions/src/services/nudgeNotificationService.ts` |
| Nudge routes | `functions/src/routes/nudges.ts` |
| Med reminder routes | `functions/src/routes/medicationReminders.ts` |
| User routes (profile API) | `functions/src/routes/users.ts` |
| Notification service (push sender) | `functions/src/services/notifications.ts` |
| Visit processor (visit-ready push) | `functions/src/services/visitProcessor.ts` |
| Caregiver message push | `functions/src/routes/care/messages.ts` |

---

## Constraints

- Default all prefs to `true` when missing (backwards-compatible)
- Keep the 3 nudges/day limit — it's a good guardrail
- Don't touch the caregiver notification settings (separate: `alertPreferences` + `briefingEnabled` on caregiver profile)
- Med follow-up toggle nests under med reminders (disable parent → child also disabled)
- Global push toggle remains as master override
- Use `savePref` / `useUpdateUserProfile` pattern from caregiver settings
- Send full `notificationPreferences` object on each save (not just the changed field) to avoid partial overwrites in Firestore
- Suppress pushes only — never suppress data creation (nudge docs, message docs still created so in-app display works)
