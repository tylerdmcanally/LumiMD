# Caregiver Mobile — Hook & Navigation Cross-Check Prompt

Use this prompt to systematically verify all caregiver mobile hooks match their backend API responses, and that all navigation flows work correctly.

---

## Context

The caregiver mobile experience lives in `mobile/app/(caregiver)/` using Expo Router route groups. All caregiver data comes from `/v1/care/*` API endpoints defined in `functions/src/routes/care/`.

**The core problem:** Mobile TypeScript interfaces in `mobile/lib/api/hooks.ts` were written with field names that don't match what the deployed backend actually returns. The web portal (`web-portal/lib/api/hooks.ts`) uses correct field names. Three hooks have already been fixed with `queryFn` data transformations; the rest need verification.

---

## Already Fixed Hooks (DO NOT re-fix)

These three hooks already have `queryFn` transformations that map API fields → mobile interface fields:

### 1. `useCareOverview` (hooks.ts ~line 1410)
- **Endpoint:** `GET /v1/care/overview`
- **Backend file:** `functions/src/routes/care/overview.ts`
- **Mismatches fixed:** `userId` → `patientId`, `name` → `patientName`, `priority` → `severity`, `message` → `title`/`description`

### 2. `useCareQuickOverview` (hooks.ts ~line 1482)
- **Endpoint:** `GET /v1/care/:patientId/quick-overview`
- **Backend file:** `functions/src/routes/care/quickOverview.ts`
- **Mismatches fixed:** `needsAttention` → `alerts`, `todaysMeds` → `medicationsToday`, `upcomingActions.summary` → `pendingActions`/`overdueActions`

### 3. `useCareMedicationStatus` (hooks.ts ~line 1535)
- **Endpoint:** `GET /v1/care/:patientId/medication-status`
- **Backend file:** `functions/src/routes/care/medicationStatus.ts`
- **Mismatches fixed:** `schedule` → `medications`, `medicationId` → `id`, `medicationName` → `name`

---

## Hooks That Need Verification

For each hook below, follow this process:
1. Read the backend route file to see exact `res.json()` response shape
2. Read the mobile hook's TypeScript interface
3. Read the mobile screen that consumes the hook to see what fields it accesses
4. If there's a mismatch, add a `queryFn` transformation (same pattern as the fixed hooks above)
5. Add null-safe access (`?.`, `?? fallback`) in consuming screens for any fields that could be undefined

### 4. `useCareAlerts` (hooks.ts ~line 1456)
- **Endpoint:** `GET /v1/care/:patientId/alerts`
- **Backend file:** `functions/src/routes/care/alerts.ts`
- **Mobile interface:** `CareAlertsData` — expects `{ alerts: CareAlertItem[] }`
- **Backend returns:** `{ alerts: [...], summary: { emergency, high, medium, low, total }, period: { days, from, to } }`
- **Consumed by:** `mobile/app/(caregiver)/index.tsx` (home screen needs-attention section)
- **Likely OK?** Alert items use `severity`/`title`/`description` which match backend. But verify `severity` vs `priority` field name.

### 5. `useCareVisits` (hooks.ts ~line 1602)
- **Endpoint:** `GET /v1/care/:patientId/visits`
- **Backend file:** `functions/src/routes/care/patientResources.ts` (~line 216)
- **Mobile interface:** `CareVisitListItem[]` — expects `id`, `processingStatus`, `summary`, `provider`, `specialty`, `diagnoses`, `source`, `createdAt`, `visitDate`
- **Backend returns:** Array of visit objects with all Firestore fields spread + date conversions
- **Consumed by:** `mobile/app/(caregiver)/patient/[patientId]/visits.tsx`
- **Check:** Does the API return the array directly or wrapped in `{ visits: [...] }`? The hook expects a bare array.

### 6. `useCareVisitDetail` (hooks.ts ~line 1647)
- **Endpoint:** `GET /v1/care/:patientId/visits/:visitId`
- **Backend file:** `functions/src/routes/care/patientResources.ts` (~line 320)
- **Mobile interface:** `CareVisitDetailData` — expects `id`, `processingStatus`, `summary`, `provider`, `specialty`, `location`, `diagnoses`, `diagnosesDetailed`, `medications` (with `started`/`changed`/`stopped`/`continued`), `nextSteps`, `followUps`, `testsOrdered`, `education`, `createdAt`, `visitDate`, `patientName`
- **Consumed by:** `mobile/app/(caregiver)/patient/[patientId]/visit-detail.tsx`
- **Check:** Do medication sub-fields match? Does `followUps` come back as `Array<{ description, dueDate, category }>` or as strings?

