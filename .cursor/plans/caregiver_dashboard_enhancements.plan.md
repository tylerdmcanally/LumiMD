# Caregiver Dashboard Enhancements

## Overview

This plan covers three major enhancements to the caregiver dashboard:
1. **Health Metrics Dashboard** - Visualize patient vitals and trends
2. **Medication Adherence Tracking** - Track medication compliance over time
3. **Quick Actions Dashboard** - At-a-glance overview with actionable insights

---

## Current Data Structures

### Health Logs (`healthLogs` collection)
- Types: `bp` (blood pressure), `glucose`, `weight`, `med_compliance`, `symptom_check`
- Values include: systolic/diastolic, glucose reading, weight, etc.
- Alert levels: `normal`, `caution`, `warning`, `emergency`
- Timestamps and sources tracked

### Medication Logs (`medicationLogs` collection)
- Tracks: `taken`, `skipped`, `snoozed` actions
- Links to medication ID and scheduled date/time
- Used for daily schedule status

### Existing Endpoints
- `GET /v1/health-logs` - Patient's health logs
- `GET /v1/health-logs/summary` - Aggregated health summary
- `GET /v1/care/:patientId/medication-status` - Today's medication status

---

## Phase 1: Backend APIs for Caregiver Access

**Goal:** Create caregiver-accessible endpoints for health data

### 1.1 Health Logs API for Caregivers

**New endpoint:** `GET /v1/care/:patientId/health-logs`

```typescript
// Query params
{
  type?: 'bp' | 'glucose' | 'weight' | 'all',
  days?: number, // default 30
  limit?: number
}

// Response
{
  logs: HealthLog[],
  summary: {
    bp: { count, latest, avg, min, max, trend },
    glucose: { count, latest, avg, min, max, trend },
    weight: { count, latest, change, trend }
  }
}
```

### 1.2 Medication Adherence API

**New endpoint:** `GET /v1/care/:patientId/medication-adherence`

```typescript
// Query params
{
  days?: number, // default 30
  medicationId?: string // optional filter
}

// Response
{
  overall: {
    totalDoses: number,
    takenDoses: number,
    skippedDoses: number,
    missedDoses: number,
    adherenceRate: number // percentage
  },
  byMedication: Array<{
    medicationId: string,
    medicationName: string,
    totalDoses: number,
    takenDoses: number,
    adherenceRate: number,
    streak: number // consecutive days taken
  }>,
  calendar: Array<{
    date: string, // YYYY-MM-DD
    scheduled: number,
    taken: number,
    skipped: number,
    missed: number
  }>,
  patterns: {
    bestTimeOfDay: string,
    worstTimeOfDay: string,
    missedDays: string[] // e.g., "weekends"
  }
}
```

### 1.3 Quick Overview API

**New endpoint:** `GET /v1/care/:patientId/quick-overview`

```typescript
// Response
{
  needsAttention: Array<{
    type: 'missed_med' | 'overdue_action' | 'health_alert' | 'no_recent_logs',
    priority: 'high' | 'medium' | 'low',
    message: string,
    actionUrl?: string
  }>,
  todaysMeds: {
    total: number,
    taken: number,
    pending: number,
    missed: number
  },
  recentActivity: Array<{
    type: 'med_taken' | 'health_log' | 'visit',
    description: string,
    timestamp: string
  }>,
  healthSnapshot: {
    latestBp?: { value: string, alertLevel: string, date: string },
    latestGlucose?: { value: string, alertLevel: string, date: string },
    latestWeight?: { value: string, change?: string, date: string }
  }
}
```

**Files to modify:**
- `functions/src/routes/care.ts`

---

## Phase 2: Health Metrics Dashboard (Frontend)

**Goal:** Create a visual health metrics page for caregivers

### 2.1 New Page: `/care/[patientId]/health`

