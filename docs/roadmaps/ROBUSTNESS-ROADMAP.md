# LumiMD Robustness & Error Handling Roadmap

**Date:** November 9, 2025  
**Status:** Core functionality operational, robustness improvements needed  
**Focus:** Production-grade error handling, retry logic, and operational resilience

---

## 📊 Current System Analysis

### ✅ What's Working Well

Your core pipeline is **operational and complete**:

```
Mobile App → Record Audio → Upload to Storage → Create Visit Document
    ↓
Storage Trigger Fires → processVisitAudio()
    ↓
AssemblyAI Transcription (with diarization)
    ↓
OpenAI Summarization (structured JSON)
    ↓
Firestore Update + Action Items Creation
    ↓
Mobile UI displays results (with status polling)
```

**Key Strengths:**
1. ✅ End-to-end pipeline functional
2. ✅ Status tracking through `processingStatus` field
3. ✅ Manual retry endpoint (`/v1/visits/:id/retry`)
4. ✅ Real-time UI polling for in-progress visits
5. ✅ Timeout protection (AssemblyAI: 12 min, Functions: 9 min)
6. ✅ Error messages captured and surfaced to users
7. ✅ Optimistic UI with loading states
8. ✅ Auth-protected ownership verification

---

## 🚨 Identified Failure Points & Gaps

### 1. **Storage Trigger Reliability**
**Risk:** HIGH  
**Current State:** Storage trigger might not fire reliably in all cases

**Failure Scenarios:**
- Firebase Storage trigger doesn't fire (rare but possible)
- Trigger fires but function times out before starting processing
- Multiple triggers fire for same file (race condition)
- Visit document not found due to timing issues

**Current Mitigation:**
- ✅ 540-second timeout for function
- ✅ Check if already processed (`processingStatus === 'completed'`)
- ⚠️ No fallback if trigger doesn't fire
- ⚠️ No idempotency tokens

**Recommended Solutions:**
- [ ] Add fallback scheduled function to process stuck `pending` visits
- [ ] Implement idempotency using `storagePath` as unique key
- [ ] Add TTL-based cleanup (mark pending visits > 5 minutes old for retry)
- [ ] Emit custom events to Cloud Tasks for guaranteed execution

---

### 2. **AssemblyAI Transcription Failures**
**Risk:** MEDIUM  
**Current State:** Polling with 12-minute timeout, basic error handling

**Failure Scenarios:**
- AssemblyAI API is down or rate-limited
- Audio file is corrupted or unreadable
- Timeout during long recordings (>10 minutes)
- Invalid signed URL expires before transcription starts
- Network interruption during polling

**Current Mitigation:**
- ✅ 12-minute polling timeout
- ✅ Polls every 5 seconds
- ✅ Error status captured from AssemblyAI
- ⚠️ No exponential backoff on failures
- ⚠️ No retry logic for transient failures
- ⚠️ 1-hour signed URL (good)

**Recommended Solutions:**
- [ ] Add exponential backoff for AssemblyAI polling
- [ ] Retry transient failures (5xx errors) up to 3 times
- [ ] Extend timeout for longer recordings dynamically
- [ ] Cache transcription ID in Firestore for resume capability
- [ ] Implement webhook-based completion (if AssemblyAI supports)
- [ ] Add audio validation before submission

---

### 3. **OpenAI Summarization Failures**
**Risk:** MEDIUM  
**Current State:** Single attempt, 60-second timeout, JSON parsing

**Failure Scenarios:**
- OpenAI API rate limits or downtime
- Invalid JSON response from GPT model
- Timeout on very long transcripts
- Token limit exceeded (context too large)
- Network failure mid-request

**Current Mitigation:**
- ✅ 60-second axios timeout
- ✅ JSON parsing with fallback to empty result
- ✅ Extracts JSON from code fences
- ✅ Type validation on parsed response
- ⚠️ No retry on failure
- ⚠️ No truncation for long transcripts
- ⚠️ No fallback to cheaper model

