# Seamless Mobile → Web Authentication

This implementation allows users to tap a card in the mobile app and land directly in the web portal **without re-entering credentials**.

## 🎯 User Experience

1. User opens mobile app (already authenticated)
2. User taps "3 pending action items" card
3. Safari/browser opens
4. Brief "Signing you in..." spinner (< 1 second)
5. User lands on web dashboard, fully authenticated
6. **No password entry, no email, nothing!**

## 🔐 How It Works

### Flow Diagram

```
Mobile App (authenticated)
    ↓
    [1] Create handoff code via /v1/auth/create-handoff
    ↓
Handoff code stored in Firestore (5 min TTL)
    ↓
    [2] Open URL: lumimd.app/auth/handoff?code=xyz
    ↓
Web Portal
    ↓
    [3] Exchange code via /v1/auth/exchange-handoff
    ↓
Custom Firebase token returned
    ↓
    [4] signInWithCustomToken(token)
    ↓
    [5] Redirect to /dashboard (or returnTo param)
```

### Security Features

✅ **One-time use** - Code invalidated after exchange  
✅ **Short-lived** - 5 minute expiration  
✅ **Server-side validation** - No client trust  
✅ **HTTPS only** - All endpoints require TLS  
✅ **No sensitive data in URL** - Just opaque code  
✅ **Auto-cleanup** - Firestore TTL handles expired codes

## 📁 Files Created

### Backend (Cloud Functions)

```
functions/
├── package.json                    # Dependencies (firebase-admin, express, zod)
├── tsconfig.json                   # TypeScript config
├── src/
│   ├── index.ts                    # Main entry point, Express app
│   ├── middlewares/
│   │   └── auth.ts                 # requireAuth middleware
│   └── routes/
│       └── auth.ts                 # create-handoff, exchange-handoff endpoints
└── openapi.yaml                    # Complete API spec with auth endpoints
```

### Mobile App

```
mobile/
├── lib/
│   ├── config.ts                   # Environment configuration
│   ├── auth.ts                     # Firebase auth helpers (placeholder)
│   └── linking.ts                  # openWebDashboard, openWebVisit, etc.
├── components/
│   └── GlanceableCard.tsx          # Stats card component
├── app/(tabs)/
│   └── index.tsx                   # Updated home screen with linking
└── .env.template                   # Environment variables template
```

### Web Portal (Next.js)

```
web-portal/
├── package.json                    # Dependencies (next, firebase)
├── tsconfig.json
├── next.config.js
├── lib/
│   └── firebase.ts                 # Firebase client config
├── app/
│   ├── layout.tsx                  # Root layout
│   ├── globals.css                 # Global styles
│   ├── auth/handoff/
│   │   └── page.tsx                # Auto-signin page
│   └── dashboard/
│       └── page.tsx                # Main dashboard
└── .env.example                    # Environment variables template
```

### Documentation

```
firebase-setup/
└── TTL-SETUP.md                    # Firestore TTL configuration guide
```

## 🚀 Setup Instructions

### 1. Deploy Cloud Functions

```bash
cd functions
npm install
npm run build

# Deploy to dev environment
firebase use lumimd-dev
firebase deploy --only functions

# Deploy to production
firebase use lumimd
firebase deploy --only functions
```

### 2. Configure Firestore TTL

Follow instructions in `/firebase-setup/TTL-SETUP.md`:

1. Go to Firebase Console → Firestore Database → Settings
2. Create TTL policy:
   - Collection: `auth_handoffs`
   - Field: `expiresAt`
   - Status: Enabled

### 3. Mobile App Setup

```bash
cd mobile
npm install

# Copy environment template
cp .env.template .env

# Edit .env with your Firebase config
# EXPO_PUBLIC_API_BASE_URL=https://us-central1-lumimd-dev.cloudfunctions.net/api
# EXPO_PUBLIC_WEB_PORTAL_URL=https://lumimd.app
# ... (Firebase credentials)
```

