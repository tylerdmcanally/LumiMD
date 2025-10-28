# LumiMD iOS App - Development Plan

## Design Philosophy: "One Touch and Done"

Target: Older adults (65+) with health conditions who may not be tech-savvy

### Core Principles (Research-Based)

1. **Extreme Simplicity** - Every feature accessible in ≤2 taps from home
2. **Large Touch Targets** - Minimum 60x60pt (88x88px), exceeding Apple's 44pt guideline
3. **High Contrast** - WCAG AAA compliance (7:1 ratio minimum)
4. **No Hidden Menus** - All navigation visible at all times
5. **Text Labels Always** - Never icons alone
6. **Voice-First Where Possible** - Leverage iOS voice tech for accessibility
7. **Clear Exit Paths** - Always visible back/home buttons
8. **Zero Jargon** - Plain language, supportive tone (never condescending)

---

## Key Design Insights from Research

### Healthcare App Best Practices (2025)
- **AI & Voice Integration**: Voice tech makes apps significantly easier for older adults (8.4B voice devices by 2024)
- **Dynamic Accessibility**: Adjustable font sizes, high-contrast modes, multiple input methods
- **Supportive Instructions**: Short, direct, jargon-free text
- **Cultural Awareness**: Age-appropriate design without being condescending

### Elderly User Design Guidelines
- **Button Size**: 60x60pt minimum (44pt is too small for older adults)
- **Spacing**: Minimum 12pt between interactive elements to prevent mis-taps
- **Navigation**: Linear, hierarchical, max 2 levels deep
- **Gestures**: Single tap preferred over long-press, swipe, or pinch
- **Visual Clarity**: Large fonts (18pt+ body text), semi-bold weights

### Voice Recording UX
- **Apple Voice Memos Standard**: Open app → Tap red button → Recording
- **Zero Setup**: No login wall before first use
- **Immediate Feedback**: Clear visual/haptic confirmation of recording state
- **Safety Features**: Confirmation before discarding recordings

---

## App Architecture

### Tab-Based Navigation (Always Visible)

```
┌─────────────────────────────────────┐
│         Home (Dashboard)            │  ← Default screen
├─────────────────────────────────────┤
│  [🏠 Home] [📝 Visits] [👤 Profile] │  ← Tab Bar (Always visible)
└─────────────────────────────────────┘
```

**3 Main Tabs:**
1. **Home** - One-tap recording + quick actions
2. **Visits** - Visit history & summaries
3. **Profile** - Medical info & settings

**Why 3 tabs?**
- Research shows older adults struggle with >4 navigation items
- Each tab has clear, distinct purpose
- Large, text-labeled icons

---

## Screen-by-Screen Design

### 1. HOME SCREEN (Landing Page) ★ PRIORITY #1

**Purpose**: Start recording in ONE TAP

```
┌─────────────────────────────────────────┐
│  Good morning, Tyler                    │
│  Ready to record your next visit?       │
│                                         │
│  ┌───────────────────────────────────┐ │
│  │                                   │ │
│  │           [● REC]                 │ │  ← 120x120pt button
│  │        Start Recording            │ │     Red, centered
│  │                                   │ │     Tap = instant record
│  └───────────────────────────────────┘ │
│                                         │
│  UPCOMING                               │
│  ┌─────────────────────────┐          │
│  │ Lab work - Oct 15       │ [✓]      │  ← 60pt tall cards
│  │ Dr. Smith checkup       │          │     Large text
│  └─────────────────────────┘          │
│                                         │
│  QUICK ACTIONS (Optional)               │
│  [View My Medications]  [Allergies]    │  ← 52pt buttons
│                                         │
└─────────────────────────────────────────┘
```

**Key Features:**
- **Giant Record Button**: 120x120pt, can't miss it
- **Personalized Greeting**: Uses first name, time-appropriate
- **Upcoming Tasks**: 2-3 most urgent action items, large checkboxes
- **Optional Quick Actions**: Access common info (meds, allergies) in one tap
- **No clutter**: Max 5 interactive elements on screen

**User Flow:**
1. Open app → Tap red button → Recording
2. That's it. 1 tap from launch to recording.

---

### 2. RECORDING SCREEN

**Purpose**: Clear feedback that recording is active, easy to stop/pause

