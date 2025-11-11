# LumiMD Resilience & Development Roadmap

**Last Updated:** November 9, 2025  
**Focus:** Production-ready error handling, retry logic, and continued development pathway

---

## 📊 Current System Analysis

### ✅ What's Working Well

Your core pipeline is **functional and well-architected**:

1. **Recording → Transcription → Summarization Flow**
   - Mobile recording with pause/resume ✅
   - Firebase Storage uploads with progress tracking ✅
   - Storage trigger automatically initiates processing ✅
   - AssemblyAI diarized transcription (12-min timeout) ✅
   - OpenAI structured summarization (JSON output) ✅
   - Automatic action item creation ✅
   
2. **Status Tracking**
   - Granular states: `pending` → `transcribing` → `summarizing` → `completed`/`failed` ✅
   - Retry count tracking ✅
   - Error message storage ✅
   
3. **Manual Retry Capability**
   - `/v1/visits/:id/retry` endpoint ✅
   - Protection against double-processing (409 if already processing) ✅
   - Native UI for retry ✅

4. **Security**
   - Ownership verification on all endpoints ✅
   - Secure storage rules ✅
   - Auth middleware ✅

---

## 🚨 Critical Gaps: Where Things Can Hang

### Priority 1: Timeout Mismatch 🔴 **CRITICAL**

**Issue:** Your Cloud Function timeout (9 minutes) is **shorter** than AssemblyAI polling timeout (12 minutes).

```typescript
// functions/src/triggers/processVisitAudio.ts
export const processVisitAudio = functions
  .runWith({
    timeoutSeconds: 540,  // 9 minutes ⚠️
    memory: '1GB',
    failurePolicy: true,
  })

// functions/src/services/assemblyai.ts
const MAX_POLL_DURATION_MS = 12 * 60 * 1000; // 12 minutes ⚠️
```

**What happens:**
- Long recordings (>5 minutes) take 6-8 minutes to transcribe
- Function times out mid-polling
- Visit stays in "transcribing" state forever
- User sees "Processing..." indefinitely

**Solutions:**

**Option A: Increase Function Timeout** (Quick fix)
```typescript
timeoutSeconds: 540, // → Change to 900 (15 minutes, max is 540 for gen1, 3600 for gen2)
```
⚠️ **Problem:** Gen 1 functions max at 9 minutes. You need to migrate to Gen 2.

**Option B: Async Processing Pattern** (Recommended)
- Submit transcription to AssemblyAI
- Save transcription ID to Firestore
- Exit function immediately
- Use AssemblyAI webhook or scheduled checker to poll completion
- Trigger summarization in separate function

---

### Priority 2: No Exponential Backoff on External APIs 🟡 **HIGH**

**Issue:** AssemblyAI and OpenAI calls have no retry logic for transient failures.

```typescript
// Current: Single attempt, fails completely if network hiccups
const transcriptId = await assemblyAI.submitTranscription(signedUrl);
const summary = await openAI.summarizeTranscript(transcript);
```

**What happens:**
- Temporary network issues cause permanent failures
- Rate limiting from APIs causes failures
- User has to manually retry entire workflow

**Solution:** Implement retry with exponential backoff

```typescript
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelayMs: number = 1000
): Promise<T> {
  let lastError: Error;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      // Don't retry on 4xx errors (except 429 rate limit)
      if (error.response?.status >= 400 && error.response?.status < 500 && error.response?.status !== 429) {
        throw error;
      }
      
      if (i < maxRetries - 1) {
        const delay = baseDelayMs * Math.pow(2, i) + Math.random() * 1000;
        console.log(`[Retry] Attempt ${i + 1} failed, retrying in ${delay}ms...`);
        await sleep(delay);
      }
    }
  }
  
  throw lastError!;
}

// Usage:
const transcriptId = await retryWithBackoff(() => 
  assemblyAI.submitTranscription(signedUrl)
);
```

---

### Priority 3: Partial Failure = Complete Data Loss 🟡 **HIGH**

**Issue:** If transcription succeeds but summarization fails, the transcript is never saved.

```typescript
// Current flow (visitProcessor.ts):
// 1. Transcribe ✅
// 2. Summarize ❌ (fails here)
// 3. Batch update with BOTH transcript + summary ❌ (never happens)
// Result: Transcript is lost
```