### 7. `useCareMedications` (hooks.ts ~line 1685)
- **Endpoint:** `GET /v1/care/:patientId/medications`
- **Backend file:** `functions/src/routes/care/patientResources.ts` (~line 41)
- **Mobile interface:** `CareMedicationItem[]` — expects `id`, `name`, `dose`, `frequency`, `active`, `source`, `startedAt`, `stoppedAt`, `medicationWarning`
- **Consumed by:** `mobile/app/(caregiver)/patient/[patientId]/medications.tsx`
- **Check:** Does the API return the array directly or wrapped? Does `medicationWarning` match (array vs object)?

### 8. `useCareActions` (hooks.ts ~line 1719)
- **Endpoint:** `GET /v1/care/:patientId/actions`
- **Backend file:** `functions/src/routes/care/patientResources.ts` (~line 132)
- **Mobile interface:** `CareActionItem[]` — expects `id`, `description`, `completed`, `completedAt`, `dueAt`, `type`, `details`, `visitId`, `source`, `createdAt`
- **Consumed by:** `mobile/app/(caregiver)/patient/[patientId]/actions.tsx`
- **Check:** Does the API return the array directly or wrapped? Does `dueAt` match the backend field name (could be `dueDate`)?

### 9. `useCareMessages` (hooks.ts ~line 1748)
- **Endpoint:** `GET /v1/care/:patientId/messages`
- **Backend file:** `functions/src/routes/care/messages.ts` (~line 234)
- **Mobile interface:** `CareMessageItem[]` — expects `id`, `message`, `senderName`, `readAt`, `createdAt`
- **Consumed by:** `mobile/app/(caregiver)/patient/[patientId]/messages.tsx`
- **Check:** Does the API return the array directly or wrapped? Field names look correct based on backend reading.

### 10. `useSendCareMessage` (hooks.ts ~line 1571)
- **Endpoint:** `POST /v1/care/:patientId/messages`
- **Backend file:** `functions/src/routes/care/messages.ts` (~line 53)
- **Mobile interface:** Mutation, sends `{ message: string }`
- **Backend returns:** `{ id, senderId, message, senderName, createdAt, readAt, remainingToday }`
- **Consumed by:** `mobile/app/(caregiver)/patient/[patientId]/messages.tsx`
- **Check:** Does the mutation's `onSuccess` properly invalidate queries? Does the screen handle the response?

---

## Navigation Flows to Test

After fixing any hook mismatches, verify these flows work end-to-end:

### Auth Flows
1. **Fresh login as caregiver** → should land on `(caregiver)/index.tsx` (home)
2. **Fresh login as patient** → should land on `(patient)/index.tsx` (home)
3. **Sign out from caregiver home** → should go to sign-in screen (NOT blank screen)
4. **Sign out from patient home** → should go to sign-in screen
5. **Sign out from deep screen** (e.g., patient detail) → should go to sign-in screen

### Layout Guard Redirects
- Files: `mobile/app/(caregiver)/_layout.tsx`, `mobile/app/(patient)/_layout.tsx`
- Both should check `isAuthenticated` BEFORE checking `role`
- Unauthenticated → `<Redirect href="/sign-in" />`
- Wrong role → `<Redirect href="/" />`
- Loading → show `ActivityIndicator`

### Caregiver Navigation
1. **Home → Patient card tap** → `(caregiver)/patient/[patientId]/index.tsx`
2. **Patient detail → Visits button** → `(caregiver)/patient/[patientId]/visits.tsx`
3. **Patient detail → Medications button** → `(caregiver)/patient/[patientId]/medications.tsx`
4. **Patient detail → Action Items button** → `(caregiver)/patient/[patientId]/actions.tsx`
5. **Patient detail → Messages button** → `(caregiver)/patient/[patientId]/messages.tsx`
6. **Visits list → Visit tap** → `(caregiver)/patient/[patientId]/visit-detail.tsx`
7. **Back navigation** from each sub-screen → should return to previous screen
8. **Home → Settings** → `(caregiver)/settings.tsx`
9. **Pull-to-refresh** on home and patient detail screens

