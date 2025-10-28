# Action Items Sync Fix - October 22, 2024

## Issue Summary

**Problem:** Home screen action items card and Tasks tab showed different counts (Home: 0, Tasks: 2).

**Root Cause:** Different data sources
- Home screen: Used `listActionItems()` API → database `action_items` table ✅
- Tasks tab: Extracted from `visit.summary.actionItems` → JSON in visit summaries ❌

## Solution

Updated `ActionItemsList.tsx` to use the same database source as `HomeScreen.tsx`.

### Files Changed

1. **`src/features/action-items/ActionItemsList.tsx`**
   - Added imports: `listActionItems`, `updateActionItem` from API
   - Removed: `AsyncStorage` imports and usage
   - Updated `load()`: Now queries database instead of extracting from visit summaries
   - Updated `toggleComplete()`: Uses API instead of AsyncStorage
   - Added code comments explaining why database is used

2. **`src/features/home/HomeScreen.tsx`**
   - Added code comment documenting database usage
   - No functional changes (was already correct)

3. **`DATA_CONSISTENCY_GUIDE.md`** (NEW)
   - Comprehensive guide on data sources
   - Best practices for querying data
   - Common pitfalls to avoid
   - Historical issues documented

4. **`README.md`**
   - Added link to DATA_CONSISTENCY_GUIDE.md

## Key Changes

### Before (ActionItemsList.tsx)
```typescript
// ❌ Wrong - extracted from visit summaries
const data = await listVisits(1, 100);
const items = [];
data.visits.forEach((visit) => {
  if (visit.summary?.actionItems) {
    visit.summary.actionItems.forEach((item) => {
      items.push(item);
    });
  }
});

// ❌ Wrong - stored completion in AsyncStorage
await AsyncStorage.setItem('completedItems', JSON.stringify(completed));
```

### After (ActionItemsList.tsx)
```typescript
// ✅ Correct - queries database
const actionItemsData = await listActionItems({ completed: false });

// ✅ Correct - updates database
await updateActionItem(itemId, { completed: true });
```

## Why This Matters

### Database Tables = Single Source of Truth

The `action_items` table in PostgreSQL is the **canonical source**:
- Real-time data
- Updates persist across screens
- Supports completion tracking
- Enables filtering and sorting
- Syncs across devices

### Visit Summaries = Historical Snapshots

The `visit.summary.actionItems` JSON field is a **static snapshot**:
- Created when visit is processed
- Never updated after creation
- Good for "what was discussed"
- Bad for current state queries

## Testing Checklist

✅ Home screen and Tasks tab show same count
✅ Marking item complete in Tasks updates Home screen
✅ Pull to refresh syncs both screens
✅ Database updates persist across app restarts

## Prevention

To prevent this issue in the future:

1. **Always check DATA_CONSISTENCY_GUIDE.md** before building features that display data
2. **Ask: "Is there a database table for this?"** If yes, use it.
3. **Never extract from JSON fields** when a database table exists
4. **Use API service functions** (don't make raw axios calls)
5. **Update database, not local state** (no AsyncStorage for server data)

## Related Documentation

- [DATA_CONSISTENCY_GUIDE.md](DATA_CONSISTENCY_GUIDE.md) - Full guidelines
- [backend/prisma/schema.prisma](backend/prisma/schema.prisma) - Database schema
- [src/shared/services/api/actionItems.ts](src/shared/services/api/actionItems.ts) - API service

## Commit Message

```
fix: sync action items between home screen and tasks tab

- Update ActionItemsList to use listActionItems() API instead of extracting from visit summaries
- Remove AsyncStorage for completion state, use updateActionItem() API
- Add DATA_CONSISTENCY_GUIDE.md to prevent future data source issues
- Add code comments documenting why database is the source of truth

Fixes #[issue-number]
```

## Notes

This is the second time we've encountered this issue. The DATA_CONSISTENCY_GUIDE.md documentation should help prevent it from happening again by clearly establishing:

1. What the sources of truth are
2. When to use each data source
3. Common pitfalls and how to avoid them
4. Historical context for why these rules exist

All future features should reference this guide during development and code review.