**What happens:**
- OpenAI outage after AssemblyAI succeeds
- User loses 5-minute transcription work
- Retry has to re-transcribe (costs money + time)

**Solution:** Checkpoint incremental progress

```typescript
// Save transcript immediately after transcription
await visitRef.update({
  transcript: formattedTranscript,
  processingStatus: 'summarizing',
  updatedAt: admin.firestore.Timestamp.now(),
});

// Then attempt summarization
try {
  const summary = await openAI.summarizeTranscript(transcript);
  await visitRef.update({
    summary: summary.summary,
    diagnoses: summary.diagnoses,
    // ... rest of summary data
    processingStatus: 'completed',
    status: 'completed',
  });
} catch (error) {
  // Transcript is already saved, only summarization failed
  await visitRef.update({
    processingStatus: 'failed',
    status: 'partial', // New status for "has transcript but no summary"
    processingError: 'Summarization failed. Transcript saved.',
  });
  throw error;
}
```

---

### Priority 4: No Rate Limiting on Retry Endpoint 🟠 **MEDIUM**

**Issue:** User can spam retry button, causing:
- Duplicate processing attempts
- Wasted API credits
- Race conditions

**Solution:** Add rate limiting

```typescript
// Store last retry timestamp
await visitRef.update({
  lastRetryAt: admin.firestore.Timestamp.now(),
});

// In retry endpoint, check:
if (visit.lastRetryAt) {
  const timeSinceLastRetry = Date.now() - visit.lastRetryAt.toMillis();
  const MIN_RETRY_INTERVAL = 30 * 1000; // 30 seconds
  
  if (timeSinceLastRetry < MIN_RETRY_INTERVAL) {
    res.status(429).json({
      code: 'retry_too_soon',
      message: `Please wait ${Math.ceil((MIN_RETRY_INTERVAL - timeSinceLastRetry) / 1000)} seconds before retrying`,
    });
    return;
  }
}
```

---

### Priority 5: No Monitoring/Observability 🟠 **MEDIUM**

**Issue:** When things fail, you have limited visibility:
- No structured logs
- No error aggregation
- No alerts for stuck visits

**Solution:** Add structured logging + monitoring

```typescript
// Add structured logging
import * as functions from 'firebase-functions';

functions.logger.log('Visit processing started', {
  visitId: visitRef.id,
  userId: visitData.userId,
  fileSize: object.size,
  retryCount: visitData.retryCount || 0,
});

// Track metrics
functions.logger.log('AssemblyAI transcription completed', {
  visitId: visitRef.id,
  duration: Date.now() - startTime,
  transcriptLength: transcriptData.text.length,
});

// Create monitoring dashboard query:
// "Failed visits in last 24h with retryCount > 3"
```

**Recommended Tools:**
- Firebase Extensions: **Error Reporting to Slack**
- Cloud Monitoring: Set up alerts for `processingStatus=failed` stuck >1 hour
- Datadog/Sentry for advanced monitoring

---

### Priority 6: No Circuit Breaker Pattern 🟢 **LOW**

**Issue:** If OpenAI is down, every visit will fail without graceful degradation.

**Solution:** Circuit breaker to pause processing during outages

```typescript
class CircuitBreaker {
  private failures = 0;
  private lastFailure: number | null = null;
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      const timeSinceLastFailure = Date.now() - (this.lastFailure || 0);
      if (timeSinceLastFailure < 60000) { // 1 minute cooldown
        throw new Error('Circuit breaker open - service unavailable');
      }
      this.state = 'half-open';
    }
    
    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }
  
  private onSuccess() {
    this.failures = 0;
    this.state = 'closed';
  }
  
  private onFailure() {
    this.failures++;
    this.lastFailure = Date.now();
    if (this.failures >= 5) {
      this.state = 'open';
      console.error('[CircuitBreaker] Opening circuit after 5 failures');
    }
  }
}
```

---

## 🎯 Recommended Development Phases

### **Phase 5A: Critical Resilience Fixes** (3-4 hours) 🔴

**Goal:** Make the current system production-reliable

**Tasks:**
1. ✅ **Migrate to Firebase Gen 2 Functions** (30 min)
   - Increase timeout to 15 minutes
   - Better memory management
   
2. ✅ **Add exponential backoff to API calls** (1 hour)
   - Implement `retryWithBackoff` helper
   - Apply to AssemblyAI + OpenAI calls
   
