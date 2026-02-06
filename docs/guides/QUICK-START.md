# LumiMD Quick Start Guide

Your seamless mobile-to-web authentication system is ready! Here's how to get it running.

## 🎯 What You Have Now

✅ **Backend:** Cloud Functions with auth handoff endpoints  
✅ **Mobile:** Glanceable dashboard that links to web seamlessly  
✅ **Web Portal:** Auto-signin page with Firebase integration  
✅ **Security:** One-time codes with 5-minute expiration + auto-cleanup  
✅ **Documentation:** Complete API spec (OpenAPI)

## ⚡ 5-Minute Setup

### 1. Install Dependencies

```bash
# Backend
cd functions
npm install

# Mobile
cd ../mobile
npm install

# Web Portal
cd ../web-portal
npm install
```

### 2. Configure Environment Variables

**Mobile:** Create `mobile/.env`

```bash
EXPO_PUBLIC_API_BASE_URL=https://us-central1-lumimd-dev.cloudfunctions.net/api
EXPO_PUBLIC_WEB_PORTAL_URL=https://lumimd.app
EXPO_PUBLIC_FIREBASE_API_KEY=your_api_key
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=your_auth_domain
EXPO_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=your_storage_bucket
EXPO_PUBLIC_FIREBASE_SENDER_ID=your_sender_id
EXPO_PUBLIC_FIREBASE_APP_ID=your_app_id
```

**Web Portal:** Create `web-portal/.env.local`

```bash
NEXT_PUBLIC_API_BASE_URL=https://us-central1-lumimd-dev.cloudfunctions.net/api
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key  # Same as mobile
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_auth_domain
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_storage_bucket
NEXT_PUBLIC_FIREBASE_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
```

### 3. Deploy Backend

```bash
cd functions
npm run build
firebase deploy --only functions
```

### 4. Enable Firestore TTL

1. Open [Firebase Console](https://console.firebase.google.com)
2. Go to **Firestore Database** → **Settings**
3. Scroll to **Time-to-live**
4. Click **+ Add TTL policy**
5. Collection: `auth_handoffs`
6. Field: `expiresAt`
7. Click **Create**

✅ Done! Expired codes will auto-delete.

### 5. Run Mobile App

```bash
cd mobile
npm start

# Press 'i' for iOS simulator
# Press 'a' for Android emulator
```

### 6. Run Web Portal (Development)

```bash
cd web-portal
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## 🧪 Test the Flow

1. **Mobile app:** Sign in (you'll need to implement auth first)
2. **Tap "Action Items" card** → Safari opens
3. **Observe:** Brief loading spinner → redirects to dashboard
4. **Success!** You're authenticated on web without re-login

### Expected Behavior

```
Mobile (tap card)
    ↓
Safari opens: lumimd.app/auth/handoff?code=xyz...
    ↓
"Signing you in..." (< 1 second)
    ↓
Redirects to: lumimd.app/dashboard
    ↓
✅ Authenticated!
```

## 🚨 Common Issues

### "Cannot find module" errors

**Solution:** Run `npm install` in the affected directory

### Mobile can't connect to API

**Solution:** 
- Check `EXPO_PUBLIC_API_BASE_URL` in mobile/.env
- Verify Functions are deployed: `firebase functions:list`
- Test endpoint: `curl https://your-api-url/health`

### Web portal shows "Invalid code"

**Solution:**
- Code expires in 5 minutes - try again
- Verify mobile is using correct API URL
- Check Functions logs: `firebase functions:log`

### TTL not deleting expired codes

**Solution:**
- Verify TTL policy is **Enabled** in console
- Wait 24-72 hours for first cleanup cycle
- For MVP, manual cleanup is fine

## 📱 Mobile Implementation Status

### ✅ Completed
- Glanceable dashboard with stats cards
- Linking utilities (`openWebDashboard`, `openWebActions`, etc.)
- Config system with environment variables
- GlanceableCard component

### 🔨 TODO (Not in this implementation)
- Firebase Auth integration (Email + Google)
- Audio recording workflow
- Real API calls for stats
- Push notification setup

## 🌐 Web Portal Implementation Status

### ✅ Completed
- Auth handoff page with auto-signin
- Firebase client configuration
- Dashboard skeleton
- Basic routing structure

### 🔨 TODO (Future work)
- Full dashboard with real data
- Visit detail pages
- Actions CRUD interface
- Medications tracking
- Caregiver sharing UI

## 📚 Key Files Reference

| File | Purpose |
|------|---------|
| `functions/src/routes/auth.ts` | Handoff endpoints |
| `mobile/lib/linking.ts` | Web portal navigation |
| `mobile/components/GlanceableCard.tsx` | Stats cards |
| `web-portal/app/auth/handoff/page.tsx` | Auto-signin page |
| `functions/openapi.yaml` | Complete API spec |

## 🎓 Next Steps

### Immediate (To Make It Work End-to-End)

1. **Implement Firebase Auth on mobile**
   - Add Firebase SDK: `expo install firebase`
   - Create sign-in screens
   - Update `lib/auth.ts` with real implementation

2. **Deploy web portal**
   - Vercel: `vercel --prod`
   - Or Firebase Hosting: `firebase deploy --only hosting`

3. **Test with real auth**
   - Sign in on mobile
   - Tap a glanceable card
   - Verify seamless web signin

### Phase 1 MVP (Per Dev Guide)

1. **Recording workflow** (mobile)
   - Audio capture with expo-av
   - Upload to Firebase Storage
   - Create visit document

2. **AI Processing** (Make.com or Functions)
   - AssemblyAI transcription
   - OpenAI summarization
   - Action item extraction

3. **Actions Management** (web portal)
   - List view with filters
   - Mark complete
   - Edit/delete

4. **Push Notifications**
   - Device token registration
   - "Your summary is ready" notifications

### Phase 2+ (Later)

- Medications CRUD
- Caregiver sharing
- Visit detail viewer with transcripts
- Export/print features

## 🔗 Helpful Links

- **Codebase Overview:** `../EXTERNAL-DEV-OVERVIEW.md`
- **Auth Deep Dive:** `./SEAMLESS-AUTH-README.md`
- **TTL Setup:** `../../firebase-setup/TTL-SETUP.md`
- **API Reference:** `../../functions/openapi.yaml`

## 💡 Pro Tips

1. **Use emulators during development:**
   ```bash
   firebase emulators:start --only functions,firestore
   ```

2. **Check logs frequently:**
   ```bash
   firebase functions:log --only auth
   ```

3. **Test error cases:**
   - Expired codes (wait 6 minutes)
   - Invalid codes (modify URL)
   - Network failures (airplane mode)

4. **Keep envs in sync:**
   - Mobile and web must use **same Firebase project**
   - API URLs must match deployed Functions

## 🎉 You're Ready!

The foundation for seamless mobile-to-web authentication is complete. When you:

1. Deploy the Functions ✅
2. Enable TTL ✅
3. Configure environment variables ✅
4. Implement Firebase Auth on mobile 🔨

You'll have a **production-ready** seamless auth experience!

---

Questions? Check `./SEAMLESS-AUTH-README.md` for detailed docs.

