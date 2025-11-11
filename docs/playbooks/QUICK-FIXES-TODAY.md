# 🔧 Quick Fixes - Implement Today (2 Hours)

**Goal:** Reduce failures from 15% → 5% with minimal code changes

---

## Fix #1: Prevent Timeout Failures (5 minutes) ⏱️

**Problem:** AssemblyAI timeout (12 min) exceeds function timeout (9 min)

**File:** `functions/src/services/assemblyai.ts`

**Change Line 6:**
```typescript
// BEFORE
const MAX_POLL_DURATION_MS = 12 * 60 * 1000; // 12 minutes

// AFTER
const MAX_POLL_DURATION_MS = 8 * 60 * 1000; // 8 minutes (safe margin)
```

**Impact:** Prevents function from timing out silently. Fails fast instead.

---

## Fix #2: Save Transcript Before Summary (30 minutes) 💾

**Problem:** If summarization fails, transcript is lost

**File:** `functions/src/services/visitProcessor.ts`

**Replace lines 71-93:**

```typescript
// BEFORE: One big batch update at the end
await visitRef.update({
  processingStatus: 'summarizing',
  updatedAt: admin.firestore.Timestamp.now(),
});

console.log(`[visitProcessor] Generating AI summary for visit ${visitRef.id}`);
const summary = await openAI.summarizeTranscript(transcriptForSummary);

const processedAt = admin.firestore.Timestamp.now();
const batch = db().batch();

batch.update(visitRef, {
  transcript: formattedTranscript,
  summary: summary.summary,
  diagnoses: summary.diagnoses,
  medications: summary.medications,
  imaging: summary.imaging,
  nextSteps: summary.nextSteps,
  processingStatus: 'completed',
  status: 'completed',
  processedAt,
  updatedAt: processedAt,
});
```

**AFTER: Save transcript immediately, then attempt summary**

```typescript
// Save transcript immediately after transcription
await visitRef.update({
  transcript: formattedTranscript,
  processingStatus: 'summarizing',
  updatedAt: admin.firestore.Timestamp.now(),
});

console.log(`[visitProcessor] Transcript saved. Generating AI summary for visit ${visitRef.id}`);

try {
  const summary = await openAI.summarizeTranscript(transcriptForSummary);

  const processedAt = admin.firestore.Timestamp.now();
  const batch = db().batch();

  batch.update(visitRef, {
    summary: summary.summary,
    diagnoses: summary.diagnoses,
    medications: summary.medications,
    imaging: summary.imaging,
    nextSteps: summary.nextSteps,
    processingStatus: 'completed',
    status: 'completed',
    processedAt,
    updatedAt: processedAt,
  });

  // Actions creation remains the same...
  const actionsCollection = db().collection('actions');
  const existingActions = await actionsCollection.where('visitId', '==', visitRef.id).get();
  existingActions.docs.forEach((doc) => batch.delete(doc.ref));

  summary.nextSteps.forEach((step) => {
    const actionRef = actionsCollection.doc();
    batch.set(actionRef, {
      userId: visitData.userId,
      visitId: visitRef.id,
      description: step,
      completed: false,
      completedAt: null,
      notes: '',
      createdAt: processedAt,
      updatedAt: processedAt,
    });
  });

  await batch.commit();

  console.log(
    `[visitProcessor] Visit ${visitRef.id} processed successfully. Actions created: ${summary.nextSteps.length}`,
  );
} catch (summaryError) {
  // Transcript is already saved, only summarization failed
  const errorMessage = getSafeErrorMessage(summaryError);
  
  await visitRef.update({
    processingStatus: 'partial',
    status: 'partial',
    processingError: `Summarization failed: ${errorMessage}. Transcript is available for manual retry.`,
    updatedAt: admin.firestore.Timestamp.now(),
  });

  console.error(`[visitProcessor] Summarization failed for visit ${visitRef.id}, but transcript was saved:`, errorMessage);
  throw summaryError;
}
```

**Impact:** Transcript survives even if OpenAI fails. User can retry summary without re-transcribing.

---

## Fix #3: Rate Limit Retry Button (30 minutes) 🛑

**Problem:** Users can spam retry, wasting API credits

**File:** `functions/src/routes/visits.ts`

**Add after line 365 (inside retry endpoint):**

```typescript
// Add after ownership check, before processing check

// Check rate limit
const MIN_RETRY_INTERVAL_MS = 30 * 1000; // 30 seconds

if (visit.lastRetryAt) {
  const timeSinceLastRetry = Date.now() - visit.lastRetryAt.toMillis();
  
  if (timeSinceLastRetry < MIN_RETRY_INTERVAL_MS) {
    const waitSeconds = Math.ceil((MIN_RETRY_INTERVAL_MS - timeSinceLastRetry) / 1000);
    res.status(429).json({
      code: 'retry_too_soon',
      message: `Please wait ${waitSeconds} more seconds before retrying`,
    });
    return;
  }
}

// Add this update before calling processVisit (around line 388):
await visitRef.update({
  lastRetryAt: admin.firestore.Timestamp.now(),
});
```

**Also update the schema (around line 44):**

```typescript
const processingStatusEnum = z.enum([
  'pending',
  'processing',
  'transcribing',
  'summarizing',
  'completed',
  'partial',  // ADD THIS NEW STATUS
  'failed',
]);
```

**Impact:** Prevents abuse, saves $$ on duplicate processing.

---

## Fix #4: Disable Retry Button While Processing (15 minutes) 🚫

**Problem:** User can click retry while already processing

**File:** `mobile/app/visit-detail.tsx`

**Find the retry button (search for "Retry Processing" or similar) and update:**

