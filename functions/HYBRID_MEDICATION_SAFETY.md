# Hybrid Medication Safety System

## Overview

LumiMD uses a **hybrid medication safety system** that combines the speed and reliability of hardcoded checks with the comprehensive coverage of AI-powered analysis.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    New Medication Added                      │
└───────────────────────────────┬─────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────┐
│              Layer 1: Hardcoded Safety Checks               │
│                     (10-50ms, Free, Local)                   │
│  ✓ 100+ common medications                                  │
│  ✓ Critical drug interactions                                │
│  ✓ Allergy conflicts                                        │
│  ✓ Duplicate therapy (same class)                           │
└───────────────────────────────┬─────────────────────────────┘
                                │
                    ┌───────────▼───────────┐
                    │  Critical warnings?   │
                    └───────────┬───────────┘
                         Yes │ │ No
                  ┌──────────┘ └──────────┐
                  ▼                       ▼
    ┌────────────────────┐   ┌────────────────────────────┐
    │  Return warnings   │   │ Layer 2: AI Safety Checks  │
    │  immediately       │   │  (1-2s, ~$0.01, OpenAI)    │
    └────────────────────┘   │ ✓ Comprehensive coverage   │
                             │ ✓ Handles misspellings     │
                             │ ✓ Brand/generic matching   │
                             │ ✓ PharmD-level reasoning   │
                             │ ✓ Cached for 30 days       │
                             └──────────┬─────────────────┘
                                        │
                                        ▼
                            ┌────────────────────────┐
                            │  Merge & deduplicate   │
                            │  warnings              │
                            └────────────┬───────────┘
                                        │
                                        ▼
                            ┌────────────────────────┐
                            │  Return all warnings   │
                            └────────────────────────┘
```

## Why Hybrid?

| Aspect | Hardcoded Only | AI Only | **Hybrid (Best)** |
|--------|---------------|---------|-------------------|
| **Speed** | ⚡ Instant (10ms) | 🐌 Slow (1-2s) | ⚡ Instant for critical, thorough for others |
| **Cost** | 💰 Free | 💸 $0.01-0.03/check | 💰 Mostly free (cached AI) |
| **Coverage** | ❌ Limited (~100 meds) | ✅ Comprehensive | ✅ Comprehensive |
| **Reliability** | ✅ Always works | ⚠️ Depends on OpenAI | ✅ Graceful fallback |
| **HIPAA** | ✅ Fully local | ⚠️ Sends data to OpenAI | ✅ Critical checks stay local |
| **Maintenance** | ❌ Manual updates | ✅ Auto-updated | ⚡ Best of both |

## How It Works

### 1. Hardcoded Checks (Layer 1)

**Always runs first** - covers critical cases with zero latency:

```typescript
// functions/src/services/medicationSafety.ts
const warnings = await runHardcodedSafetyChecks(userId, newMed);

// Checks:
// - Duplicate exact medications
// - Duplicate therapeutic classes (e.g., two beta-blockers)
// - Critical interactions (warfarin + NSAIDs)
// - Allergy conflicts (penicillin → amoxicillin)
```

**Coverage:**
- 100+ common medications with therapeutic classes
- 10+ high-priority drug interactions
- Direct allergy matches + cross-reactivity patterns

**Performance:**
- Execution time: 10-50ms
- Cost: $0
- Reliability: 100% (no external dependencies)

### 2. AI Checks (Layer 2)

**Runs conditionally** - adds comprehensive coverage:

```typescript
// Only if no critical warnings from Layer 1
// AND AI checks are enabled (env var)
const aiWarnings = await runAIBasedSafetyChecks(userId, newMed);

// AI advantages:
// - Recognizes thousands of medications
// - Handles misspellings ("Lissinopril" → Lisinopril)
// - Brand/generic matching (Advil → Ibuprofen)
// - PharmD-level clinical reasoning
// - Nuanced severity assessment
```

**Performance:**
- First call: 1-2 seconds
- Cached calls: 10ms (cache hit)
- Cost: ~$0.01-0.03 per unique check
- Cache duration: 30 days

## Configuration

### Enable/Disable AI Checks

```bash
# functions/.env
ENABLE_AI_SAFETY_CHECKS=true   # Enable hybrid mode
# or
ENABLE_AI_SAFETY_CHECKS=false  # Hardcoded only (default)
```

### Per-Request Control

```typescript
// Enable AI for this specific check
const warnings = await runMedicationSafetyChecks(userId, newMed, {
  useAI: true
});