3. ✅ **Add incremental checkpointing** (1 hour)
   - Save transcript immediately after transcription
   - Add "partial" status for partial completions
   
4. ✅ **Add rate limiting to retry endpoint** (30 min)
   - 30-second minimum between retries
   - Track `lastRetryAt` timestamp
   
5. ✅ **Add structured logging** (1 hour)
   - Replace console.log with functions.logger
   - Add performance metrics
   - Log success/failure rates

**Success Metrics:**
- 95%+ success rate on first attempt
- Zero stuck visits after 15 minutes
- Clear error messages for all failures

---

### **Phase 5B: Native UX Polish** (4-6 hours) 🟡

**Current Focus from PROJECT-STATUS.md**

**Tasks:**
1. ✅ Add read-only Action Items screen (`mobile/app/actions.tsx`)
   - Display action items with visit context
   - "Manage on Web" CTA button
   
2. ✅ Enhance visits list with status filtering
   - Group by: "Needs Attention" (failed) / "Processing" / "Ready"
   - Hide archived visits
   
3. ✅ Add retry confirmation toast
   - Optimistic UI update
   - Show "Retrying..." state
   - Handle 409 (already processing) gracefully
   
4. ✅ Add medication deep-links to web
   - Tap medication → open web portal

**Success Metrics:**
- Users can see all action items without web
- Failed visits have clear recovery path
- No confusion about visit status

---

### **Phase 6: Async Processing Architecture** (6-8 hours) 🟢

**Goal:** Handle long recordings (>10 minutes) without timeouts

**Architecture:**

```
┌─────────────────┐
│ Upload Complete │
│  (Mobile App)   │
└────────┬────────┘
         │
         ▼
┌─────────────────────────┐
│ Storage Trigger         │
│ - Create visit record   │
│ - Submit to AssemblyAI  │
│ - Save transcriptId     │
│ - Exit (30s total)      │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│ Cloud Scheduler (1/min) │
│ - Check pending visits  │
│ - Poll AssemblyAI       │
│ - Trigger summarization │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│ Summarization Function  │
│ - Get transcript        │
│ - Call OpenAI           │
│ - Update Firestore      │
└─────────────────────────┘
```

**Implementation:**

```typescript
// 1. Modify processVisitAudio trigger
export const processVisitAudio = functions
  .runWith({ timeoutSeconds: 60, memory: '512MB' })
  .storage.object()
  .onFinalize(async (object) => {
    // Just submit transcription and exit
    const signedUrl = await getSignedUrl(object);
    const transcriptId = await assemblyAI.submitTranscription(signedUrl);
    
    await visitRef.update({
      transcriptId,
      processingStatus: 'transcribing',
      submittedAt: admin.firestore.Timestamp.now(),
    });
    
    console.log(`[processVisitAudio] Submitted transcription ${transcriptId}`);
  });

// 2. Create scheduled checker
export const checkPendingTranscriptions = functions
  .runWith({ timeoutSeconds: 300, memory: '512MB' })
  .pubsub.schedule('every 1 minutes')
  .onRun(async () => {
    const pendingVisits = await db()
      .collection('visits')
      .where('processingStatus', '==', 'transcribing')
      .where('submittedAt', '>', thirtyMinutesAgo)
      .limit(10)
      .get();
    
    for (const doc of pendingVisits.docs) {
      const visit = doc.data();
      const transcript = await assemblyAI.checkStatus(visit.transcriptId);
      
      if (transcript.status === 'completed') {
        // Trigger summarization
        await triggerSummarization(doc.ref, transcript);
      } else if (transcript.status === 'error') {
        await doc.ref.update({
          processingStatus: 'failed',
          status: 'failed',
          processingError: transcript.error,
        });
      }
    }
  });
```

**Benefits:**
- No timeout issues (each function <5 minutes)
- Handles recordings of any length
- Better error isolation
- Can retry individual stages

---

### **Phase 7: Web Portal** (12-16 hours)

**From PROJECT-STATUS.md - already planned**

1. Build dashboard with real data
2. Visit history with filters
3. Action items CRUD
4. Medications manager
5. Visit detail viewer with transcript

---

### **Phase 8: Advanced Monitoring** (4-6 hours)

**Goal:** Proactive issue detection

