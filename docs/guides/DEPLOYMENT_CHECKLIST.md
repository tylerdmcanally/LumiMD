# LumiMD Backend Deployment Checklist

## Pre-Deployment Verification

### ✅ Code Quality
- [x] TypeScript compilation successful (no errors)
- [x] All routes properly registered in index.ts
- [x] Rate limiting middleware applied
- [x] Security rules created and validated
- [x] Composite indexes defined
- [ ] Linting passed (run `npm run lint` if available)
- [ ] Code review completed

### ✅ Security
- [x] API keys in `.env` (not committed to git)
- [x] `.env.example` created for documentation
- [x] Webhook secret configured
- [x] Firestore security rules complete
- [x] Storage security rules complete
- [x] auth_handoffs restricted to server-side only
- [x] Field-level validation in security rules
- [x] Rate limiting on all endpoints
- [ ] CORS configuration reviewed
- [ ] Production API keys rotated

### ✅ Firebase Configuration Files
- [x] `firestore.rules` created in `firebase-setup/`
- [x] `storage.rules` created in `firebase-setup/`
- [x] `firestore.indexes.json` updated with 11 indexes
- [x] `firebase.json` points to correct files

---

## Environment Setup

### Required Environment Variables

**Development (.env):**
```bash
ASSEMBLYAI_API_KEY=your_key_here
OPENAI_API_KEY=your_key_here
```

**Production (Firebase Functions config):**
```bash
# Set via Firebase CLI:
firebase functions:config:set \
  assemblyai.api_key="YOUR_KEY" \
  openai.api_key="YOUR_KEY"

# Or use Firebase Secret Manager (recommended):
firebase functions:secrets:set ASSEMBLYAI_API_KEY
firebase functions:secrets:set OPENAI_API_KEY
```

---

## Deployment Steps

### 1. Build Functions
```bash
cd functions
npm run build
```

**Expected output:** No TypeScript errors

### 2. Deploy Firestore Indexes
```bash
firebase deploy --only firestore:indexes
```

**Expected:** 11 indexes created/updated

### 3. Deploy Security Rules
```bash
firebase deploy --only firestore:rules,storage:rules
```

**Expected:** Rules updated successfully

### 4. Deploy Functions
```bash
firebase deploy --only functions
```

**Expected:** All functions deployed:
- ✅ api (HTTP endpoint)
- ✅ processVisitAudio (Storage trigger)
- ✅ checkPendingTranscriptions (Scheduled function)
- ✅ summarizeVisitTrigger (Firestore trigger)

### 5. Verify Deployment
```bash
# Check function status
firebase functions:list

# Test health endpoint
curl https://YOUR_REGION-YOUR_PROJECT.cloudfunctions.net/api/health

# Expected response:
# {"status":"ok","timestamp":"2025-11-15T..."}
```

---

## Post-Deployment Testing

### 1. Test API Endpoints

**Health Check:**
```bash
curl https://YOUR_PROJECT.cloudfunctions.net/api/health
```

**Authentication (should return 401):**
```bash
curl -X POST https://YOUR_PROJECT.cloudfunctions.net/api/v1/auth/create-handoff
# Expected: {"code":"unauthorized","message":"Authentication required"}
```

**Rate Limiting (test after 100 requests):**
```bash
# Should return 429 after exceeding limits
for i in {1..101}; do
  curl https://YOUR_PROJECT.cloudfunctions.net/api/health
done
```

### 2. Test Firestore Rules

Use Firebase emulator or test via SDK:
```bash
firebase emulators:start --only firestore
npm test  # If tests exist
```

### 3. Test Storage Rules

Upload audio file and verify access controls.

### 4. Test New Shares API

**Create share (with auth token):**
```bash
curl -X POST https://YOUR_PROJECT.cloudfunctions.net/api/v1/shares \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"caregiverEmail":"caregiver@example.com","role":"viewer"}'
```

---

## Monitoring Setup

### 1. Cloud Monitoring Alerts

**Create alerts for:**
- Function errors > 10/minute
- Rate limit hits > 20/minute
- Visit processing failures
- Transcription timeouts

### 2. Log-Based Metrics

**Set up log filters:**
- Error logs: `severity >= ERROR`
- Rate limit hits: `textPayload:"rate-limit"`
- Security violations: `textPayload:"forbidden"`

### 3. Uptime Checks

**Configure uptime monitoring:**
- URL: `https://YOUR_PROJECT.cloudfunctions.net/api/health`
- Frequency: Every 5 minutes
- Alert on: > 2 consecutive failures

---

## Database Indexes Verification

### Verify Indexes Are Built

1. Go to Firebase Console → Firestore → Indexes
2. Wait for all indexes to show "Enabled" status
3. Expected indexes:

