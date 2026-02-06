# LumiMD Strategic Roadmap

**Created:** January 2026  
**Context:** OpenAI (ChatGPT Health) and Anthropic (Claude for Healthcare) launched at JPM26

---

## Core Thesis

> **"The simplest patient experience. The most powerful caregiver dashboard."**

LumiMD targets a demographic that OpenAI/Anthropic ignore: **elderly patients and their adult children caregivers**. These users don't want to "chat with AI" — they want to press a button and have their healthcare managed.

---

## Target Personas

### 👴 **The Patient** (Primary User - Mobile)
- Age 60-85
- Limited tech comfort
- Visits 3-6 doctors per year
- Goal: "I just want to remember what the doctor said"

**Their Experience:**
```
Open app → Press red button → Doctor talks → Summary appears → Done
```

### 👨‍👩‍👧 **The Caregiver** (Power User - Web Dashboard)
- Age 35-55
- Managing 1-2 parents' healthcare
- Often remote (different city)
- Goal: "I need to know what's happening and stay organized"

**Their Experience:**
```
Dashboard → See all visits → Track medications → Monitor vitals → Coordinate care
```

---

## Competitive Positioning

```
                    Tech Sophistication Required
                    Low ←───────────────────→ High
                    
Proactive    ┌─────────────────┐
Care         │    LumiMD       │     ┌─────────────┐
Management   │  ★ Sweet Spot   │     │  Enterprise │
    ↑        │   Elderly +     │     │   Health    │
    │        │   Caregivers    │     │   Systems   │
    │        └─────────────────┘     └─────────────┘
    │
    │            ┌────────────────────────────────┐
    │            │   ChatGPT Health / Claude HC   │
    ↓            │   (Tech-savvy self-managers)   │
Reactive Q&A    └────────────────────────────────┘
```

---

## Phase 1: Widen the Moat (Q1 2026)

### 1.1 Caregiver Dashboard V2

**Current State:** Basic shared visit viewing  
**Target State:** Full care management command center

| Feature | Purpose | Priority |
|---------|---------|----------|
| **Visit Timeline** | Chronological view of all visits with filters | 🔴 High |
| **Medication Dashboard** | All meds, schedules, refill alerts, interaction warnings | 🔴 High |
| **Vitals Dashboard** | BP, glucose, weight trends over time | 🔴 High |
| **Action Items Tracker** | Follow-ups, referrals, tests with status | 🟡 Medium |
| **Care Team Directory** | All providers with contact info, next appts | 🟡 Medium |
| **Export for Appointments** | One-click PDF summary for new doctors | 🟡 Medium |

**Mockup Concept:**
```
┌─────────────────────────────────────────────────────────────┐
│  Mom's Health Dashboard                    [Export] [Share] │
├─────────────────────────────────────────────────────────────┤
│ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐         │
│ │ 12 Visits    │ │ 8 Meds       │ │ BP Trend ↓   │         │
│ │ This Year    │ │ Active       │ │ 128/82 avg   │         │
│ └──────────────┘ └──────────────┘ └──────────────┘         │
├─────────────────────────────────────────────────────────────┤
│ Upcoming                                                    │
│ ├─ Jan 22: Cardiology follow-up (Dr. Smith)                │
│ ├─ Jan 28: Lab work (Quest)                                │
│ └─ Feb 5: Lisinopril refill due                            │
├─────────────────────────────────────────────────────────────┤
│ Recent Visits                                               │
│ ├─ Jan 10: Primary Care - Annual physical [View Summary]   │
│ ├─ Dec 15: Cardiology - Medication adjustment              │
│ └─ Nov 29: Ophthalmology - Diabetic eye exam               │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 Apple Health Integration

**Purpose:** Auto-populate vitals without manual entry

| Data Type | Use Case |
|-----------|----------|
| Blood Pressure | Trend analysis, share with caregiver |
| Blood Glucose | Diabetic monitoring, pre-visit reports |
| Weight | Trend tracking, medication effects |
| Steps | Activity correlation with health |
| Heart Rate | Resting HR trends |

**Implementation Notes:**
- Use HealthKit (iOS only initially)
- Sync in background
- Show trends on caregiver dashboard
- Generate provider reports with vitals

---

## Phase 2: Deepen Value (Q2 2026)

### 2.1 Provider Report Generator
- One-click PDF with:
  - Recent vitals (from Apple Health)
  - Current medications
  - Recent visit summaries
  - Questions to ask
- Email directly to provider office

### 2.2 Family Coordination
- Multiple caregivers per patient
- Role-based permissions (view-only vs. full access)
- Shared notes/comments on visits
- Activity log (who viewed what)

### 2.3 Appointment Prep Assistant
- "Preparing for tomorrow's cardiology visit"
- Aggregates relevant history
- Suggests questions based on recent symptoms
- Voice-enabled for low-vision users

---

## Phase 3: Expand Market (Q3-Q4 2026)

### 3.1 Pediatric Caregiver Mode
- Parents managing children's healthcare
- Growth charts, vaccine tracking
- Different UI patterns

### 3.2 Care Facility Integration
- Assisted living staff as caregivers
- Bulk resident management
- Simplified consent flows

### 3.3 FHIR/Health Record Import
- Import records from Epic MyChart, Cerner
- Reduces barrier to onboarding

---

## Why This Beats the Giants

| OpenAI/Anthropic Weakness | LumiMD Strength |
|--------------------------|-----------------|
| Requires user to ask questions | Proactive nudges and organization |
| General health Q&A | Specialized visit workflow |
| Individual-focused | Family/caregiver-centric |
| Tech-savvy audience | Designed for elderly |
| Subscription required | Freemium model |
| No visit recording | Core feature since day 1 |

---

## Immediate Next Steps

1. [ ] Design caregiver dashboard mockups
2. [ ] Research HealthKit implementation requirements
3. [ ] Define caregiver dashboard data model
4. [ ] Create Phase 1 implementation plan
5. [ ] Estimate timeline and resources

---

## Key Metrics to Track

| Metric | Current | Target (Q2) |
|--------|---------|-------------|
| Caregiver signups | ? | +50% |
| Visits per patient/month | ? | 2+ |
| Caregiver dashboard DAU | ? | 3x patient DAU |
| Apple Health connections | 0 | 30% of iOS users |