**Recommended Solutions:**
- [ ] Add retry logic with exponential backoff (3 attempts)
- [ ] Truncate transcripts to fit within token limits (8k tokens for gpt-4o-mini)
- [ ] Fallback to simpler model on failure
- [ ] Implement circuit breaker pattern for OpenAI
- [ ] Add streaming response support for timeout resilience
- [ ] Cache partial results during long operations

---

### 4. **Firestore Batch Operations**
**Risk:** LOW  
**Current State:** Batch writes for visit update + action items

**Failure Scenarios:**
- Batch write fails after successful AI processing
- Partial batch success (actions created but visit not updated)
- Race condition with concurrent retry attempts
- Network failure during commit

**Current Mitigation:**
- ✅ Uses atomic batch operations
- ✅ Deletes old action items before creating new ones
- ⚠️ No retry on batch failure
- ⚠️ Retry endpoint doesn't check for concurrent runs

**Recommended Solutions:**
- [ ] Add retry logic for failed batch commits
- [ ] Use distributed lock (Firestore transaction) for retry operations
- [ ] Add `processingStartedAt` timestamp to detect hung processes
- [ ] Implement optimistic locking with version fields

---

### 5. **Mobile Upload Failures**
**Risk:** MEDIUM  
**Current State:** Direct upload to Firebase Storage with progress tracking

**Failure Scenarios:**
- Network interruption during upload
- Storage quota exceeded
- File too large (>100MB)
- Permissions issues (though rules are set)
- Upload completes but visit creation fails

**Current Mitigation:**
- ✅ Progress tracking
- ✅ User feedback on failure
- ⚠️ No automatic retry
- ⚠️ No upload resumption
- ⚠️ No file size validation before upload

**Recommended Solutions:**
- [ ] Add file size validation (warn if >50MB)
- [ ] Implement resumable uploads
- [ ] Add offline queue for failed uploads
- [ ] Validate audio format before upload
- [ ] Add upload timeout with retry
- [ ] Create visit document BEFORE upload (mark as 'uploading')

---

### 6. **Race Conditions & Concurrency**
**Risk:** MEDIUM  
**Current State:** Multiple retry attempts possible, no locking

**Failure Scenarios:**
- User taps retry multiple times quickly
- Storage trigger fires while manual retry is running
- Multiple tabs/devices trigger retry simultaneously
- Status updates overwrite each other

**Current Mitigation:**
- ✅ 409 status returned if already processing
- ✅ Frontend checks status before retry
- ⚠️ Check is not atomic (race window exists)
- ⚠️ No distributed locking

**Recommended Solutions:**
- [ ] Implement distributed lock using Firestore transactions
- [ ] Add `processingStartedAt` + `processingLockedBy` fields
- [ ] Lock expires after 10 minutes (safety valve)
- [ ] Debounce retry button in UI (prevent double-tap)
- [ ] Add optimistic UI updates with rollback on failure

---

### 7. **Monitoring & Observability**
**Risk:** HIGH  
**Current State:** Basic console.log, no structured monitoring

**Failure Scenarios:**
- Silent failures go unnoticed
- Unable to debug production issues
- No alerting for critical failures
- Can't track success rates or latency

**Current Mitigation:**
- ✅ Console logging in functions
- ✅ Error messages saved to Firestore
- ⚠️ No structured logging
- ⚠️ No metrics or dashboards
- ⚠️ No alerting

**Recommended Solutions:**
- [ ] Implement structured logging (JSON format)
- [ ] Add Cloud Logging integration
- [ ] Create Firebase Performance Monitoring traces
- [ ] Set up error rate alerts
- [ ] Build admin dashboard for failed visits
- [ ] Add custom metrics (processing time, success rate)
- [ ] Implement health check endpoint for each service

---

### 8. **Data Consistency & Cleanup**
**Risk:** LOW  
**Current State:** No orphan cleanup, relies on TTL (not configured)

