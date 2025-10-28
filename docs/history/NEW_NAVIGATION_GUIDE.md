# Quick Navigation Guide - Expo Router

## 🗺️ App Structure Visual

```
┌─────────────────────────────────────────────────────┐
│                   APP OPENED                         │
└────────────┬────────────────────────┬────────────────┘
             │                         │
    Not Logged In              Logged In
             │                         │
             ▼                         ▼
    ┌─────────────────┐      ┌──────────────────────┐
    │  /auth/login    │      │    / (Home Tab)      │
    │                 │      │                       │
    │  - Login form   │      │  Tab Bar:            │
    │  - Register btn │      │  🏠 | 📋 | 👤        │
    └─────────────────┘      └──────────────────────┘
                                      │
                   ┌──────────────────┼──────────────────┐
                   │                  │                   │
            ┌──────▼───────┐  ┌──────▼────────┐  ┌──────▼───────┐
            │  Home Tab 🏠 │  │  Visits Tab📋 │  │ Profile Tab👤│
            │              │  │               │  │              │
            │ - Dashboard  │  │ - Visit List  │  │ - User Info  │
            │ - Start btn  │  │ - Click visit │  │ - Settings   │
            │ - View hist  │  │ - Record btn  │  │ - Logout     │
            └──────────────┘  └───────┬───────┘  └──────────────┘
                                      │
                     ┌────────────────┼────────────────┐
                     │                │                 │
            ┌────────▼────────┐ ┌────▼────────┐ ┌────▼──────────┐
            │ /visits/123     │ │/visits/record│ │  Back to List │
            │                 │ │              │ │               │
            │ - Full detail   │ │ - Consent    │ │  (router.back)│
            │ - AI summary    │ │ - Record     │ │               │
            │ - Transcript    │ │ - Upload     │ │               │
            │ - Change prov   │ │ - Tag prov   │ │               │
            │ - Delete        │ └──────────────┘ │               │
            └─────────────────┘                  └───────────────┘
```

## 📍 URL Map

```
Authentication (Not Protected)
├─ /auth/login              Login screen
└─ /auth/register           Register screen

App (Protected - Requires Auth)
├─ /                        Home tab (default)
│
├─ /visits                  Visits tab
│   ├─ /visits/123         Visit detail (dynamic)
│   └─ /visits/record      Record visit (modal)
│
└─ /profile                 Profile tab
```

## 🎯 Common Navigation Patterns

### 1. Start Recording Flow
```
Home Tab
  ↓ User clicks "Start New Visit"
/visits/record (full-screen modal)
  ↓ User records & uploads
/visits/123 (detail)
  ↓ User clicks back
/visits (list)
```

### 2. Review Past Visit Flow
```
Home Tab
  ↓ User clicks "View History"
Visits Tab (/visits)
  ↓ User clicks a visit
/visits/123 (detail)
  ↓ User clicks back
/visits (list)
```

### 3. Direct Tab Access
```
Any screen
  ↓ User taps Visits tab icon
/visits (list)
```

## 💻 Code Examples

### Navigate to Visit Detail
```typescript
import { router } from 'expo-router';

// From visit list
const handleVisitClick = (visitId: string) => {
  router.push(`/(app)/(visits)/${visitId}`);
};

// Or using full path
router.push(`/visits/${visitId}`);
```

### Start Recording
```typescript
// From home screen
const handleStartRecording = () => {
  router.push('/(app)/(visits)/record');
};

// Or simpler
router.push('/visits/record');
```

### Go Back
```typescript
// Simple back
router.back();

// Or replace (no back stack)
router.replace('/(app)/(visits)');
```

### Switch Tabs
```typescript
// Go to home tab
router.push('/(app)/(home)');

// Go to visits tab
router.push('/(app)/(visits)');

// Go to profile tab
router.push('/(app)/(profile)');
```

## 🎨 Tab Bar Reference

```
┌─────────────────────────────────────────────┐
│                                              │
│           Screen Content Here                │
│                                              │
├─────────────────────────────────────────────┤
│   🏠        📋         👤                   │
│  Home     Visits    Profile                 │
│  ─────    ─────     ─────                   │
└─────────────────────────────────────────────┘
     ↑          ↑          ↑
   Active   Inactive   Inactive
```

**Active Tab:**
- Blue icon and label
- Screen is visible

**Inactive Tabs:**
- Gray icon and label
- Tap to switch

## 🔄 Navigation State

### Stack Navigation (within Visits tab)
```
Visits Tab Stack:
├─ index.tsx (list)      ← Base screen
├─ [id].tsx (detail)     ← Pushed on top
└─ record.tsx (modal)    ← Presented as modal

Back button pops the stack:
Detail → List
Record → (dismissed, returns to Home)
```

### Tab Navigation
```
Tabs (always accessible):
├─ Home     ← /
├─ Visits   ← /visits
└─ Profile  ← /profile

Each tab has its own stack!
```

## 🎬 Screen Presentation Modes

### Regular Push
```typescript
// Default - slides from right
<Stack.Screen name="[id]" />
```

### Full Screen Modal
```typescript
// Covers entire screen
<Stack.Screen
  name="record"
  options={{ presentation: 'fullScreenModal' }}
/>
```

### Card Modal
```typescript
// iOS style modal from bottom
<Stack.Screen
  name="edit"
  options={{ presentation: 'modal' }}
/>
```

## 🚀 Quick Reference

### Must-Know Commands

```typescript
// Navigate forward
router.push('/path');

// Navigate and replace
router.replace('/path');

// Go back
router.back();

// Navigate with params
router.push({
  pathname: '/visits/[id]',
  params: { id: '123' }
});

// Get params in screen
const { id } = useLocalSearchParams<{ id: string }>();
```

### Common Paths

```typescript
// Tabs
'/(app)/(home)'         // Home
'/(app)/(visits)'       // Visits
'/(app)/(profile)'      // Profile

// Visits screens
'/(app)/(visits)/record'         // Record
'/(app)/(visits)/[id]'          // Detail (need params)
`/(app)/(visits)/${visitId}`    // Detail (with ID)

// Auth
'/(auth)/login'         // Login
'/(auth)/register'      // Register
```

## 🎯 Testing Checklist

```
✓ Open app → Shows correct screen based on auth
✓ Login → Redirects to home tab
✓ Tap each tab → Switches correctly
✓ Start visit → Opens recorder
✓ Finish recording → Goes to detail
✓ Back from detail → Returns to list
✓ Click visit from list → Opens detail
✓ Logout → Returns to login
✓ Deep link → Opens correct screen
```

## 🐛 Troubleshooting

### Issue: "No routes matched"
```
Check your route path matches file structure:
/visits/123 → app/(app)/(visits)/[id].tsx ✅
/visits/123 → app/visits/[id].tsx ❌ (missing (app))
```

### Issue: Tab bar not showing
```
Check you're in (app) group:
app/(app)/_layout.tsx ✅ Has Tabs
app/_layout.tsx ❌ Root layout, no tabs
```

### Issue: Can't go back
```
Use router.back() instead of manual state:
router.back() ✅
setView('previous') ❌ (old pattern)
```

## 📚 Learn More

- File-based routing: `/app/` folder = routes
- Parentheses `(name)` = route group (no URL segment)
- Brackets `[name]` = dynamic param
- `_layout.tsx` = nested layout
- `index.tsx` = default route for that segment

---

**Quick Tip:** Think of your file structure as your URL structure! 🎯