```
┌─────────────────────────────────────────┐
│  [< Back]                     [✓ Done]  │
│                                         │
│         ● Recording...                  │
│                                         │
│         ══════════                      │  ← Waveform animation
│                                         │     Visual feedback
│         00:05:23                        │  ← Large timer (36pt)
│                                         │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │      [II Pause]                 │   │  ← 80pt tall
│  └─────────────────────────────────┘   │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │      [■ Stop & Save]            │   │  ← 80pt tall, green
│  └─────────────────────────────────┘   │
│                                         │
│  Dr. Smith - Cardiology                 │  ← Auto-detected or
│  [Change Provider]                      │     manual select
└─────────────────────────────────────────┘
```

**Key Features:**
- **Animated Waveform**: Visual confirmation of active recording
- **Large Timer**: Easy to read (36pt font)
- **Huge Buttons**: 80pt tall, single action each
- **Provider Context**: Shows who this visit is with
- **No Ambiguity**: Clear labels (not just icons)
- **Haptic Feedback**: Vibration on start/stop/pause

**Safety:**
- Confirm before discarding recording
- Auto-save every 30 seconds to prevent data loss
- Continue recording even if app backgrounds

---

### 3. POST-RECORDING SCREEN

**Purpose**: Confirm save, show processing status

```
┌─────────────────────────────────────────┐
│  [< Back to Home]                       │
│                                         │
│         ✓ Recording Saved!              │
│                                         │
│  ┌───────────────────────────────────┐ │
│  │  Processing your visit...         │ │
│  │                                   │ │
│  │  🎤 Transcribing audio            │ │  ← Progress indicators
│  │  ✓  Uploaded to secure cloud      │ │
│  │  ⏳ Generating summary (2 min)    │ │
│  └───────────────────────────────────┘ │
│                                         │
│  You'll get a notification when your    │
│  visit summary is ready.                │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │   View My Visits                │   │  ← Navigate to visits
│  └─────────────────────────────────┘   │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │   Record Another Visit          │   │  ← Quick restart
│  └─────────────────────────────────┘   │
└─────────────────────────────────────────┘
```

**Key Features:**
- **Clear Confirmation**: "Recording Saved" with checkmark
- **Processing Transparency**: Show what's happening (transcribing, summarizing)
- **Time Estimates**: "Summary ready in 2 minutes"
- **Push Notification**: Alert when processing complete
- **Clear Next Actions**: View visits or record another

---

### 4. VISITS SCREEN (Tab 2)

**Purpose**: Browse visit history, view summaries

```
┌─────────────────────────────────────────┐
│  My Visits                    [+ New]   │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │ Dr. Smith - Cardiology          │   │  ← 88pt tall cards
│  │ Oct 10, 2025                    │   │     Tap to view details
│  │ ✓ Summary ready                 │   │
│  └─────────────────────────────────┘   │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │ Dr. Johnson - Endocrinology     │   │
│  │ Sep 28, 2025                    │   │
│  │ ✓ Summary ready                 │   │
│  └─────────────────────────────────┘   │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │ Urgent Care - Emergency         │   │
│  │ Sep 15, 2025                    │   │
│  │ ⏳ Processing...                │   │
│  └─────────────────────────────────┘   │
│                                         │
│  [Load More Visits]                     │
└─────────────────────────────────────────┘
```

**Key Features:**
- **Large Cards**: 88pt tall, easy to tap
- **Clear Status**: Processing vs Ready
- **Chronological**: Most recent first
- **Simple Info**: Provider, date, status
- **Quick Add**: [+ New] button to start recording

---

### 5. VISIT DETAIL SCREEN

**Purpose**: View AI-generated summary, action items, transcript

```
┌─────────────────────────────────────────┐
│  [< Back]               [...More]       │
│                                         │
│  Dr. Smith - Cardiology                 │
│  October 10, 2025                       │
│                                         │
│  ───── SUMMARY ─────                    │
│                                         │
│  • Blood pressure slightly elevated     │  ← Large bullets (20pt)
│  • Discussed medication adjustment      │     Easy to read
│  • Scheduled follow-up lab work         │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │   🔊 Play Recording (5:23)      │   │  ← 64pt tall
│  └─────────────────────────────────┘   │
│                                         │
│  ───── ACTION ITEMS ─────               │
│                                         │
│  ☐ Schedule lab work by Oct 15          │  ← 72pt tall
│  ☐ Start new medication dosage          │     Large checkboxes
│                                         │
│  ┌─────────────────────────────────┐   │
│  │   Share with Family             │   │  ← 56pt tall
│  └─────────────────────────────────┘   │
│                                         │
│  [View Full Transcript]                 │
└─────────────────────────────────────────┘
```