### 4. Web Portal Setup

```bash
cd web-portal
npm install

# Copy environment template
cp .env.example .env.local

# Edit .env.local with your Firebase config
# NEXT_PUBLIC_API_BASE_URL=https://us-central1-lumimd-dev.cloudfunctions.net/api
# ... (Firebase credentials - must match mobile)
```

### 5. Deploy Web Portal

```bash
cd web-portal

# For Vercel
vercel --prod

# For Firebase Hosting
npm run build
firebase deploy --only hosting
```

## 🧪 Testing

### Manual Test Flow

1. **Mobile app:**
   ```typescript
   // Tap "Action Items" card
   // This calls openWebActions() from lib/linking.ts
   ```

2. **Check logs:**
   ```bash
   # Functions logs
   firebase functions:log --only auth
   
   # Look for:
   # [auth] Created handoff code for user abc123
   # [auth] Exchanged handoff code for user abc123
   ```

3. **Verify:**
   - Browser opens to `lumimd.app/auth/handoff?code=...`
   - Loading spinner appears briefly
   - Redirects to `/actions` (or returnTo param)
   - User is authenticated (check auth state in dev tools)

### Edge Cases to Test

- ❌ **Expired code** (wait 6 minutes) → Should show error + redirect to sign-in
- ❌ **Reuse code** (tap back and forward) → Should show "already used" error
- ❌ **Invalid code** → Should show error + redirect to sign-in
- ✅ **Normal flow** → Seamless authentication
- ✅ **Fallback** (no auth) → Opens web without handoff

## 📝 API Reference

### POST /v1/auth/create-handoff

**Auth:** Required (Bearer token)

**Response:**
```json
{
  "code": "xyz789abc123..."
}
```

**Usage:**
```typescript
const idToken = await auth.currentUser?.getIdToken();
const response = await fetch(`${apiBaseUrl}/v1/auth/create-handoff`, {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${idToken}` },
});
const { code } = await response.json();
```

### POST /v1/auth/exchange-handoff

**Auth:** None required

**Request:**
```json
{
  "code": "xyz789abc123..."
}
```

**Response:**
```json
{
  "token": "eyJhbGc..."
}
```

**Usage:**
```typescript
const response = await fetch(`${apiBaseUrl}/v1/auth/exchange-handoff`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ code }),
});
const { token } = await response.json();

// Sign in with custom token
await signInWithCustomToken(auth, token);
```

## 🔧 Troubleshooting

### "Invalid or expired code" error

**Cause:** Code expired (5 min) or already used

**Solution:** 
- Increase TTL if needed (not recommended)
- Check if Firestore TTL is deleting too aggressively
- Verify time sync on mobile device

### "Failed to create handoff code" on mobile

**Cause:** Network error or not authenticated

**Solution:**
- Check mobile auth state: `auth.currentUser`
- Verify API base URL in `.env`
- Check Firebase Functions logs for errors

### Web portal doesn't redirect after signin

**Cause:** Missing or invalid `returnTo` parameter

**Solution:**
- Check URL: `?code=xyz&returnTo=/dashboard`
- Verify Next.js router is working
- Check browser console for errors

### Handoff codes not being deleted

**Cause:** Firestore TTL not configured

**Solution:**
- Follow `/firebase-setup/TTL-SETUP.md`
- Verify policy is **Enabled** in console
- Wait 24-72 hours for first cleanup cycle
- Alternative: Add scheduled Cloud Function (see TTL-SETUP.md)

## 🎨 Customization

### Change expiration time

Edit `/functions/src/routes/auth.ts`:

```typescript
// Change from 5 minutes to 10 minutes
const HANDOFF_TTL_MS = 10 * 60 * 1000;
```

**Don't forget to update TTL-SETUP.md!**

### Add additional security checks

Example: Device fingerprinting

```typescript
// Mobile
const deviceId = await getDeviceId();
const code = await createHandoffCode({ deviceId });