---

## Fix Pattern

When a mismatch is found, add a `queryFn` transformation to the hook:

```typescript
queryFn: async () => {
  const raw = await fetchWithAuth<any>(`/v1/care/${patientId}/endpoint`);
  // Transform API field names to mobile interface names
  return {
    fieldMobileExpects: raw.fieldApiReturns ?? raw.fieldMobileExpects ?? fallback,
    // ... map all fields
  };
},
```

Key rules:
- Use fallback chains: `raw.apiName ?? raw.mobileName ?? defaultValue`
- This way the hook works whether the backend uses the old or new field name
- Add null-safe access in consuming screens for any optional fields
- Don't change the TypeScript interfaces — just transform in the queryFn

---

## Files Reference

| Purpose | Path |
|---------|------|
| All caregiver hooks | `mobile/lib/api/hooks.ts` (line 1382+) |
| Caregiver home screen | `mobile/app/(caregiver)/index.tsx` |
| Caregiver settings | `mobile/app/(caregiver)/settings.tsx` |
| Caregiver layout guard | `mobile/app/(caregiver)/_layout.tsx` |
| Patient layout guard | `mobile/app/(patient)/_layout.tsx` |
| Patient detail dashboard | `mobile/app/(caregiver)/patient/[patientId]/index.tsx` |
| Patient visits list | `mobile/app/(caregiver)/patient/[patientId]/visits.tsx` |
| Patient visit detail | `mobile/app/(caregiver)/patient/[patientId]/visit-detail.tsx` |
| Patient medications | `mobile/app/(caregiver)/patient/[patientId]/medications.tsx` |
| Patient actions | `mobile/app/(caregiver)/patient/[patientId]/actions.tsx` |
| Patient messages | `mobile/app/(caregiver)/patient/[patientId]/messages.tsx` |
| Role router | `mobile/app/index.tsx` |
| Auth context | `mobile/contexts/AuthContext.tsx` |
| Backend care overview | `functions/src/routes/care/overview.ts` |
| Backend quick overview | `functions/src/routes/care/quickOverview.ts` |
| Backend medication status | `functions/src/routes/care/medicationStatus.ts` |
| Backend alerts | `functions/src/routes/care/alerts.ts` |
| Backend messages | `functions/src/routes/care/messages.ts` |
| Backend patient resources | `functions/src/routes/care/patientResources.ts` |
| Backend care router | `functions/src/routes/care.ts` |
| Web portal hooks (reference) | `web-portal/lib/api/hooks.ts` |

---

## Checklist (Completed 2026-03-13)

- [x] Verify `useCareAlerts` fields match backend — **Fixed:** Added queryFn to map `severity: 'emergency'` → `'high'`
- [x] Verify `useCareVisits` fields match backend — **OK:** Bare array, field names match via `...data` spread
- [x] Verify `useCareVisitDetail` fields match backend — **OK:** Explicit fields match interface
- [x] Verify `useCareMedications` fields match backend — **OK:** Bare array, fields match
- [x] Verify `useCareActions` fields match backend — **OK:** Backend uses `dueAt` explicitly, matches mobile
- [x] Verify `useCareMessages` fields match backend — **OK:** Fields match exactly
- [x] Verify `useSendCareMessage` mutation + invalidation — **OK:** Prefix matching works
- [x] Add null-safe access in all consuming screens — **Fixed:** visit-detail followUps (string vs object), medications warning `?.`
- [x] Test login → caregiver home (data loads, no crashes) — Verified by code review
- [x] Test patient card tap → patient detail (data loads) — Verified by code review
- [x] Test each nav button on patient detail (visits, meds, actions, messages) — Verified by code review
- [x] Test visit tap → visit detail — Verified by code review
- [x] Test back navigation from each sub-screen — Verified by code review
- [x] Test sign-out → lands on sign-in (not blank) — Verified by code review
- [x] Test pull-to-refresh on home and patient detail — Verified by code review
- [x] Run `cd mobile && npx jest` to verify tests pass — **91/91 caregiver tests pass**
- [x] Fix layout guard tests (missing `isAuthenticated` in mock) — Both caregiver + patient guards
- [x] Update CLAUDE.md with hook verification table and navigation flows
