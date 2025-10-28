# Complete User Workflow - LumiMD

## 🎯 Overview
This document describes the complete, end-to-end user workflow in LumiMD, from login to managing visits.

## ✅ FIXED Issues

### Before This Update
- ❌ No way to view individual visit details
- ❌ Clicking on visits in history did nothing
- ❌ Could record and upload, but couldn't review details later
- ❌ No way to manage providers on existing visits
- ❌ No way to delete old visits

### After This Update
- ✅ Complete visit detail screen
- ✅ Click any visit in history to view full details
- ✅ View AI summary, transcript, action items
- ✅ Change/remove provider on any visit
- ✅ Delete visits with confirmation
- ✅ Direct navigation from recorder to visit detail

## 🔄 Complete User Journey

### Flow Diagram
```
┌─────────────┐
│   LOGIN     │
│ (AuthScreen)│
└──────┬──────┘
       │
       ▼
┌──────────────────────────────────────────────────────────┐
│                    HOME SCREEN                            │
│  - Welcome message                                        │
│  - "Start New Visit" button                              │
│  - "View History" button                                 │
│  - Quick stats (visits, action items)                    │
└────┬─────────────────────────┬──────────────────────────┘
     │                          │
     │ Start Visit              │ View History
     ▼                          ▼
┌────────────────┐      ┌─────────────────┐
│ VISIT RECORDER │      │   VISIT LIST    │
│                │      │                  │
│ 1. Consent     │      │ Shows all visits│
│ 2. Record      │      │ with:           │
│ 3. Upload      │◄────┐│ - Provider      │
│ 4. Tag provider│     ││ - Date          │
└────┬───────────┘     ││ - Status        │
     │                 ││ - AI summary    │
     │ View Details    ││                 │
     └─────────────────┼┤ Click visit →  │
                       │└────┬────────────┘
                       │     │
                       │     ▼
                       │ ┌─────────────────────┐
                       │ │   VISIT DETAIL      │
                       │ │                      │
                       │ │ - Full summary       │
                       │ │ - Transcript         │
                       │ │ - Action items       │
                       │ │ - Medications        │
                       │ │ - Diagnoses          │
                       │ │                      │
                       │ │ Actions:             │
                       │ │ - Change provider    │
                       │ │ - Delete visit       │
                       └►│ - Back to list       │
                         └─────────────────────┘
```

## 📱 Screen-by-Screen Breakdown

### 1. Home Screen
**File:** `components/home/HomeScreen.tsx`

**User sees:**
- Welcome message with their name
- "Start New Visit" button (primary CTA)
- Quick stats (visits recorded, action items due)
- "View History" button

**User can:**
- Click "Start New Visit" → Goes to Visit Recorder
- Click "View History" → Goes to Visit List
- Click "Log out" → Logs out

**Navigation:**
```typescript
onStartVisit={() => setAppState({ view: 'record-visit' })}
onViewHistory={() => setAppState({ view: 'visit-list' })}
```

---

### 2. Visit Recorder Screen
**File:** `components/visits/VisitRecorder.tsx`

**Step-by-Step Flow:**

#### Step 1: Consent (Auto-detected)
- App detects user location
- Shows appropriate consent message based on state law
- User toggles: "I understand and consent to recording"
- If two-party consent state: Additional toggle for provider consent

#### Step 2: Recording
- User clicks "Start Recording"
- Timer starts
- User can:
  - Pause/Resume recording
  - Stop recording

#### Step 3: Upload
- After stopping, user clicks "Upload Recording"
- Audio uploads to S3
- Visit status: UPLOADING → PROCESSING

#### Step 4: Tag Provider (Optional)
- If no provider assigned, shows provider chips
- User can select provider or skip
- "View visit details" button appears

**User can:**
- Click "Cancel" → Goes back to Home
- Click "View visit details" → Goes directly to Visit Detail (NEW!)
- Click provider chip → Tags visit with provider

**Navigation:**
```typescript
onCancel={() => setAppState({ view: 'home' })}
onFinished={(visitId) => {
  if (visitId) {
    // Go directly to detail
    setAppState({ view: 'visit-detail', selectedVisitId: visitId })
  } else {
    // Or go to list
    setAppState({ view: 'visit-list' })
  }
}}
```

---

### 3. Visit List Screen
**File:** `components/visits/VisitList.tsx`

**User sees:**
- All their visits in reverse chronological order
- Each visit card shows:
  - Provider name (or "Healthcare visit")
  - Provider specialty
  - Visit date
  - Status badge (RECORDING, PROCESSING, COMPLETED, FAILED)
  - AI summary preview
  - Duration
  - Action item count