**Key Features:**
- **AI Summary First**: Key points in bullet format (not paragraphs)
- **Large Text**: 20pt body text, 24pt headings
- **Actionable Items**: Clear checkboxes for to-dos
- **Audio Playback**: Listen to original recording
- **Share Function**: Send to trusted family members
- **Transcript Available**: Full text if needed (but summary is primary)

---

### 6. PROFILE SCREEN (Tab 3)

**Purpose**: Manage medical info, settings, help

```
┌─────────────────────────────────────────┐
│  Tyler McAnally                         │
│  tyler@example.com                      │
│                                         │
│  ───── MY HEALTH INFO ─────             │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │  💊 My Medications          >   │   │  ← 68pt tall sections
│  └─────────────────────────────────┘   │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │  🏥 My Conditions           >   │   │
│  └─────────────────────────────────┘   │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │  ⚠️  My Allergies            >   │   │
│  └─────────────────────────────────┘   │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │  👨‍⚕️ My Providers           >   │   │
│  └─────────────────────────────────┘   │
│                                         │
│  ───── FAMILY ACCESS ─────              │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │  👥 Shared with Family      >   │   │
│  └─────────────────────────────────┘   │
│                                         │
│  ───── SETTINGS ─────                   │
│                                         │
│  [Text Size] [Help & Support] [Logout] │
└─────────────────────────────────────────┘
```

**Key Features:**
- **Grouped Sections**: Clear visual hierarchy
- **Large Icons + Text**: Never icons alone
- **68pt Tall**: Easy to tap, plenty of spacing
- **Chevrons (>)**: Universal "tap to see more" indicator
- **Quick Access**: Most common info at top
- **Settings Last**: Less frequently used items at bottom

---

## Technical Architecture

### Tech Stack

**Frontend (iOS)**
- **SwiftUI** - Modern, declarative UI (iOS 15+)
- **Combine** - Reactive data flow
- **AVFoundation** - Audio recording
- **CoreData** - Local data persistence
- **URLSession** - API communication

**Why SwiftUI?**
- Native performance
- Accessibility built-in
- Easy to maintain
- Great for rapid development

### Key Features to Implement

#### Phase 1: MVP (Week 1-2)
1. ✅ Authentication (login/register)
2. ✅ One-tap recording flow
3. ✅ Audio upload to backend
4. ✅ Visit list with summaries
5. ✅ Basic profile view

#### Phase 2: Core Features (Week 3)
1. ✅ Medications list (view/add/edit)
2. ✅ Conditions list
3. ✅ Allergies list
4. ✅ Action items with checkboxes
5. ✅ Push notifications for summaries

#### Phase 3: Sharing (Week 4)
1. ✅ Trusted access invitations
2. ✅ Share visits with family
3. ✅ View shared visits from others

#### Phase 4: Polish (Week 5)
1. ✅ Accessibility testing
2. ✅ Dark mode
3. ✅ Haptic feedback
4. ✅ Error handling UX
5. ✅ Onboarding tutorial

---

## Accessibility Features (WCAG AAA)

### Visual
- **Font Scaling**: Support Dynamic Type (up to 200%)
- **High Contrast Mode**: 7:1 minimum contrast ratio
- **Color Blind Safe**: Don't rely on color alone for meaning
- **Large Targets**: 60x60pt minimum

### Audio
- **VoiceOver**: Full support for screen reader
- **Voice Control**: Navigate entire app by voice
- **Haptic Feedback**: Vibration for all major actions

### Motor
- **No Complex Gestures**: Avoid swipe, pinch, long-press
- **No Time Limits**: Never auto-dismiss important info
- **Undo Available**: Easy to reverse accidental taps

### Cognitive
- **Simple Language**: 8th grade reading level max
- **Consistent Layout**: Same patterns throughout
- **Clear Labels**: Describe exactly what happens when tapped
- **Progress Indicators**: Always show what's happening

---

## Design System

### Colors

**Primary Palette (Healthcare-Friendly)**
```
Primary Blue:   #0066CC (Trustworthy, medical)
Success Green:  #00AA44 (Positive, confirmation)
Warning Orange: #FF8800 (Attention, non-critical)
Error Red:      #DD0000 (Critical, stop)
Record Red:     #FF3B30 (Apple's red, familiar)
```

**Neutral Palette**
```
Background:     #FFFFFF (White)
Surface:        #F5F5F5 (Light gray cards)
Text Primary:   #000000 (Black, max contrast)
Text Secondary: #666666 (Dark gray)
Border:         #DDDDDD (Subtle dividers)
```

**Dark Mode**
```
Background:     #000000
Surface:        #1C1C1E
Text Primary:   #FFFFFF
Text Secondary: #EBEBF5
```