**Components:**
1. **Metric Summary Cards** - Latest BP, glucose, weight with trend indicators
2. **Trend Charts** - Line charts showing values over time (using recharts)
3. **Alert History** - List of concerning readings
4. **Log Table** - Detailed view of all logs with filtering

### 2.2 UI Components

```
┌─────────────────────────────────────────────────────────────┐
│ ← Back to Overview                           [Date Range ▼] │
├─────────────────────────────────────────────────────────────┤
│                    Health Metrics                           │
├──────────────┬──────────────┬──────────────┬───────────────┤
│ Blood        │ Blood        │ Weight       │ Recent        │
│ Pressure     │ Glucose      │              │ Alerts        │
│ 128/82       │ 142 mg/dL    │ 185 lbs      │ 2 this week   │
│ ↗ trending up│ → stable     │ ↓ -2 lbs     │               │
├──────────────┴──────────────┴──────────────┴───────────────┤
│ [BP] [Glucose] [Weight]  ← Tab selection                   │
│ ┌─────────────────────────────────────────────────────────┐│
│ │                                                         ││
│ │              📈 Line Chart (30 days)                    ││
│ │                                                         ││
│ └─────────────────────────────────────────────────────────┘│
├─────────────────────────────────────────────────────────────┤
│ Recent Readings                              [Export CSV]   │
│ ┌───────────┬────────────┬─────────┬───────────┐           │
│ │ Date      │ Type       │ Value   │ Status    │           │
│ ├───────────┼────────────┼─────────┼───────────┤           │
│ │ Jan 15    │ BP         │ 128/82  │ ⚠ Caution │           │
│ │ Jan 15    │ Glucose    │ 142     │ ✓ Normal  │           │
│ └───────────┴────────────┴─────────┴───────────┘           │
└─────────────────────────────────────────────────────────────┘
```

### 2.3 Data Hooks

**New hooks in `web-portal/lib/api/hooks.ts`:**
- `useCareHealthLogs(patientId, options)`
- `useCareHealthSummary(patientId)`

**Files to create:**
- `web-portal/app/care/[patientId]/health/page.tsx`

**Files to modify:**
- `web-portal/lib/api/hooks.ts`
- `web-portal/app/care/[patientId]/page.tsx` (add Health quick action)

---

## Phase 3: Medication Adherence Tracking (Frontend)

**Goal:** Visualize medication adherence patterns

### 3.1 New Page: `/care/[patientId]/adherence`

**Components:**
1. **Overall Adherence Score** - Percentage with trend
2. **Calendar Heatmap** - Color-coded days showing adherence
3. **Per-Medication Breakdown** - Adherence by medication
4. **Pattern Insights** - AI-identified patterns

### 3.2 UI Components

```
┌─────────────────────────────────────────────────────────────┐
│ ← Back to Overview                          [Last 30 Days ▼]│
├─────────────────────────────────────────────────────────────┤
│               Medication Adherence                          │
├──────────────────────┬──────────────────────────────────────┤
│                      │  Calendar View                       │
│   Overall: 87%       │  ┌─────────────────────────────────┐ │
│   ████████░░         │  │ M  T  W  T  F  S  S             │ │
│                      │  │ 🟢 🟢 🟡 🟢 🟢 🔴 🟢             │ │
│   ↗ +5% vs last      │  │ 🟢 🟢 🟢 🟡 🟢 🟢 🟢             │ │
│      month           │  │ 🟢 🟢 🟢 🟢 🟢 🟡 🟢             │ │
│                      │  └─────────────────────────────────┘ │
├──────────────────────┴──────────────────────────────────────┤
│ By Medication                                               │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Lisinopril 10mg          ████████████░░░ 92%           │ │
│ │ Metformin 500mg          █████████░░░░░░ 78%           │ │
│ │ Atorvastatin 20mg        ████████████████ 100%         │ │
│ └─────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│ 💡 Patterns Detected                                        │
│ • Most doses missed on weekends                             │
│ • Evening medications have lower adherence                  │
│ • 5-day streak currently active                             │
└─────────────────────────────────────────────────────────────┘
```