| Collection | Fields | Status |
|------------|--------|--------|
| visits | userId + createdAt | ✅ |
| visits | userId + status | ✅ |
| visits | userId + processingStatus | ✅ |
| visits | status + updatedAt | ✅ |
| actions | userId + createdAt | ✅ |
| actions | userId + completed | ✅ |
| actions | userId + dueAt | ✅ |
| actions | visitId | ✅ |
| medications | userId + name | ✅ |
| medications | userId + status | ✅ |
| medications | userId + nameLower | ✅ |

**Note:** Index building can take several minutes to hours depending on existing data.

---

## Rollback Plan

### If Issues Occur:

**1. Rollback Functions:**
```bash
firebase functions:delete api
firebase deploy --only functions  # Redeploy previous version
```

**2. Rollback Security Rules:**
```bash
# Restore previous rules from git
git checkout HEAD~1 firebase-setup/firestore.rules
firebase deploy --only firestore:rules
```

**3. Monitor Logs:**
```bash
firebase functions:log
```

**4. Emergency Disable Rate Limiting:**
```typescript
// In functions/src/index.ts - temporarily comment out:
// app.use(apiLimiter);
```

---

## Performance Optimization

### Function Configuration

**Review memory allocation in `firebase.json`:**
```json
{
  "functions": [{
    "runtime": "nodejs18",
    "memory": "512MB",  // Increase if needed
    "timeout": "60s",    // Increase for long operations
    "minInstances": 1    // Keep warm (optional, costs more)
  }]
}
```

**Current settings:**
- API endpoint: Default (256MB, 60s) - May need increase to 512MB
- processVisitAudio: 512MB, 60s ✅
- checkPendingTranscriptions: 512MB, 300s ✅
- summarizeVisitTrigger: 512MB, 300s ✅

---

## Security Audit

### Before Going Live:

- [ ] Rotate all API keys (AssemblyAI, OpenAI)
- [ ] Generate new webhook secret
- [ ] Review CORS allowlist (currently allows all origins)
- [ ] Enable Firebase App Check
- [ ] Set up Firebase Authentication security monitoring
- [ ] Review IAM permissions
- [ ] Enable audit logging
- [ ] Set up billing alerts

### Recommended CORS Update:
```typescript
// In functions/src/index.ts
const allowedOrigins = [
  'https://your-app.web.app',
  'https://your-app.firebaseapp.com',
  'https://your-custom-domain.com'
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  }
}));
```

---

## Cost Management

### Set Budget Alerts

**Firebase Console → Usage and Billing:**
1. Set budget: $50/month (adjust as needed)
2. Alert at: 50%, 90%, 100%
3. Actions: Email + Slack notification

### Monitor Costs:
- AssemblyAI: ~$0.00025/second of audio
- OpenAI: ~$0.15/1M tokens (gpt-4o-mini)
- Cloud Functions: Invocations + compute time
- Firestore: Reads/writes/storage
- Cloud Storage: Storage + operations

---

## Troubleshooting

### Common Issues:

**Functions not deploying:**
```bash
# Clear node_modules and rebuild
rm -rf node_modules package-lock.json
npm install
npm run build
firebase deploy --only functions
```

**Indexes failing:**
```bash
# Check for existing indexes
firebase firestore:indexes

# Delete conflicting indexes in Console
# Redeploy
firebase deploy --only firestore:indexes
```

**Rate limiting too strict:**
```typescript
// Temporarily increase limits in rateLimit.ts
max: 500  // instead of 100
```

**CORS errors:**
```typescript
// Temporarily allow all origins
app.use(cors({ origin: true }));
```

---

## Success Criteria

### Deployment is successful when:

1. ✅ All functions deployed without errors
2. ✅ Health endpoint returns 200 OK
3. ✅ Security rules allow authorized access, deny unauthorized
4. ✅ All 11 Firestore indexes show "Enabled"
5. ✅ Rate limiting returns 429 after limit exceeded
6. ✅ Shares API creates and retrieves shares correctly
7. ✅ No errors in Cloud Functions logs
8. ✅ Monitoring alerts are active

---

## Next Steps After Deployment

1. **Monitor for 24 hours:**
   - Check error rates
   - Review rate limit hits
   - Monitor function performance

2. **Gradual rollout:**
   - Enable for beta users first
   - Monitor for issues
   - Expand to all users

3. **Performance tuning:**
   - Adjust rate limits based on actual usage
   - Optimize slow queries
   - Review function memory allocation

4. **Documentation:**
   - Update API documentation
   - Document new shares endpoints
   - Create user guides for caregiver sharing

---

**Deployment Date:** _________
**Deployed By:** _________
**Version:** _________
**Status:** ⬜ Not Started | ⬜ In Progress | ⬜ Complete