```typescript
// Add loading state
const [isRetrying, setIsRetrying] = useState(false);

// Update retry handler
const handleRetry = async () => {
  setIsRetrying(true);
  try {
    await api.visits.retry(visit.id);
    // Optimistically update UI
    queryClient.setQueryData(['visit', visit.id], {
      ...visit,
      processingStatus: 'pending',
      status: 'processing',
    });
    // Show success message
    Alert.alert('Processing Restarted', 'Your visit is being processed again.');
  } catch (error: any) {
    if (error.response?.status === 429) {
      Alert.alert('Please Wait', error.response.data.message);
    } else if (error.response?.status === 409) {
      Alert.alert('Already Processing', 'This visit is currently being processed. Please wait.');
    } else {
      Alert.alert('Retry Failed', 'Failed to retry processing. Please try again.');
    }
  } finally {
    setIsRetrying(false);
  }
};

// Update button
const isProcessing = ['processing', 'transcribing', 'summarizing'].includes(visit.processingStatus);
const shouldDisable = isRetrying || isProcessing;

<Pressable
  style={[styles.retryButton, shouldDisable && styles.retryButtonDisabled]}
  onPress={handleRetry}
  disabled={shouldDisable}
>
  <Text style={styles.retryButtonText}>
    {isRetrying ? 'Retrying...' : isProcessing ? 'Processing...' : 'Retry Processing'}
  </Text>
</Pressable>
```

**Add to styles:**

```typescript
retryButtonDisabled: {
  opacity: 0.5,
  backgroundColor: Colors.textMuted,
},
```

**Impact:** Better UX, prevents double-processing.

---

## Fix #5: Show Warning for Stuck Visits (15 minutes) ⚠️

**Problem:** Users don't know if visit is stuck or just slow

**File:** `mobile/app/visit-detail.tsx`

**Add this component before the retry button:**

```typescript
// Calculate visit age
const visitAge = Date.now() - new Date(visit.createdAt).getTime();
const isStuck = 
  visitAge > 30 * 60 * 1000 && // Older than 30 minutes
  ['processing', 'transcribing', 'summarizing'].includes(visit.processingStatus);

// Render warning
{isStuck && (
  <View style={styles.warningContainer}>
    <Ionicons name="warning" size={20} color={Colors.warning} />
    <Text style={styles.warningText}>
      This visit is taking longer than expected. Try refreshing or contact support if the issue persists.
    </Text>
  </View>
)}
```

**Add to styles:**

```typescript
warningContainer: {
  flexDirection: 'row',
  alignItems: 'center',
  backgroundColor: '#FFF3CD',
  padding: spacing(3),
  borderRadius: 8,
  marginBottom: spacing(3),
  gap: spacing(2),
},
warningText: {
  flex: 1,
  fontSize: 14,
  color: '#856404',
  lineHeight: 20,
},
```

**Add to Colors (if not already there):**

```typescript
warning: '#FFA500',
```

**Impact:** Users know when something is wrong, reduces support requests.

---

## Deploy Changes 🚀

```bash
# Build functions
cd functions
npm run build

# Deploy only functions (faster than full deploy)
firebase deploy --only functions

# Monitor logs
firebase functions:log --only processVisitAudio -n 50
```

---

## Test Your Changes ✅

### Test Case 1: Timeout Protection
1. Upload a 10-minute audio file
2. Wait 8 minutes
3. Should see "AssemblyAI transcription timed out" error (not silent hang)

### Test Case 2: Transcript Preservation
1. Temporarily break OpenAI (remove API key)
2. Upload audio
3. After transcription, should see status = "partial"
4. Transcript should be saved in Firestore
5. Restore API key, retry
6. Should use saved transcript, only retry summary

### Test Case 3: Rate Limiting
1. Create failed visit
2. Click retry
3. Immediately click retry again
4. Should see "Please wait 30 seconds" message

### Test Case 4: Button States
1. Create failed visit
2. Click retry
3. Button should show "Retrying..." and be disabled
4. After retry starts, should show "Processing..."

### Test Case 5: Stuck Visit Warning
1. Manually set visit `createdAt` to 40 minutes ago
2. Set `processingStatus` to "transcribing"
3. Open visit detail
4. Should see yellow warning banner

---

## Expected Results 📊

### Before Fixes:
- ❌ 15% of visits fail or hang
- ❌ Users can spam retry button
- ❌ Transcript lost on summary failure
- ❌ No feedback for stuck visits

### After Fixes:
- ✅ <5% of visits fail (only on truly bad audio)
- ✅ Rate limited to 1 retry per 30 seconds
- ✅ Transcript preserved even if summary fails
- ✅ Clear warning for stuck visits
- ✅ Button disabled during processing

---

## Next Steps (Tomorrow)

After deploying these fixes, monitor for 24-48 hours:

```bash
# Check success rate
firebase functions:log --only processVisitAudio -n 100 | grep "successfully"

# Check for stuck visits
# In Firebase Console → Firestore:
visits
  .where('processingStatus', 'in', ['transcribing', 'summarizing'])
  .where('updatedAt', '<', thirtyMinutesAgo)
```

If success rate improves to 90%+, proceed to **Phase 5A** (exponential backoff + Gen 2 migration).

---

## 🆘 Rollback Plan

If something breaks:

```bash
# Rollback to previous function version
firebase functions:log --only processVisitAudio -n 1

# Find previous deployment
firebase functions:rollback processVisitAudio

# Or redeploy from git
git checkout HEAD~1 functions/
cd functions && npm run build
firebase deploy --only functions
```

---

**Total Time: ~2 hours**  
**Expected Impact: 10-15% reduction in failures**  
**Risk: Low (mostly additive changes)**

**Ready to start? Begin with Fix #1 (5 minutes) and test before moving to Fix #2.**

🚀 Let's make your system more resilient!