**User can:**
- Click any visit card → Goes to Visit Detail (NEW!)
- Pull to refresh
- Click "← Back" → Goes to Home

**Navigation:**
```typescript
onBack={() => setAppState({ view: 'home' })}
onSelectVisit={(visitId) => {
  setAppState({ view: 'visit-detail', selectedVisitId: visitId })
}}
```

---

### 4. Visit Detail Screen (NEW!)
**File:** `components/visits/VisitDetail.tsx`

**User sees:**

#### Header Section
- Visit title: "Visit Details"
- Status badge (COMPLETED, PROCESSING, etc.)
- Delete button

#### Provider Section
- Current provider info (name, specialty, practice)
- "Change" button
- "Remove" button
- Or "Add Provider" button if none assigned

#### Visit Information Section
- Date & time
- Visit type (in-person, telehealth, etc.)
- Duration

#### AI Summary Section (if available)
- Overview paragraph
- Action items (bulleted list)
- Medications mentioned
- Diagnoses

#### Full Transcript Section (if available)
- Complete transcription of visit

**User can:**
- Change provider → Opens bottom sheet picker
- Remove provider → Confirmation dialog
- Delete visit → Confirmation dialog
- Click "← Back" → Goes back to Visit List

**Bottom Sheet: Provider Picker**
When user clicks "Change" or "Add Provider":
- Shows scrollable list of all their providers
- Each provider shows name and specialty
- Click provider → Updates visit and closes sheet
- Shows loading spinner while saving

**Navigation:**
```typescript
onBack={() => setAppState({ view: 'visit-list' })}
onDeleted={() => {
  // After successful deletion
  setAppState({ view: 'visit-list' })
}}
```

---

## 🎬 Example User Scenarios

### Scenario 1: Record and Review a Visit
```
1. User logs in
2. Sees Home screen
3. Clicks "Start New Visit"
4. Sees consent screen
5. Toggles consent checkboxes
6. Clicks "Start Recording"
7. Records 10-minute conversation
8. Clicks "Stop Recording"
9. Clicks "Upload Recording"
10. Selects provider (or skips)
11. Clicks "View visit details"
12. ✨ Sees full visit detail immediately
13. Visit shows "PROCESSING" status
14. Waits 2-3 minutes
15. Pulls to refresh detail screen
16. ✨ Now sees AI summary and transcript!
```

### Scenario 2: Review Past Visits
```
1. User on Home screen
2. Clicks "View History"
3. Sees list of all past visits
4. ✨ Clicks on visit from 2 weeks ago
5. ✨ Sees complete visit detail
6. Reviews AI summary
7. Reads action items
8. Sees transcript
9. Realizes provider is wrong
10. ✨ Clicks "Change" next to provider
11. ✨ Selects correct provider from list
12. Visit updated!
```

### Scenario 3: Delete Old Visit
```
1. User on Visit List
2. Clicks on old visit
3. Reviews details
4. Decides to delete it
5. ✨ Clicks "Delete" button
6. ✨ Sees confirmation: "Are you sure?"
7. Clicks "Delete"
8. ✨ Visit deleted, returned to list
9. Visit no longer appears
```

### Scenario 4: Record Without Provider (Assign Later)
```
1. User clicks "Start New Visit"
2. Records visit
3. Uploads
4. Skips provider selection
5. Visit created without provider
6. Later, user goes to Visit List
7. ✨ Clicks the visit
8. ✨ Sees "No provider assigned"
9. ✨ Clicks "+ Add Provider"
10. ✨ Selects provider
11. Visit updated!
```

---

## 🔄 State Management

### App State Structure
```typescript
interface AppState {
  view: 'home' | 'visit-list' | 'record-visit' | 'visit-detail';
  selectedVisitId?: string;
}
```

### State Transitions
```
home
  ├─→ record-visit (onStartVisit)
  │   ├─→ home (onCancel)
  │   └─→ visit-detail (onFinished with visitId) ✨ NEW
  │
  └─→ visit-list (onViewHistory)
      ├─→ home (onBack)
      └─→ visit-detail (onSelectVisit) ✨ NEW
          ├─→ visit-list (onBack)
          └─→ visit-list (onDeleted) ✨ NEW
```

---

## 🚀 What's Now Possible

### ✅ Core Workflow Complete
1. **Record visit** - Fast, low-friction recording
2. **Upload to AI** - Automatic transcription & summarization
3. **Review anytime** - View full details of any past visit
4. **Manage visits** - Change provider, delete, organize
5. **Access history** - Always accessible from Home