// Backend
const handoff = {
  userId,
  deviceId: req.body.deviceId,
  ipAddress: req.ip,
  // ...
};

// Validate on exchange
if (handoff.ipAddress !== req.ip) {
  throw new Error('IP mismatch');
}
```

### Customize web loading UI

Edit `/web-portal/app/auth/handoff/page.tsx`:

```tsx
// Replace spinner with your branded loader
<YourCustomLoadingSpinner />
```

## 📊 Monitoring

### Key Metrics

- **Handoff success rate:** % of codes that get successfully exchanged
- **Average handoff time:** Time from create → exchange
- **Error rate:** % of failed exchanges
- **TTL cleanup lag:** How long expired codes sit in Firestore

### Logging

Functions automatically log:
```
[auth] Created handoff code for user {userId}
[auth] Exchanged handoff code for user {userId}
```

Add structured logging for analytics:

```typescript
import * as functions from 'firebase-functions';

functions.logger.info('handoff_created', {
  userId,
  timestamp: Date.now(),
});
```

## 🔒 Security Considerations

### Rate Limiting (Recommended for Production)

Add to `/functions/src/routes/auth.ts`:

```typescript
import rateLimit from 'express-rate-limit';

const createHandoffLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 5, // 5 requests per minute per user
  message: 'Too many handoff requests, try again later',
});

authRouter.post('/create-handoff', createHandoffLimiter, requireAuth, ...);
```

### Webhook Signature Validation

If you add webhook endpoints, validate signatures:

```typescript
const crypto = require('crypto');

function validateWebhookSignature(req, secret) {
  const signature = req.headers['x-webhook-signature'];
  const body = JSON.stringify(req.body);
  const hash = crypto.createHmac('sha256', secret).update(body).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(hash));
}
```

## 📈 Next Steps

### Phase 2 Enhancements

1. **Analytics dashboard** - Track handoff success rates
2. **Biometric confirmation** (mobile) - Optional Face ID before opening web
3. **Session management** - Track active sessions across devices
4. **Caregiver context** - Pass shareId for viewer mode

### Alternative Approaches

If you want even simpler (but less secure):

**Universal Links** - Configure deep links that auto-authenticate:
```
https://lumimd.app/dashboard?token=<short-lived-token>
```

Not recommended for production due to token exposure in URLs.

## 🆘 Support

Questions or issues? Check:

1. This README
2. `../../firebase-setup/TTL-SETUP.md`
3. OpenAPI spec: `../../functions/openapi.yaml`
4. Architecture details: `../CODEBASE-REFERENCE.md`

## ✅ Checklist

Before deploying to production:

- [ ] Cloud Functions deployed
- [ ] Firestore TTL policy enabled (both dev & prod)
- [ ] Environment variables configured (.env files)
- [ ] Web portal deployed and accessible
- [ ] Mobile app can reach API endpoints
- [ ] End-to-end test passes
- [ ] Error handling tested (expired code, invalid code)
- [ ] Rate limiting enabled (optional but recommended)
- [ ] Monitoring/logging configured
- [ ] Security review passed

---

## Web Portal Sign-In Options (March 2026)

The handoff flow above is one of several ways users can access the web portal:

| Method | Who | How |
|--------|-----|-----|
| **Email/password** | All users | Direct sign-in at `lumimd.app/sign-in` |
| **Google Sign-In** | Google users | `signInWithPopup` on web sign-in/sign-up pages |
| **Mobile handoff** | All users (esp. Apple) | Settings → Web Access → Open Web Portal (this flow) |
| **Set password** | Apple/Google-only users | Settings → Web Access → Set Password for Web → then email/password sign-in |

Apple Sign-In is not available directly on web. Apple users should use the handoff flow or set a web password via mobile settings.

**Built with ❤️ for LumiMD** | Last updated: March 2026