### 3.3 Data Hooks

**New hooks:**
- `useCareMedicationAdherence(patientId, options)`

**Files to create:**
- `web-portal/app/care/[patientId]/adherence/page.tsx`

**Files to modify:**
- `web-portal/lib/api/hooks.ts`
- `web-portal/app/care/[patientId]/page.tsx` (add Adherence quick action)

---

## Phase 4: Quick Actions Dashboard (Frontend)

**Goal:** Enhance the main caregiver overview with actionable widgets

### 4.1 Enhance Patient Detail Page: `/care/[patientId]`

**New sections:**
1. **Needs Attention Banner** - Urgent items at top
2. **Health Snapshot Widget** - Latest vitals mini-cards
3. **Today's Medication Progress** - Visual progress bar
4. **Recent Activity Feed** - Last 5 activities

### 4.2 UI Layout

```
┌─────────────────────────────────────────────────────────────┐
│ ← Back to Care Dashboard                                    │
├─────────────────────────────────────────────────────────────┤
│ Patient: John Smith                                         │
├─────────────────────────────────────────────────────────────┤
│ ⚠️ NEEDS ATTENTION                                          │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ 🔴 2 missed medications today                     [View]│ │
│ │ 🟡 Blood pressure reading elevated (138/92)       [View]│ │
│ └─────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│ Today's Medications                    8 of 12 taken (67%)  │
│ ████████████████████░░░░░░░░░░                              │
│ [View Schedule →]                                           │
├────────────────────────────┬────────────────────────────────┤
│ Health Snapshot            │ Recent Activity                │
│ ┌────────┬────────┐        │ • Took Lisinopril (2h ago)    │
│ │ BP     │ 128/82 │        │ • Logged BP reading (4h ago)  │
│ │ ⚠ high │ today  │        │ • Skipped Metformin (6h ago)  │
│ ├────────┼────────┤        │ • Visit with Dr. Smith (1d)   │
│ │Glucose │ 142    │        │                                │
│ │ normal │ today  │        │                                │
│ └────────┴────────┘        │                                │
├────────────────────────────┴────────────────────────────────┤
│ Quick Actions                                               │
│ [Visits] [Health] [Adherence] [Providers] [Medications]     │
└─────────────────────────────────────────────────────────────┘
```

### 4.3 Data Hook

Uses `useCareQuickOverview(patientId)` (new hook)

**Files to modify:**
- `web-portal/app/care/[patientId]/page.tsx` (major enhancement)
- `web-portal/lib/api/hooks.ts`

---

## Implementation Order

| Phase | Description | Effort | Dependencies |
|-------|-------------|--------|--------------|
| 1.1 | Health Logs API | Medium | None |
| 1.2 | Medication Adherence API | Medium | None |
| 1.3 | Quick Overview API | Low | 1.1, 1.2 |
| 2 | Health Metrics Page | High | 1.1 |
| 3 | Adherence Page | Medium | 1.2 |
| 4 | Quick Actions Dashboard | Medium | 1.3 |

**Recommended build order:** 1.1 → 2 → 1.2 → 3 → 1.3 → 4

This allows testing each feature end-to-end before moving to the next.

---

## Dependencies to Add

```bash
# For charts (if not already installed)
npm install recharts
```

---

## Key Decisions

1. **Read-only for caregivers** - Caregivers can view health data but not create logs
2. **Date range defaults** - 30 days for trends, 7 days for quick overview
3. **Alert thresholds** - Use existing safety checker thresholds
4. **Caching strategy** - 5-minute stale time for health data
5. **Mobile responsiveness** - All new pages must work on mobile

---

## Success Metrics

- Caregiver can view patient health trends within 2 clicks
- Medication adherence visible at a glance
- Urgent items surfaced prominently
- Page load times < 2 seconds