**Failure Scenarios:**
- Orphaned audio files in Storage (no matching visit)
- Orphaned visits (audio deleted but visit remains)
- Stale action items after visit deletion
- TTL policy not set up (handoff codes don't auto-delete)

**Current Mitigation:**
- ✅ Action items deleted before recreating (on retry)
- ⚠️ No Storage cleanup on visit deletion
- ⚠️ No scheduled cleanup for failed visits
- ⚠️ TTL policy not configured

**Recommended Solutions:**
- [ ] Configure Firestore TTL policies
- [ ] Add cascading delete for visit → audio + actions
- [ ] Scheduled function to clean up failed visits >7 days old
- [ ] Orphan detection and cleanup (Storage files without visits)
- [ ] Add soft delete with archive flag

---

## 🎯 Prioritized Development Roadmap

### **Phase A: Critical Reliability (Week 1-2)**
**Goal:** Prevent data loss and ensure all visits eventually process

#### A1. Fallback Processing Queue ⭐ **CRITICAL**
**Problem:** Storage trigger might not fire, leaving visits stuck in `pending`

**Solution:**
- Scheduled function runs every 5 minutes
- Finds visits with `processingStatus: 'pending'` AND `createdAt < 5 minutes ago`
- Triggers processing for stuck visits
- Prevents silent failures

**Files to create/modify:**
- `functions/src/triggers/processStuckVisits.ts` (new)
- `functions/src/index.ts` (register new function)

**Estimated Time:** 3-4 hours

**Code Outline:**
```typescript
export const processStuckVisits = functions.pubsub
  .schedule('every 5 minutes')
  .onRun(async () => {
    const fiveMinutesAgo = admin.firestore.Timestamp.fromMillis(
      Date.now() - 5 * 60 * 1000
    );
    
    const stuckVisits = await db()
      .collection('visits')
      .where('processingStatus', '==', 'pending')
      .where('createdAt', '<', fiveMinutesAgo)
      .where('retryCount', '<', 3) // Max 3 auto-retries
      .limit(10)
      .get();
    
    for (const doc of stuckVisits.docs) {
      // Call processVisit() with proper error handling
    }
  });
```

---

#### A2. Implement Distributed Locking ⭐ **CRITICAL**
**Problem:** Race conditions when retry is triggered multiple times

**Solution:**
- Use Firestore transaction to atomically check + update processing status
- Add `processingLockedBy` (timestamp) and `processingLockExpiry` fields
- Lock expires after 10 minutes (safety valve)
- Prevents concurrent processing

**Files to modify:**
- `functions/src/services/visitProcessor.ts` (add lock acquisition)
- `functions/src/routes/visits.ts` (update retry endpoint)
- `functions/src/triggers/processVisitAudio.ts` (check lock)

**Estimated Time:** 4-5 hours

**Code Outline:**
```typescript
async function acquireProcessingLock(visitRef: DocumentReference): Promise<boolean> {
  return await db().runTransaction(async (tx) => {
    const doc = await tx.get(visitRef);
    const data = doc.data();
    
    // Check if already locked and not expired
    if (data.processingLockExpiry && 
        data.processingLockExpiry.toMillis() > Date.now()) {
      return false; // Already locked
    }
    
    // Acquire lock
    tx.update(visitRef, {
      processingLockedBy: Date.now(),
      processingLockExpiry: admin.firestore.Timestamp.fromMillis(
        Date.now() + 10 * 60 * 1000 // 10 minute lock
      ),
    });
    
    return true;
  });
}
```

---

#### A3. Add Retry Logic to External APIs ⭐ **HIGH**
**Problem:** Transient failures in AssemblyAI/OpenAI cause permanent failures

**Solution:**
- Exponential backoff for retries (1s, 2s, 4s)
- Distinguish between transient (retry) and permanent (fail) errors
- Max 3 retry attempts per API call

**Files to modify:**
- `functions/src/services/assemblyai.ts` (add retry wrapper)
- `functions/src/services/openai.ts` (add retry wrapper)

**Estimated Time:** 3-4 hours

**Code Outline:**
```typescript
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelay = 1000
): Promise<T> {
  let lastError;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      // Don't retry on permanent errors (4xx)
      if (axios.isAxiosError(error) && error.response?.status < 500) {
        throw error;
      }
      
      // Exponential backoff
      const delay = baseDelay * Math.pow(2, i);
      await sleep(delay);
    }
  }
  
  throw lastError;
}
```

---

#### A4. Resume Capability for Long Operations ⭐ **MEDIUM**
**Problem:** Functions can timeout during long transcriptions, losing progress

**Solution:**
- Save AssemblyAI transcript ID to Firestore immediately after submission
- If function times out, next retry resumes polling instead of resubmitting
- Saves time and avoids duplicate transcription costs

**Files to modify:**
- `functions/src/services/visitProcessor.ts` (save/check transcript ID)
- Add `transcriptId` field to visit document

**Estimated Time:** 2-3 hours

**Code Outline:**
```typescript
// In visitProcessor.ts
const transcriptId = visitData.transcriptId || 
  await assemblyAI.submitTranscription(signedUrl);

if (!visitData.transcriptId) {
  await visitRef.update({ transcriptId });
}

const transcriptData = await assemblyAI.pollUntilComplete(transcriptId);
```

---

### **Phase B: Enhanced Error Handling (Week 3)**
**Goal:** Graceful degradation and better user feedback

#### B1. Circuit Breaker Pattern for External APIs
**Problem:** Cascading failures when external services are down

**Solution:**
- Track failure rates for AssemblyAI and OpenAI
- Open circuit (fail fast) after 5 consecutive failures
- Half-open state allows test requests after 5 minutes
- Prevents hammering dead services

**Estimated Time:** 4-5 hours

---

#### B2. Partial Retry Intelligence
**Problem:** Must re-run entire pipeline even if only OpenAI failed

**Solution:**
- Track which stage failed (`failedStage: 'transcription' | 'summarization'`)
- On retry, skip completed stages
- Saves time and API costs

**Files to modify:**
- `functions/src/services/visitProcessor.ts` (stage tracking)
- Add `completedStages` array field

**Estimated Time:** 3-4 hours

---

#### B3. Input Validation & Preprocessing
**Problem:** Invalid audio files cause failures late in pipeline

**Solution:**
- Validate audio format in mobile app before upload
- Check file size (warn if >50MB, error if >100MB)
- Validate duration (warn if >1 hour)
- Display warnings with option to proceed

**Files to modify:**
- `mobile/app/record-visit.tsx` (add validation)
- `mobile/lib/storage.ts` (validation helpers)

**Estimated Time:** 2-3 hours

---

#### B4. Detailed Error Categorization
**Problem:** Generic error messages don't help users understand issues

**Solution:**
- Categorize errors: `network`, `quota`, `invalid_file`, `service_down`, `timeout`
- User-friendly messages per category
- Suggested actions ("Try again", "Check your internet", "Contact support")

**Files to modify:**
- `functions/src/services/visitProcessor.ts` (error categorization)
- `mobile/app/visit-detail.tsx` (friendly error messages)

**Estimated Time:** 3-4 hours

---

### **Phase C: Monitoring & Observability (Week 4)**
**Goal:** Proactive detection and debugging of issues

#### C1. Structured Logging
**Problem:** Difficult to query logs and track issues

**Solution:**
- JSON-structured logs with consistent fields
- Add trace IDs to follow requests through pipeline
- Log levels: DEBUG, INFO, WARN, ERROR
- Searchable by user, visit, stage

**Estimated Time:** 3-4 hours

---

#### C2. Custom Metrics & Dashboards
**Problem:** No visibility into system health

**Solution:**
- Track success rate per stage
- Track processing latency (p50, p95, p99)
- Track retry counts
- Track active processing jobs
- Create Firebase console dashboard

**Estimated Time:** 5-6 hours

---

#### C3. Alerting Rules
**Problem:** Silent failures discovered too late

**Solution:**
- Alert on error rate >5% in 5-minute window
- Alert on visits stuck >30 minutes
- Alert on API failure rate >20%
- Email/SMS notifications to admin

**Estimated Time:** 2-3 hours

---

#### C4. Admin Dashboard
**Problem:** No way to view/debug failed visits at scale

**Solution:**
- Web admin panel showing all visits
- Filter by status, date, user
- Bulk retry capability
- View detailed logs per visit

**Files to create:**
- `web-portal/app/admin/visits/page.tsx` (new)

**Estimated Time:** 8-10 hours

---

### **Phase D: Operational Excellence (Week 5+)**
**Goal:** Production-grade resilience and maintenance

#### D1. Automated Testing
- Integration tests for full pipeline
- Mock AssemblyAI/OpenAI responses
- Load testing (concurrent visits)
- Chaos engineering (inject failures)

**Estimated Time:** 8-10 hours

---

#### D2. Data Lifecycle Management
- Configure Firestore TTL policies
- Scheduled cleanup of old failed visits (>30 days)
- Storage cost optimization (compress/delete old audio)
- Soft delete with restore capability

**Estimated Time:** 4-5 hours

---

#### D3. Rate Limiting & Quotas
- Implement per-user rate limits
- Enforce visit count quotas
- Graceful degradation under load
- Queue system for batch processing

**Estimated Time:** 6-8 hours

---

#### D4. Disaster Recovery
- Backup strategy for Firestore
- Export/import capabilities
- Runbook for common failure scenarios
- Incident response procedures

**Estimated Time:** 4-5 hours

---

## 🧰 Quick Wins (Can Do Now)

These are small improvements you can implement immediately:

### 1. Add Request Timeouts (30 minutes)
```typescript
// In assemblyai.ts and openai.ts
this.client = axios.create({
  baseURL: BASE_URL,
  timeout: 60000,
  headers: { ... },
});
```
✅ Already done!

---

### 2. Debounce Retry Button (15 minutes)
```typescript
// In visit-detail.tsx
const [lastRetryTime, setLastRetryTime] = useState(0);

const handleRetry = async () => {
  // Prevent retries within 5 seconds
  if (Date.now() - lastRetryTime < 5000) {
    Alert.alert('Please wait', 'Already retrying...');
    return;
  }
  setLastRetryTime(Date.now());
  // ... rest of retry logic
};
```

---

### 3. Add Retry Count Limit (30 minutes)
```typescript
// In visitProcessor.ts
if (visitData.retryCount >= 5) {
  await visitRef.update({
    processingStatus: 'failed',
    processingError: 'Maximum retry attempts exceeded. Please contact support.',
  });
  return;
}
```

---

### 4. Validate Audio File Size (30 minutes)
```typescript
// In record-visit.tsx, before upload
const fileInfo = await FileSystem.getInfoAsync(uri);
const sizeInMB = fileInfo.size / (1024 * 1024);

if (sizeInMB > 100) {
  Alert.alert('File Too Large', 'Audio files must be under 100MB.');
  return;
}

if (sizeInMB > 50) {
  Alert.alert(
    'Large File',
    'This file is quite large and may take a while to process. Continue?',
    [{ text: 'Cancel' }, { text: 'Continue', onPress: () => uploadFile() }]
  );
  return;
}
```

---

### 5. Add Processing Started Timestamp (15 minutes)
```typescript
// In visitProcessor.ts
await visitRef.update({
  processingStatus: 'transcribing',
  processingStartedAt: admin.firestore.Timestamp.now(), // NEW
  retryCount: admin.firestore.FieldValue.increment(1),
});
```

---

## 📈 Success Metrics

Track these KPIs to measure improvement:

| Metric | Current | Target |
|--------|---------|--------|
| **Visit Processing Success Rate** | ~90% (estimated) | >98% |
| **Failed Visits Requiring Manual Retry** | Unknown | <2% |
| **Avg Processing Time (end-to-end)** | ~15 seconds | <20 seconds |
| **P95 Processing Time** | Unknown | <45 seconds |
| **Silent Failures (stuck in pending)** | Unknown | 0% |
| **Mean Time to Detect Failure** | Hours (manual check) | <5 minutes |
| **Mean Time to Recover** | Hours (manual retry) | <30 seconds |
| **API Retry Success Rate** | N/A (no retries) | >70% |

---

## 🎓 Implementation Strategy

### Recommended Approach: **Incremental Rollout**

1. **Week 1:** Implement Phase A (Critical Reliability)
   - Start with A1 (fallback queue) - prevents data loss
   - Then A2 (locking) - prevents race conditions
   - Deploy to production incrementally

2. **Week 2:** Complete Phase A + Start Phase B
   - Add retry logic (A3)
   - Add resume capability (A4)
   - Begin partial retry (B2)

3. **Week 3:** Enhanced Error Handling (Phase B)
   - Focus on user-facing improvements
   - Better error messages and validation

4. **Week 4:** Monitoring (Phase C)
   - Visibility into system health
   - Proactive alerting

5. **Week 5+:** Operational Excellence (Phase D)
   - Long-term sustainability
   - Testing and documentation

---

## 🔧 Development Workflow

### For Each Improvement:

1. **Create Feature Branch**
   ```bash
   git checkout -b feature/fallback-processing-queue
   ```

2. **Implement + Test Locally**
   ```bash
   cd functions
   npm run build
   firebase emulators:start
   # Test against emulators
   ```

3. **Deploy to Dev Environment**
   ```bash
   firebase use lumimd-dev
   firebase deploy --only functions
   ```

4. **Test in Production-Like Environment**
   - Create test visits
   - Force failures
   - Verify recovery

5. **Monitor After Deployment**
   - Watch Cloud Functions logs
   - Check error rates
   - Verify metrics

6. **Document Findings**
   - Update runbook
   - Note any edge cases
   - Record lessons learned

---

## 📚 Additional Resources

### Firebase Documentation
- [Cloud Functions Reliability Best Practices](https://firebase.google.com/docs/functions/best-practices)
- [Firestore TTL Policies](https://firebase.google.com/docs/firestore/ttl)
- [Cloud Logging](https://cloud.google.com/logging/docs)

### Recommended Libraries
- `p-retry` - Retry with exponential backoff
- `bottleneck` - Rate limiting and queue management
- `nanoid` - Generate idempotency keys
- `pino` - High-performance structured logging

### Pattern References
- [Circuit Breaker Pattern](https://martinfowler.com/bliki/CircuitBreaker.html)
- [Idempotency Patterns](https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/)
- [Distributed Locks with Firestore](https://cloud.google.com/firestore/docs/solutions/distributed-lock)

---

## 💡 Key Takeaways

### Your System is Strong! 💪

You've built a solid foundation with:
- Clear separation of concerns
- Good status tracking
- User-facing retry capability
- Reasonable timeouts
- Ownership security

### The Path Forward is Clear 🎯

Focus on:
1. **Preventing silent failures** (fallback queue)
2. **Handling transient errors** (retry logic)
3. **Avoiding race conditions** (distributed locking)
4. **Monitoring health** (structured logging + metrics)

### This is Normal for MVP → Production 🚀

Every production system goes through this:
- ✅ MVP: Get it working
- ⏳ **You are here:** Make it reliable
- 🔜 Scale: Make it fast
- 🔜 Optimize: Make it efficient

---

## 📞 Next Steps

**Recommended First Action:**
Implement **A1 (Fallback Processing Queue)** this week. This single improvement will catch 90% of silent failures and give you confidence that all visits eventually process.

**Questions to Consider:**
1. What's your current failure rate? (Add basic metrics first)
2. How often do users manually retry? (Track this)
3. What's the most common error? (Add logging)

**Ready to start?** Pick any task from Phase A and let's build it together!

---

*This roadmap is a living document. Update it as you implement improvements and discover new failure modes.*