### ✅ Navigation Makes Sense
- From recorder → Can go directly to visit detail
- From list → Click any visit to see details
- From detail → Can go back to list
- Always have back button to previous screen

### ✅ No Dead Ends
- Every screen has clear navigation
- Can always get back to Home
- Can always review past visits
- Can always see visit details

---

## 🎨 Visual Flow Summary

```
┌──────────────────────────────────────────────────────┐
│                       HOME                           │
│  "I need to record this doctor appointment NOW"      │
└────────────┬─────────────────────────┬───────────────┘
             │                          │
             │ Quick Action             │ Later Review
             ▼                          ▼
┌─────────────────────┐      ┌────────────────────────┐
│  RECORD & UPLOAD    │      │  "What did my doctor   │
│  "Hands-free flow"  │      │   say 2 weeks ago?"    │
│                     │      │                        │
│  ✓ Consent          │      │  → Click visit         │
│  ✓ Record           │      │  → See full details    │
│  ✓ Upload           │      │  → Read transcript     │
│  ✓ Tag (optional)   │      │  → Review action items │
└─────────┬───────────┘      └────────────────────────┘
          │
          │ Immediate Review
          ▼
┌─────────────────────────────┐
│   VISIT DETAIL             │
│   "What did the AI extract?"│
│                              │
│   ✓ Summary                 │
│   ✓ Action items            │
│   ✓ Medications             │
│   ✓ Transcript              │
│                              │
│   Can manage:               │
│   • Change provider         │
│   • Delete visit            │
└─────────────────────────────┘
```

---

## 🧪 Testing the Workflow

### Manual Test Cases

#### Test 1: Complete Happy Path
```
✓ Login
✓ Click "Start New Visit"
✓ Accept consent
✓ Start recording
✓ Record for 10 seconds
✓ Stop recording
✓ Upload recording
✓ Select provider
✓ Click "View visit details"
✓ See visit detail screen
✓ See status: PROCESSING
✓ Click "← Back"
✓ See visit in list
```

#### Test 2: View History
```
✓ From Home, click "View History"
✓ See list of visits
✓ Click on any visit
✓ See visit detail screen with full info
✓ Click "← Back"
✓ Back to visit list
```

#### Test 3: Delete Visit
```
✓ View visit detail
✓ Click "Delete"
✓ See confirmation dialog
✓ Click "Delete"
✓ Returned to visit list
✓ Visit no longer in list
```

#### Test 4: Change Provider
```
✓ View visit detail
✓ Click "Change" next to provider
✓ See provider picker sheet
✓ Select different provider
✓ Sheet closes
✓ Provider updated on screen
```

---

## 📝 Code Changes Summary

### Files Modified

1. **App.tsx**
   - Added `visit-detail` view state
   - Added `selectedVisitId` to app state
   - Wired up VisitDetail component
   - Updated navigation from recorder to support direct detail view
   - Updated VisitList to pass `onSelectVisit` callback

2. **components/visits/VisitRecorder.tsx**
   - Changed `onFinished` signature to accept optional `visitId`
   - Pass `visitId` when "View visit details" clicked

3. **components/visits/VisitDetail.tsx** (NEW)
   - Complete visit detail screen
   - Provider management UI
   - Delete functionality
   - Bottom sheet provider picker

### Navigation Props Updated

**VisitList:**
```typescript
// Before
<VisitList onBack={() => ...} />

// After
<VisitList
  onBack={() => ...}
  onSelectVisit={(visitId) => ...}  // NEW!
/>
```

**VisitRecorder:**
```typescript
// Before
<VisitRecorder
  onCancel={() => ...}
  onFinished={() => ...}
/>

// After
<VisitRecorder
  onCancel={() => ...}
  onFinished={(visitId) => ...}  // Now accepts visitId!
/>
```

**VisitDetail (NEW):**
```typescript
<VisitDetail
  visitId={string}
  onBack={() => ...}
  onDeleted={() => ...}
/>
```

---

## ✨ Summary

### What Was Broken
- No way to view past visit details
- Clicking visits in history did nothing
- Dead end after recording

### What's Fixed
- ✅ Complete visit detail screen
- ✅ Click any visit to see full details
- ✅ Direct navigation from recorder to detail
- ✅ Can manage providers on visits
- ✅ Can delete visits
- ✅ Proper back navigation everywhere

### User Experience
Before: "I recorded visits but can't review them!"
After: "I can see everything - summaries, transcripts, action items, and I can organize my visits!"

The workflow is now **complete, intuitive, and low-friction**! 🎉

---

**Last Updated**: October 15, 2025
**Status**: ✅ Complete and tested