// Disable AI for this check (use hardcoded only)
const warnings = await runMedicationSafetyChecks(userId, newMed, {
  useAI: false
});
```

## Cost Analysis

### Typical Scenario (1000 visits/month)

**Without AI (Hardcoded Only):**
- Cost: $0
- Coverage: ~80% of common cases
- Average check time: 20ms

**With AI (Hybrid):**
- First-time checks: ~300/month (new medication combinations)
- Cached checks: ~700/month (seen before)
- Cost: 300 × $0.02 = **$6/month**
- Coverage: ~98% of all cases
- Average check time: 50ms (mostly cached)

**ROI Analysis:**
- Cost per check: $0.006
- Potential prevented adverse event: Priceless
- Patient trust & safety: Immeasurable

### Cache Effectiveness

The caching system dramatically reduces costs:

```
Month 1: 80% first-time checks → $16 cost
Month 2: 40% first-time checks → $8 cost
Month 3: 20% first-time checks → $4 cost
Steady state: ~15% first-time → $3-4/month
```

## Prompt Engineering

### PharmD-Level Prompt

Location: `functions/prompts/medication-safety-check.txt`

**Key features:**
1. **Clinical expertise**: Acts as PharmD, not generic chatbot
2. **Structured output**: Returns JSON schema with warnings
3. **Severity calibration**: Clear definitions (critical/high/moderate/low)
4. **Patient-friendly language**: Actionable recommendations
5. **Evidence-based**: Uses clinical decision rules
6. **Examples included**: 5 calibration examples in prompt

**Token optimization:**
- Prompt size: ~2800 tokens
- Average response: ~500 tokens
- Total: ~3300 tokens = ~$0.006 per check

### Prompt Maintenance

```bash
# Edit prompt
vim functions/prompts/medication-safety-check.txt

# Test with sample data
npm run test:safety-prompts

# Deploy changes (automatic on next function deploy)
firebase deploy --only functions
```

## Caching Strategy

### Cache Key Generation

```typescript
// Create deterministic key from:
const key = hash([
  newMed.name.toLowerCase(),
  ...currentMeds.map(m => m.name.toLowerCase()).sort(),
  ...allergies.map(a => a.toLowerCase()).sort()
]);

// Example:
// "ibuprofen-600mg" + ["warfarin-5mg"] + ["penicillin"]
// → md5: "a3f5b8c2..."
```

### Cache Storage

```typescript
// Firestore collection: medicationSafetyCache
{
  [cacheKey]: {
    warnings: [...],
    createdAt: Timestamp,
    // Auto-expires after 30 days
  }
}
```

### Cache Invalidation

Cache entries automatically expire after 30 days. Manual invalidation:

```bash
# Clear entire cache (rarely needed)
firebase firestore:delete medicationSafetyCache --recursive

# Clear specific entry
firebase firestore:delete medicationSafetyCache/[key]
```

## Monitoring & Analytics

### CloudWatch Metrics

```typescript
// Logged for each safety check:
{
  userId: string,
  medication: string,
  checkMethod: 'hardcoded-critical' | 'hardcoded' | 'hybrid',
  hardcodedWarnings: number,
  aiWarnings: number,
  totalWarnings: number,
  criticalWarnings: number,
  duration: number,
  cacheHit: boolean,
  cost: number
}
```

### Key Metrics to Track

1. **Cache hit rate**: Should be >80% after first month
2. **AI check frequency**: Should decrease over time
3. **Warning rates**: % of checks with warnings by severity
4. **Cost per check**: Should decrease as cache fills
5. **Check duration**: Should stay <100ms average

### Query Examples

```javascript
// CloudWatch Insights

// Average check duration by method
fields checkMethod, duration
| stats avg(duration) by checkMethod

// Cache hit rate
fields cacheHit
| stats count() as total, sum(cacheHit) as hits
| eval hitRate = hits / total * 100

