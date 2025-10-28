# Data Consistency Guide

**Critical Reference**: Always maintain single source of truth across all screens

## Table of Contents
- [Overview](#overview)
- [Data Sources](#data-sources)
- [Common Pitfalls](#common-pitfalls)
- [Best Practices](#best-practices)
- [Component Guidelines](#component-guidelines)
- [Historical Issues](#historical-issues)

---

## Overview

LumiMD uses a PostgreSQL database as the **single source of truth** for all application data. This guide ensures all screens and components query the same data sources to prevent synchronization issues.

### Critical Rule
⚠️ **NEVER** extract data from visit JSON summaries when a database table exists for that data type.

---

## Data Sources

### Database Tables (Primary Sources)

These are the **canonical sources of truth**:

| Data Type | Table | API Endpoint | Usage |
|-----------|-------|--------------|-------|
| **Action Items** | `action_items` | `GET /api/action-items` | ✅ Always use this |
| **Visits** | `visits` | `GET /api/visits` | Visit records |
| **Providers** | `providers` | `GET /api/providers` | Provider info |
| **Users** | `users` | `GET /api/users/me` | User profile |
| **Medications** | `medications` | `GET /api/medical/medications` | Current meds |
| **Conditions** | `conditions` | `GET /api/medical/conditions` | Diagnoses |
| **Allergies** | `allergies` | `GET /api/medical/allergies` | Allergies |
| **Visit Folders** | `visit_folders` | `GET /api/folders` | Organization |
| **Visit Tags** | `visit_tags` | `GET /api/tags` | Tags |

### JSON Fields (Secondary - Display Only)

These are **static snapshots** and should NOT be used for queries or aggregations:

| Field | Location | Purpose | When to Use |
|-------|----------|---------|-------------|
| `visit.summary.actionItems` | `visits.summary` | Historical snapshot | ❌ Display only, don't query |
| `visit.summary.medications` | `visits.summary` | What was discussed | ❌ Display only |
| `visit.summary.diagnoses` | `visits.summary` | AI-extracted data | ❌ Display only |
| `visit.transcription` | `visits.transcription` | Audio transcript | ✅ Display transcript text |

---

## Common Pitfalls

### ❌ Pitfall 1: Extracting Action Items from Visit Summaries

**WRONG:**
```typescript
// ❌ DO NOT DO THIS
const data = await listVisits(1, 100);
const items = [];
data.visits.forEach((visit) => {
  if (visit.summary?.actionItems) {
    visit.summary.actionItems.forEach((item) => {
      items.push(item); // Wrong source!
    });
  }
});
```

**CORRECT:**
```typescript
// ✅ DO THIS
const items = await listActionItems({ completed: false });
```

**Why:** The `action_items` table is the source of truth. Visit summaries are historical snapshots that don't reflect updates (completion, deletion, etc.).

---

### ❌ Pitfall 2: Storing State in AsyncStorage Instead of Database

**WRONG:**
```typescript
// ❌ DO NOT DO THIS
await AsyncStorage.setItem('completedItems', JSON.stringify(completed));
```

**CORRECT:**
```typescript
// ✅ DO THIS
await updateActionItem(itemId, { completed: true });
```

**Why:** AsyncStorage is device-local and doesn't sync across devices or screens.

---

### ❌ Pitfall 3: Using Different Data Sources for the Same Information

**WRONG:**
```typescript
// HomeScreen.tsx - Using database ✅
const items = await listActionItems({ completed: false });

// ActionItemsList.tsx - Using visit summaries ❌
const visits = await listVisits();
const items = visits.flatMap(v => v.summary?.actionItems || []);
```

**CORRECT:**
```typescript
// Both screens use the same source ✅
const items = await listActionItems({ completed: false });
```

**Why:** Different sources lead to different counts and out-of-sync displays.

---

## Best Practices

### 1. Always Query Database Tables First

```typescript
// ✅ Good pattern
const loadData = async () => {
  // Query database table
  const actionItems = await listActionItems({ completed: false });

  // Optionally enrich with visit data
  const visits = await listVisits();
  const visitsMap = new Map(visits.visits.map(v => [v.id, v]));

  const enrichedItems = actionItems.map(item => ({
    ...item,
    visit: visitsMap.get(item.visitId)
  }));

  return enrichedItems;
};
```

### 2. Use API Service Functions

Always use the typed API service functions:

```typescript
// ✅ Import from API services
import { listActionItems, updateActionItem } from '@/shared/services/api/actionItems';
import { listVisits } from '@/shared/services/api/visits';
import { listProviders } from '@/shared/services/api/providers';

// ❌ Don't make raw axios calls
import axios from 'axios';
```

### 3. Update Database, Not Local State

```typescript
// ✅ Update database
const toggleComplete = async (itemId: string) => {
  // Optimistic update
  setItems(prev => prev.map(i =>
    i.id === itemId ? { ...i, completed: !i.completed } : i
  ));

  // Persist to database
  try {
    await updateActionItem(itemId, { completed: true });
  } catch (err) {
    // Revert on error
    setItems(prev => prev.map(i =>
      i.id === itemId ? { ...i, completed: false } : i
    ));
  }
};
```

### 4. Reload Data on Focus

```typescript
// ✅ Refresh data when screen gains focus
import { useFocusEffect } from 'expo-router';

useFocusEffect(
  useCallback(() => {
    loadData();
  }, [loadData])
);
```

---

## Component Guidelines

### Home Screen (`src/features/home/HomeScreen.tsx`)

**Data Sources:**
- ✅ Action Items: `listActionItems({ completed: false })`
- ✅ Visits: `listVisits(1, 50)`
- ✅ User: `useAuth()` context

**Purpose:** Display summary statistics and most urgent action item.

### Action Items List (`src/features/action-items/ActionItemsList.tsx`)

**Data Sources:**
- ✅ Action Items: `listActionItems({ completed: false })`
- ✅ Visits: `listVisits(1, 100)` (for enrichment only)

**Purpose:** Display all action items with completion toggle.

**Updates:**
- ✅ Use `updateActionItem()` to toggle completion
- ✅ Optimistic updates with error rollback

### Visit Detail Screens

**Data Sources:**
- ✅ Visit Details: `getVisitById(visitId)`
- ✅ Visit Summary: `getVisitSummary(visitId)`
- ✅ Visit Transcript: `getVisitTranscript(visitId)`

**Display Only:**
- ✅ `visit.summary.actionItems` - Show what was discussed
- ℹ️ Add note: "Action items are tracked separately in the Tasks tab"

---

## Historical Issues

### Issue 1: Deprecated expo-file-system API (Oct 2024)

**Problem:** App crashes with deprecation errors when recording visits.

**Error Messages:**
```
Method getInfoAsync imported from "expo-file-system" is deprecated.
Method copyAsync imported from "expo-file-system" is deprecated.
```

**Root Cause:**
- Expo SDK 54 deprecated the old file system API
- Code was using `import * as FileSystem from 'expo-file-system'`
- New API uses File/Directory classes instead

**Solution:**
- Changed imports to use legacy API: `import * as FileSystem from 'expo-file-system/legacy'`
- Added TODO comments to migrate to new API in future
- Maintains compatibility with existing code

**Files Changed:**
- `src/shared/services/LocalStorageService.ts`
- `src/features/visits/VisitRecorder.tsx`

**Future Work:**
- Migrate to new File/Directory API when time permits
- See: https://docs.expo.dev/versions/v54.0.0/sdk/filesystem/

---

### Issue 2: Action Items Not Syncing (Oct 2024)

**Problem:** Home screen showed 0 action items while Tasks tab showed 2.

**Root Cause:**
- Home screen queried `action_items` table (correct)
- Tasks tab extracted from `visit.summary.actionItems` JSON (incorrect)
- Two different data sources = different results

**Solution:**
- Updated `ActionItemsList.tsx` to use `listActionItems()` API
- Removed AsyncStorage for completion state
- Changed to database updates via `updateActionItem()`

**Files Changed:**
- `src/features/action-items/ActionItemsList.tsx`
- Added `listActionItems` and `updateActionItem` imports
- Removed `AsyncStorage` usage
- Updated `load()` function to query database
- Updated `toggleComplete()` to use API

**Commit Reference:** "Fix action items sync - use database as single source of truth"

---

## Quick Reference Checklist

When building a new feature that displays data:

- [ ] Check if a database table exists for this data type
- [ ] Use the API service function (not raw axios)
- [ ] Never extract from JSON fields if a table exists
- [ ] Update database for state changes (not AsyncStorage)
- [ ] Reload data on screen focus
- [ ] Use optimistic updates with error rollback
- [ ] Test that data syncs across all screens showing the same info

---

## API Service Reference

All API services are located in `src/shared/services/api/`:

```typescript
// Action Items
import {
  listActionItems,
  getActionItemById,
  createActionItem,
  updateActionItem,
  completeActionItem,
  deleteActionItem,
  getActionItemStatistics
} from '@/shared/services/api/actionItems';

// Visits
import {
  listVisits,
  getVisitById,
  getVisitSummary,
  getVisitTranscript,
  submitVisitRecording,
  updateVisit,
  deleteVisit
} from '@/shared/services/api/visits';

// Providers
import {
  listProviders,
  getProviderById,
  createProvider,
  updateProvider,
  deleteProvider
} from '@/shared/services/api/providers';
```

---

## Testing Data Consistency

Before shipping a feature, verify:

1. **Data matches across screens:**
   - Navigate between Home and Tasks tabs
   - Verify counts match
   - Verify items shown are the same

2. **Updates propagate:**
   - Mark an item complete in Tasks tab
   - Navigate to Home screen
   - Verify count decreased

3. **Refresh works:**
   - Pull to refresh on each screen
   - Verify latest data loads

4. **Offline graceful degradation:**
   - Turn off network
   - Verify error states
   - Turn on network
   - Verify data reloads

---

## Questions?

If you're unsure about data sources:

1. Check this document first
2. Look at existing screens that display similar data
3. Check the database schema in `backend/prisma/schema.prisma`
4. Ask: "Is there a database table for this?" If yes, use it.

**Remember:** Database tables are ALWAYS the source of truth, not JSON fields.