### Typography

**San Francisco (Apple System Font)**
```
Heading 1:    34pt, Bold     (Screen titles)
Heading 2:    24pt, Semibold (Section headers)
Body:         20pt, Regular  (Main content)
Caption:      16pt, Regular  (Metadata)
Button:       18pt, Semibold (All buttons)
```

**Accessibility:**
- Support Dynamic Type
- Never go below 16pt
- Line height 1.4x for readability

### Spacing

**8pt Grid System**
```
XXS: 4pt   (Minimal spacing)
XS:  8pt   (Tight spacing)
S:   12pt  (Standard spacing between elements)
M:   16pt  (Section spacing)
L:   24pt  (Large section spacing)
XL:  32pt  (Major sections)
XXL: 48pt  (Screen padding)
```

### Components

**Button Sizes**
```
Primary Action:   120x120pt (Record button)
Large:            80pt tall  (Full width)
Medium:           64pt tall  (Full width)
Standard:         56pt tall  (Full width)
Small:            48pt tall  (Inline)
```

**Card Heights**
```
Visit Card:       88pt tall
Action Item:      72pt tall
Profile Section:  68pt tall
Small Card:       60pt tall
```

---

## User Flows

### Critical Path: Record a Visit (ONE TAP)

```
1. User opens app
   ↓
2. Home screen shows [● REC] button
   ↓
3. User taps button (ONE TAP!)
   ↓
4. Recording starts immediately
   - Haptic feedback (vibration)
   - Visual: Animated waveform + timer
   - Audio: Optional start beep
   ↓
5. User talks during appointment
   ↓
6. User taps [■ Stop & Save]
   ↓
7. Confirmation screen
   - "Recording Saved!"
   - Upload starts automatically
   - AI processing begins
   ↓
8. User gets notification when ready (2-5 min)
   ↓
9. User taps notification → View summary
```

**Success Metrics:**
- Time from launch to recording: <3 seconds
- Taps required: 1 (just the record button)
- User comprehension: 100% understand what to do

---

## Next Steps

### Immediate (Do First)
1. ✅ Set up Xcode project
2. ✅ Create basic SwiftUI app structure
3. ✅ Design & implement Home screen (Record button)
4. ✅ Implement audio recording (AVFoundation)
5. ✅ Connect to backend API (authentication)

### Phase 1 Goals (1-2 weeks)
- Working one-tap recording
- Audio upload to S3
- View visit summaries from API
- Basic navigation (3 tabs)

### Testing with Target Users
- Recruit 3-5 adults (65+) for testing
- Watch them use the app (don't help!)
- Iterate based on confusion points
- Measure: Can they start a recording in <10 seconds?

---

## Design References

### Inspiration (Good Healthcare Apps)
1. **Apple Health** - Clean, accessible, familiar to iOS users
2. **GrandPad** - Designed specifically for seniors
3. **Oscar Senior** - Large fonts, high contrast
4. **Apple Voice Memos** - One-tap recording model
5. **MyChart** - Clear medical info presentation

### Anti-Patterns (Avoid These)
❌ Small text (<16pt)
❌ Low contrast colors
❌ Hidden navigation (hamburger menus)
❌ Icons without labels
❌ Complex gestures (swipe, long-press)
❌ Medical jargon
❌ Too many options on one screen
❌ Timed popups or auto-dismiss
❌ Nested menus (>2 levels deep)

---

## Success Criteria

**Before Launch:**
- [ ] 5 senior users can record a visit without help
- [ ] All buttons meet 60x60pt minimum size
- [ ] VoiceOver navigation works perfectly
- [ ] App passes WCAG AAA accessibility audit
- [ ] Recording starts in <3 seconds from launch
- [ ] No crashes in 100 test recordings
- [ ] Dark mode looks great
- [ ] App works offline (graceful degradation)

**Metrics to Track:**
- Time to first recording (target: <30 seconds from install)
- Recording success rate (target: >95%)
- Daily active usage (target: 2+ visits/week)
- User age distribution (target: 40%+ are 65+)
- Support requests (target: <1 per 100 users)

---

## Summary

This is a **functionality-first** app with **design excellence** as a close second. Every decision prioritizes:

1. **Simplicity** - Can an 80-year-old use it?
2. **Speed** - One tap to record
3. **Clarity** - Zero ambiguity about what to do
4. **Accessibility** - Works for everyone
5. **Trust** - Medical-grade design language

The goal: Make recording doctor visits as easy as taking a photo with an iPhone camera app.

**Core Philosophy: "If my grandmother can't use it, it's not ready."**
