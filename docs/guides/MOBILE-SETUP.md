# 📱 LumiMD Mobile App Setup

Quick guide to get your Expo app running and see the layout.

## ⚡ Quick Start (3 Steps)

### Step 1: Install Dependencies

```bash
cd mobile
npm install
```

This will take 2-3 minutes to install all packages.

### Step 2: Start Development Server

```bash
npm start
```

You'll see output like:
```
› Metro waiting on exp://192.168.1.x:8081
› Scan the QR code above with Expo Go (Android) or the Camera app (iOS)

› Press a │ open Android
› Press i │ open iOS simulator
› Press w │ open web
```

### Step 3: Open in Simulator/Device

**Option A: iOS Simulator (Mac only)**
```bash
# Press 'i' in the terminal
# OR
npm run ios
```

**Option B: Android Emulator**
```bash
# Press 'a' in the terminal
# OR
npm run android
```

**Option C: Your Phone (Easiest)**
1. Install **Expo Go** app:
   - iOS: [App Store](https://apps.apple.com/app/expo-go/id982107779)
   - Android: [Play Store](https://play.google.com/store/apps/details?id=host.exp.exponent)
2. Open Expo Go
3. Scan the QR code from your terminal

## 🎯 What You'll See

### Home Screen Layout

```
┌────────────────────────────┐
│  [LumiMD Gradient Header]  │
│  Medical icon, "Today" tag │
│  "Your health, simplified" │
├────────────────────────────┤
│  Quick Overview            │
│                            │
│  ┌──────────────────────┐  │
│  │ Action Items         │  │
│  │ 3 pending         →  │  │
│  └──────────────────────┘  │
│                            │
│  ┌──────────────────────┐  │
│  │ Recent Visits        │  │
│  │ 1 to review       →  │  │
│  └──────────────────────┘  │
│                            │
│  ┌──────────────────────┐  │
│  │  🔴 Start Visit       │  │
│  │  Record and summarize │  │
│  └──────────────────────┘  │
│                            │
│  Tap any card to view     │
│  details in web portal    │
└────────────────────────────┘
```

### Tab Bar (Bottom)
- 🏠 **Home** - Glanceable dashboard (active)
- ✓ **Actions** - Placeholder screen
- 📅 **Visits** - Placeholder screen
- 💊 **Meds** - Placeholder screen

## 🎨 Design Features

✅ **Gradient hero banner** with teal colors (#0A99A4)  
✅ **Glanceable cards** showing stats at a glance  
✅ **Clean typography** with proper hierarchy  
✅ **Soft shadows** and rounded corners (20px)  
✅ **Tap-friendly** - All interactive elements ≥ 44pt  
✅ **Safe areas** - Respects iPhone notch, Android status bar

## 🔧 Troubleshooting

### Issue: "Cannot find module 'expo'"
**Solution:**
```bash
cd mobile
rm -rf node_modules
npm install
```

### Issue: iOS Simulator won't open
**Solution:**
```bash
# Install Xcode Command Line Tools
xcode-select --install

# Or manually open Simulator
open -a Simulator
```

### Issue: Metro bundler stuck
**Solution:**
```bash
npm run reset
# This clears cache and restarts
```

### Issue: "Network response timed out"
**Solution:**
- Make sure computer and phone are on same WiFi
- Disable VPN
- Try using a tunnel: `npx expo start --tunnel`

### Issue: Blank screen / white screen
**Solution:**
```bash
# Clear cache and restart
rm -rf .expo
npm start --clear
```

## 📱 Testing the Layout

### Things to Try:

1. **Scroll the home screen** - Should feel smooth
2. **Tap the glanceable cards** - Currently shows alert (will open web when auth is ready)
3. **Tap "Start Visit" button** - Shows "TODO" alert
4. **Switch tabs** - Navigate between Home, Actions, Visits, Meds
5. **Rotate device** - Layout should adjust (iOS only)

### Expected Behavior:

- ✅ Gradient looks smooth, no banding
- ✅ Text is crisp and readable
- ✅ Shadows render correctly
- ✅ Tab bar icons change color when active
- ✅ Safe areas respected (no content under notch)

## 🚧 Current Limitations

Since this is the scaffold/layout phase:

- ⚠️ **Stats are hardcoded** (3 pending, 1 to review)
- ⚠️ **Tapping cards shows alert** (no auth yet)
- ⚠️ **No real data** (needs API integration)
- ⚠️ **Recording doesn't work** (to be implemented)

This is expected! We're focused on the **UI/UX layout** first.

## 📊 Performance

On a typical device, you should see:
- **60 FPS scrolling**
- **< 100ms tap response**
- **Instant tab switching**

If it's slow, try:
```bash
npm start -- --dev-client
```

## 🎓 Next Steps

### Immediate (Make it functional)
1. Implement Firebase Auth
2. Connect to real API
3. Add recording workflow

### Phase 1 (MVP)
1. Audio capture with expo-av
2. Upload to Firebase Storage
3. Push notifications
4. Seamless web authentication

### Phase 2 (Polish)
1. Loading states
2. Error handling
3. Offline support
4. Animations

## 📚 File References

| File | What It Does |
|------|-------------|
| `app/(tabs)/index.tsx` | Home screen with glanceable dashboard |
| `components/GlanceableCard.tsx` | Stats card component |
| `components/HeroBanner.tsx` | Gradient header banner |
| `components/StartVisitCTA.tsx` | Primary action button |
| `components/ui.tsx` | Design tokens (colors, spacing) |
| `lib/linking.ts` | Web portal navigation utilities |

## 💡 Pro Tips

### Faster Development
```bash
# Hot reload doesn't require shaking device
# Just save your files - changes appear instantly
```

### Debug Menu (Physical Device)
- **iOS:** Shake device → opens dev menu
- **Android:** Shake device OR `adb shell input keyevent 82`

### See Logs
```bash
# In another terminal
npx react-native log-ios    # iOS logs
npx react-native log-android # Android logs
```

### Take Screenshots
The layout looks great for App Store screenshots! 📸

## 🎉 You're All Set!

Your mobile app is now running and you can see the complete layout. The design follows your Dev Guide specs with:

- ✅ Gradient hero banner
- ✅ Glanceable cards for quick stats
- ✅ Primary "Start Visit" CTA
- ✅ Clean, modern UI with LumiMD branding
- ✅ Tab navigation ready for expansion

**Next:** Implement Firebase Auth to make the web links work seamlessly!

---

Need help? Check:
- `../../mobile/README.md` - Full mobile documentation
- `./QUICK-START.md` - Overall project setup
- `../CODEBASE-REFERENCE.md` - Project architecture and reference