**Tasks:**
1. ✅ **Cloud Monitoring Dashboards**
   - Visit success rate (rolling 24h)
   - Average processing time
   - Retry rate
   - Failed visit backlog
   
2. ✅ **Alerting Rules**
   - Alert if >5 failed visits in 1 hour
   - Alert if average processing time >10 minutes
   - Alert if retry count >3 on any visit
   
3. ✅ **Error Aggregation**
   - Group errors by type (transcription vs summarization)
   - Track error frequency by time of day
   - Identify problem users/recordings
   
4. ✅ **User Notifications**
   - Push notification when processing completes
   - Email if processing fails after 3 retries
   - SMS for critical account issues

---

### **Phase 9: Cost Optimization** (2-4 hours)

**Current Costs (estimated per visit):**
- AssemblyAI: ~$0.05 per minute of audio
- OpenAI: ~$0.01-0.03 per summary (GPT-4o-mini)
- Firebase Functions: ~$0.001 per invocation
- Storage: ~$0.001 per GB/month

**Optimization Opportunities:**

1. **Cache AssemblyAI Transcripts**
   - Store transcriptId in Firestore
   - On retry, check if transcript already exists
   - Save: 100% of transcription costs on retry
   
2. **Batch OpenAI Calls**
   - If summarizing multiple visits, batch requests
   - Save: 20-30% on OpenAI costs
   
3. **Compress Audio Before Upload**
   - Use lower quality (still clear speech)
   - Save: 50% on storage + upload time
   
4. **Smart Retry Logic**
   - If transcription failed at 10s mark, don't retry transcription
   - Only retry the failed stage
   - Save: Wasted API calls

---

### **Phase 10: Advanced Features** (Future)

1. **Real-time Transcription**
   - Stream audio to AssemblyAI during recording
   - Show live transcript in mobile app
   - User can see transcript forming as they speak
   
2. **Offline Mode**
   - Queue recordings locally
   - Upload when network returns
   - Show "Queued for upload" status
   
3. **Smart Visit Tagging**
   - AI-powered visit categorization (checkup, follow-up, specialist)
   - Auto-link related visits
   - Suggest next steps based on patterns
   
4. **Multi-Language Support**
   - Detect language automatically
   - Support Spanish, Chinese, etc.
   - Translate summaries to user's preferred language

---

## 🛠️ Quick Wins (Can Implement Today)

### 1. Add Timeout Safety Check (5 minutes)

```typescript
// functions/src/services/assemblyai.ts
async pollUntilComplete(transcriptId: string): Promise<AssemblyAITranscript> {
  const startedAt = Date.now();
  const MAX_POLL_DURATION_MS = 8 * 60 * 1000; // 8 minutes (safer than 12)
  
  // ... rest of polling logic
}
```

### 2. Add Retry Button Disable Logic (10 minutes)

```typescript
// mobile/app/visit-detail.tsx
const [isRetrying, setIsRetrying] = useState(false);

const handleRetry = async () => {
  setIsRetrying(true);
  try {
    await api.visits.retry(visitId);
    showToast('Processing restarted');
  } catch (error) {
    if (error.code === 'retry_too_soon') {
      showToast(error.message);
    }
  } finally {
    setIsRetrying(false);
  }
};

<Button disabled={isRetrying || visit.processingStatus === 'processing'}>
  {isRetrying ? 'Retrying...' : 'Retry Processing'}
</Button>
```

### 3. Add Visit Age Warning (10 minutes)

```typescript
// Warn user if visit is stuck >30 minutes
const visitAge = Date.now() - new Date(visit.createdAt).getTime();
const isStuck = visitAge > 30 * 60 * 1000 && visit.processingStatus !== 'completed';

{isStuck && (
  <Text style={styles.warningText}>
    This visit is taking longer than expected. Try refreshing or contact support.
  </Text>
)}
```

---

## 📊 Success Metrics

### Current State (Estimated)
- ✅ ~80% first-attempt success rate
- ⚠️ ~15% hung visits (timeout issues)
- ⚠️ ~5% failed visits (API errors)
- ⚠️ Average retry count: 1.5x

### Target State (After Phase 5A)
- 🎯 95%+ first-attempt success rate
- 🎯 <1% hung visits
- 🎯 <3% failed visits (only on truly bad recordings)
- 🎯 Average retry count: <1.1x

### Monitoring Queries