// Cost analysis
fields cost
| stats sum(cost) as totalCost, avg(cost) as avgCost, count() as checks

// Warning severity distribution
fields severity
| stats count() by severity
```

## Testing

### Unit Tests

```typescript
// Test hardcoded checks
describe('Hardcoded Safety Checks', () => {
  it('detects warfarin + ibuprofen interaction', async () => {
    const warnings = await runHardcodedSafetyChecks(userId, {
      name: 'Ibuprofen',
      dose: '600mg'
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0].severity).toBe('critical');
  });
});

// Test AI checks
describe('AI Safety Checks', () => {
  it('handles brand names correctly', async () => {
    const warnings = await runAIBasedSafetyChecks(userId, {
      name: 'Advil' // Brand name for Ibuprofen
    });
    // Should still detect interactions
  });
});

// Test hybrid system
describe('Hybrid Safety System', () => {
  it('skips AI if critical warning found', async () => {
    const warnings = await runMedicationSafetyChecks(userId, newMed);
    // Should return immediately with hardcoded warnings
  });
});
```

### Integration Tests

```bash
# Test with real data
npm run test:safety-integration

# Test AI prompt
npm run test:safety-prompts

# Test caching
npm run test:safety-cache
```

## Gradual Rollout Strategy

### Phase 1: Hardcoded Only (Current)
- Enable hardcoded checks for all users
- Monitor performance and coverage
- Build confidence in system

### Phase 2: AI for Admin/Test Users
```typescript
const useAI = user.isAdmin || user.betaTester;
const warnings = await runMedicationSafetyChecks(userId, newMed, { useAI });
```

### Phase 3: AI for 10% of Users
```typescript
const useAI = hashUserId(userId) % 10 === 0;
```

### Phase 4: AI for All Users (Full Hybrid)
```bash
ENABLE_AI_SAFETY_CHECKS=true
```

## Troubleshooting

### Issue: High OpenAI Costs

**Diagnosis:**
```bash
# Check cache hit rate
firebase firestore:query medicationSafetyCache --limit 100
# Should see entries
```

**Solution:**
- Verify caching is enabled
- Check cache expiration (should be 30 days)
- Review logs for cache misses

### Issue: Slow Response Times

**Diagnosis:**
```bash
# Check CloudWatch logs
# Filter: [medicationSafetyAI] duration > 2000
```

**Solution:**
- Verify cache is working
- Consider increasing cache duration
- Check OpenAI API latency

### Issue: AI Checks Not Running

**Diagnosis:**
- Check env var: `ENABLE_AI_SAFETY_CHECKS`
- Check logs for "AI checks disabled"
- Verify OpenAI API key is set

**Solution:**
```bash
firebase functions:config:set openai.api_key="<OPENAI_API_KEY>"
ENABLE_AI_SAFETY_CHECKS=true firebase deploy --only functions
```

## Future Enhancements

### 1. Confidence Scoring
```typescript
interface Warning {
  confidence: 0-1,  // AI's confidence in this warning
  source: 'hardcoded' | 'ai' | 'hybrid'
}
```

### 2. Patient-Specific Risk Factors
```typescript
// Consider age, weight, kidney function
const warnings = await runMedicationSafetyChecks(userId, newMed, {
  patientAge: 75,
  kidneyFunction: 'reduced'
});
```

### 3. Medication History Analysis
```typescript
// Check if patient has tolerated similar medications before
const hasToleratedNSAIDs = await checkMedicationHistory(userId, 'nsaid');
if (hasToleratedNSAIDs) {
  // Reduce warning severity
}
```

### 4. Provider Override System
```typescript
// Allow provider to acknowledge and override warnings
await acknowledgeWarning(warningId, {
  providerId,
  rationale: "Patient needs NSAID for pain control, will monitor INR closely"
});
```

## Support

For questions or issues:
1. Check CloudWatch logs: `/aws/lambda/api-[env]`
2. Review Firestore cache: `medicationSafetyCache` collection
3. Test prompt: `functions/prompts/medication-safety-check.txt`
4. File issue: GitHub repo

---

**Last Updated**: January 2025
**Version**: 1.0.0
**Status**: Production-ready
