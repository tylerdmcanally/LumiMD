# 🚨 CRITICAL: API Key Rotation Required

**Date**: 2025-11-15
**Severity**: CRITICAL
**Application**: LumiMD (HIPAA-Compliant Medical Application)

## Summary

Previous API keys were exposed in bash command history and need to be rotated immediately to prevent unauthorized access to:
- OpenAI API (medication extraction, visit summarization)
- AssemblyAI API (audio transcription)
- Webhook verification endpoints

## Immediate Actions Required

### 1. Rotate OpenAI API Key (HIGH PRIORITY)

1. Visit: https://platform.openai.com/api-keys
2. **REVOKE** the old API key (starts with `sk-proj-wEiT2_EN7...`)
3. Create a new API key
4. Update local environment:
   ```bash
   # Update functions/.env file
   vim functions/.env
   # Replace OPENAI_API_KEY value
   ```
5. Deploy to Firebase:
   ```bash
   firebase functions:config:set openai.api_key="YOUR_NEW_KEY_HERE"
   firebase deploy --only functions
   ```

### 2. Rotate AssemblyAI API Key (HIGH PRIORITY)

1. Visit: https://www.assemblyai.com/dashboard
2. **DELETE** the old API key (`67a14b4f3c22498587718dfe4b9f429a`)
3. Generate a new API key
4. Update local environment:
   ```bash
   # Update functions/.env file
   vim functions/.env
   # Replace ASSEMBLYAI_API_KEY value
   ```
5. Deploy to Firebase:
   ```bash
   firebase functions:config:set assemblyai.api_key="YOUR_NEW_KEY_HERE"
   firebase deploy --only functions
   ```

### 3. Rotate Webhook Secret (MEDIUM PRIORITY)

A new webhook secret has been generated for you:
```
5805c3fda92781cc0734ac6bfc30668c3b02ecac0a403bded7cf8a75c2a23236
```

Update and deploy:
```bash
# Update functions/.env file
vim functions/.env
# Replace VISIT_PROCESSING_WEBHOOK_SECRET with the new value above

# Deploy to Firebase
firebase functions:config:set webhook.visit_processing_secret="5805c3fda92781cc0734ac6bfc30668c3b02ecac0a403bded7cf8a75c2a23236"
firebase deploy --only functions
```

## Verification Steps

After rotating all keys:

```bash
# 1. Verify Firebase config is updated
firebase functions:config:get

# 2. Test the application
# - Upload an audio visit → verify AssemblyAI transcription works
# - Check visit summary → verify OpenAI summarization works
# - Check medications extraction → verify OpenAI extraction works

# 3. Monitor for errors
firebase functions:log --only api
```

## Git History Check

Good news: No .env files were found in git history. The .gitignore is working correctly.

```bash
# Already verified - no .env files in git
git log --all --full-history -- "**/.env" "**/.env.local"
# (returned empty)
```

## Timeline

- **NOW**: Revoke exposed keys in provider dashboards
- **Within 1 hour**: Deploy new keys to Firebase
- **Within 2 hours**: Verify application functionality
- **Within 24 hours**: Monitor logs for any issues

## Prevention

The [functions/.env.example](functions/.env.example) file has been updated with:
- Comprehensive rotation instructions
- Security warnings for HIPAA compliance
- Step-by-step rotation procedures
- Verification checklist

## Status Tracking

- [ ] OpenAI API key revoked and rotated
- [ ] AssemblyAI API key deleted and rotated
- [ ] Webhook secret rotated
- [ ] Firebase functions config updated
- [ ] Functions redeployed
- [ ] Application functionality verified
- [ ] This file can be deleted once complete

---

**Note**: This file should be deleted after all rotations are complete. Do not commit this file to git.