```javascript
// Firestore console - find stuck visits
db.collection('visits')
  .where('processingStatus', 'in', ['transcribing', 'summarizing'])
  .where('updatedAt', '<', thirtyMinutesAgo)
  .get();

// Find high-retry visits
db.collection('visits')
  .where('retryCount', '>=', 3)
  .where('status', '==', 'failed')
  .get();

// Success rate (last 24h)
const total = await db.collection('visits')
  .where('createdAt', '>', yesterday)
  .count()
  .get();

const successful = await db.collection('visits')
  .where('createdAt', '>', yesterday)
  .where('status', '==', 'completed')
  .count()
  .get();

const successRate = successful / total * 100;
```

---

## 🚦 Prioritized Action Plan

### **This Week** (Phase 5A - Critical Resilience)
1. Migrate to Gen 2 Functions
2. Add retry logic with exponential backoff
3. Implement incremental checkpointing
4. Add rate limiting to retry endpoint
5. Deploy + monitor for 48 hours

### **Next Week** (Phase 5B - UX Polish)
1. Build action items screen
2. Enhance visits list filtering
3. Add retry confirmation toasts
4. Test on physical device

### **Month 1** (Phase 6 - Async Architecture)
1. Split processing into stages
2. Implement scheduled checker
3. Handle arbitrarily long recordings
4. Stress test with 30-minute audio files

### **Month 2** (Phase 7 - Web Portal)
1. Build web dashboard
2. Visit detail viewer
3. Action items manager
4. Full CRUD operations

### **Month 3+** (Phase 8-10 - Advanced)
1. Monitoring + alerting
2. Cost optimization
3. Real-time transcription
4. Multi-language support

---

## 📝 Key Files to Modify

### Phase 5A (Resilience)
| File | Changes |
|------|---------|
| `functions/src/triggers/processVisitAudio.ts` | Migrate to Gen 2, increase timeout |
| `functions/src/services/visitProcessor.ts` | Add checkpointing, retry logic |
| `functions/src/services/assemblyai.ts` | Add exponential backoff |
| `functions/src/services/openai.ts` | Add exponential backoff |
| `functions/src/routes/visits.ts` | Add rate limiting to retry endpoint |

### Phase 5B (UX)
| File | Changes |
|------|---------|
| `mobile/app/actions.tsx` | **NEW** - Action items list |
| `mobile/app/visits.tsx` | Add filtering by status |
| `mobile/app/visit-detail.tsx` | Add retry toast, optimistic UI |
| `mobile/app/medications.tsx` | Add web deep-links |

---

## 🎓 Lessons Learned (Good Architecture Choices)

1. ✅ **Status field separation** (`status` vs `processingStatus`)
   - Allows granular tracking
   - Easy to filter on different states
   
2. ✅ **Retry count tracking**
   - Helps identify problematic visits
   - Can implement escalating retry strategies
   
3. ✅ **Storage of both audioUrl and storagePath**
   - Enables easy retry without re-upload
   - Good for audit trail
   
4. ✅ **Shared `visitProcessor` service**
   - Used by both trigger and retry endpoint
   - Single source of truth for processing logic

---

## 🤝 Questions to Consider

1. **Business Logic:**
   - Should failed visits auto-retry 3x before alerting user?
   - Should visits auto-expire after 7 days?
   - Should transcripts be editable by users?

2. **Costs:**
   - What's your monthly budget for API calls?
   - AssemblyAI: $0.05/min → 1000 visits @ 5 min = $250/mo
   - Should you cache transcripts aggressively?

3. **Scale:**
   - How many concurrent users do you expect?
   - Peak: 100 visits/hour → need horizontal scaling
   - Should you implement job queue (Cloud Tasks)?

4. **Compliance:**
   - HIPAA requirements for PHI storage?
   - Audio retention policy (delete after 30 days)?
   - User data export/deletion workflow?

---

## 📞 Next Steps

**Immediate Actions:**
1. Review this document
2. Decide on Phase 5A timeline (recommend this week)
3. Create Firebase project issues/tasks
4. Begin Gen 2 migration

**Let's discuss:**
- Which resilience fixes are most urgent for you?
- Timeline for async architecture (Phase 6)?
- Any specific failure scenarios you've observed?

---

**Ready to bulletproof your AI pipeline!** 🚀

Let me know which phase you'd like to tackle first, and I'll help you implement it.


