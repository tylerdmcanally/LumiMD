# Medication Safety System Documentation

## Overview

The LumiMD medication safety system provides automatic detection and patient warnings for:

1. **Duplicate Therapy** - When a new medication duplicates an existing current medication
2. **Drug Interactions** - When a new medication may interact with current medications
3. **Allergy Alerts** - When a new medication is in a class the patient is allergic to

## Architecture

### Core Components

1. **Medication Safety Service** (`functions/src/services/medicationSafety.ts`)
   - Core safety checking logic
   - Medication classification database
   - Drug interaction database
   - Brand-to-generic name mapping

2. **Medication Sync Integration** (`functions/src/services/medicationSync.ts`)
   - Automatic safety checks during visit processing
   - Warnings attached to medication entries
   - Stored in Firestore for patient review

3. **Safety Check API** (`functions/src/routes/medications.ts`)
   - `POST /v1/meds/safety-check` - Manual safety checks
   - Safety warnings included in all medication API responses
   - Real-time validation before medication confirmation

4. **Mobile UI Component** (`mobile/components/MedicationWarningBanner.tsx`)
   - Patient-facing warning display
   - Severity-based color coding
   - Clear actionable recommendations

## How It Works

### 1. Automatic Safety Checks During Visit Processing

When a visit summary is processed and medications are extracted:

```typescript
// In medicationSync.ts
for (const entry of normalized.started) {
  // Run safety checks for each new medication
  const safetyWarnings = await runMedicationSafetyChecks(userId, entry);

  // Add warnings to the medication entry
  const entryWithWarnings = addSafetyWarningsToEntry(entry, safetyWarnings);

  // Store medication with warnings in database
  await upsertMedication({ userId, visitId, entry: entryWithWarnings, status: 'started', processedAt });
}
```

### 2. Safety Check Types

#### A. Duplicate Therapy Detection

Checks if the new medication:
- Is the exact same medication already being taken (high severity)
- Is in the same therapeutic class as an existing medication (moderate severity)

**Example:**
```
Patient currently taking: Metoprolol (beta-blocker)
New medication: Atenolol (beta-blocker)

Warning: "Duplicate therapy class detected"
Severity: MODERATE
Recommendation: "Confirm with your provider whether you should take both medications or if this is a substitution."
```

#### B. Drug Interaction Detection

Checks against a database of known interactions:
- Critical: Warfarin + NSAIDs (bleeding risk)
- High: ACE Inhibitor + ARB (kidney problems)
- Moderate: NSAIDs + Aspirin (stomach ulcers)

**Example:**
```
Patient currently taking: Warfarin (anticoagulant)
New medication: Ibuprofen (NSAID)

Warning: "Potential drug interaction detected"
Severity: CRITICAL
Details: "Interaction between Ibuprofen and Warfarin: Increased bleeding risk. NSAIDs can potentiate anticoagulant effects."
Recommendation: "URGENT: Contact your provider immediately before taking this medication."
```

#### C. Allergy Conflict Detection

Checks patient allergies against:
- Direct medication name matches
- Medication class matches (e.g., Penicillin allergy vs Amoxicillin)
- Cross-reactivity patterns (e.g., Penicillin vs Cephalosporin)

**Example:**
```
Patient allergy: Penicillin
New medication: Amoxicillin (penicillin antibiotic)

Warning: "ALLERGY ALERT: Class allergy conflict"
Severity: CRITICAL
Details: "You have a documented allergy to Penicillin. This new medication Amoxicillin is in the penicillin class, which may cause an allergic reaction."
Recommendation: "DO NOT TAKE. Contact your provider immediately. You may need an alternative medication."
```

### 3. Data Storage

Warnings are stored in the Firestore `medications` collection:

```typescript
{
  userId: string,
  name: string,
  dose?: string,
  frequency?: string,
  active: boolean,

  // Safety warning fields
  medicationWarning: string | null,          // Combined warning messages
  needsConfirmation: boolean,                // Requires patient acknowledgment
  medicationStatus: 'matched' | 'fuzzy' | 'unverified' | null,

  // ... other fields
}
```

## Medication Classification Database

The system includes a comprehensive medication classification database with 100+ common medications:

### Drug Classes Covered

- **Cardiovascular**: Beta-blockers, ACE Inhibitors, ARBs, Statins, Diuretics
- **Pain Relief**: NSAIDs, Acetaminophen
- **Antibiotics**: Penicillins, Cephalosporins, Sulfonamides
- **Blood Thinners**: Anticoagulants, Antiplatelets
- **Diabetes**: Metformin, Sulfonylureas, Insulin
- **GI**: Proton Pump Inhibitors, H2 Blockers
- **Mental Health**: SSRIs, Benzodiazepines
- **Thyroid**: Levothyroxine

### Brand-to-Generic Mapping

Automatically normalizes brand names to generic equivalents:
- Advil → Ibuprofen
- Tylenol → Acetaminophen
- Eliquis → Apixaban
- Plavix → Clopidogrel
- And 20+ more...

## Drug Interaction Database

Includes 10+ high-priority interaction patterns:

### Critical Interactions
- Warfarin + NSAIDs
- Anticoagulants + Antiplatelets

### High Severity
- ACE Inhibitor + ARB (dual RAAS blockade)
- Beta-blocker + Beta-blocker
- Statin + Statin

### Moderate Severity
- NSAIDs + ACE Inhibitors/ARBs
- SSRIs + NSAIDs
- Aspirin + NSAIDs

## API Usage

### Safety Check Endpoint

Manually check a medication before adding it:

```typescript
POST /v1/meds/safety-check

Request:
{
  "name": "Ibuprofen",
  "dose": "600mg",
  "frequency": "three times daily"
}

Response:
{
  "medication": {
    "name": "Ibuprofen",
    "dose": "600mg",
    "frequency": "three times daily"
  },
  "warnings": [
    {
      "type": "drug_interaction",
      "severity": "critical",
      "message": "Potential drug interaction detected",
      "details": "Interaction between Ibuprofen and Warfarin: Increased bleeding risk...",
      "conflictingMedication": "Warfarin",
      "recommendation": "URGENT: Contact your provider immediately..."
    }
  ],
  "safe": false
}
```

### Medication List with Warnings

```typescript
GET /v1/meds

Response:
[
  {
    "id": "med123",
    "name": "Ibuprofen",
    "dose": "600mg",
    "frequency": "three times daily",
    "active": true,
    "medicationWarning": "Potential drug interaction detected | Increased bleeding risk",
    "needsConfirmation": true,
    "medicationStatus": "unverified",
    ...
  }
]
```

## Mobile UI Integration

Use the `MedicationWarningBanner` component to display warnings:

```tsx
import { MedicationWarningBanner } from '../components/MedicationWarningBanner';

<MedicationWarningBanner
  warnings={medication.warnings}
  onDismiss={() => handleAcknowledge()}
/>
```

### UI Features

- **Color-coded severity levels**
  - Critical: Red (⚠️)
  - High: Yellow/Orange (⚠️)
  - Moderate: Blue (ℹ️)
  - Low: Gray (ℹ️)

- **Clear information hierarchy**
  1. Warning type and severity badge
  2. Main message
  3. Detailed explanation
  4. Conflicting medication/allergen (if applicable)
  5. Actionable recommendation

- **Patient-friendly language**
  - Avoids medical jargon
  - Clear "What to do" instructions
  - Emphasizes urgency for critical warnings

## Extending the System

### Adding New Medications

Edit `functions/src/services/medicationSafety.ts`:

```typescript
const MEDICATION_CLASSES: Record<string, string[]> = {
  // Add new medication with its classes
  'newmedication': ['class1', 'class2', 'therapeutic-category'],
  ...
};
```

### Adding New Interactions

```typescript
const DRUG_INTERACTIONS: Array<{...}> = [
  {
    drug1: 'medication-or-class-1',
    drug2: 'medication-or-class-2',
    severity: 'critical' | 'high' | 'moderate' | 'low',
    description: 'Clear description of the interaction',
  },
  ...
];
```

### Adding Brand Names

```typescript
const BRAND_TO_GENERIC: Record<string, string> = {
  'brandname': 'genericname',
  ...
};
```

## Testing the System

### Test Scenarios

1. **Duplicate Therapy**
   - Patient on Metoprolol → Add Atenolol
   - Expected: Moderate warning about duplicate beta-blocker

2. **Critical Interaction**
   - Patient on Warfarin → Add Ibuprofen
   - Expected: Critical warning about bleeding risk

3. **Allergy Alert**
   - Patient allergic to Penicillin → Add Amoxicillin
   - Expected: Critical allergy alert

4. **Cross-Reactivity**
   - Patient allergic to Penicillin → Add Cephalexin
   - Expected: High severity cross-reactivity warning

### Manual Testing

Use the safety check API endpoint:

```bash
curl -X POST https://your-api.com/v1/meds/safety-check \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Ibuprofen",
    "dose": "600mg",
    "frequency": "three times daily"
  }'
```

## Safety Considerations

### What This System Does
✅ Detects common duplicate therapy patterns
✅ Warns about well-documented drug interactions
✅ Alerts patients to potential allergy conflicts
✅ Provides actionable recommendations
✅ Requires patient acknowledgment for high-severity warnings

### What This System Does NOT Do
❌ Replace clinical decision-making
❌ Cover all possible drug interactions
❌ Guarantee medication safety
❌ Provide medical advice
❌ Account for patient-specific factors (age, weight, kidney function, etc.)

### Important Disclaimers

1. **Not a substitute for provider consultation** - Patients should always discuss medications with their healthcare provider

2. **Limited interaction database** - Only covers the most common and clinically significant interactions

3. **Class-based detection** - Some medications may be missed if not in the classification database

4. **No dosage-specific warnings** - Does not account for dose-dependent interactions or contraindications

## Future Enhancements

### Planned Features

1. **Expanded medication database**
   - Add 500+ more medications
   - Include international brand names
   - Add combination products

2. **Enhanced interaction detection**
   - Integrate with FDA drug interaction database
   - Add severity levels based on patient factors
   - Include food-drug interactions

3. **Patient-specific risk assessment**
   - Age-based warnings (geriatric, pediatric)
   - Kidney function considerations
   - Pregnancy/breastfeeding alerts

4. **Provider override capability**
   - Allow providers to acknowledge and override warnings
   - Document clinical rationale
   - Patient education materials

5. **Analytics and monitoring**
   - Track warning acknowledgment rates
   - Identify high-risk medication patterns
   - Quality improvement metrics

## Support and Troubleshooting

### Common Issues

**Issue**: Warnings not appearing for new medications

**Solution**:
- Check that medication name is in classification database
- Verify patient has active medications in Firestore
- Check CloudWatch logs for safety check errors

**Issue**: False positive warnings

**Solution**:
- Review medication classification accuracy
- Check for brand vs generic name mismatches
- Consider medication context (e.g., topical vs oral)

**Issue**: Warnings not displaying in mobile app

**Solution**:
- Verify API response includes `medicationWarning` field
- Check that `MedicationWarningBanner` component is properly imported
- Ensure warnings array is being passed to component

## Contact

For questions or issues with the medication safety system, contact the development team or file an issue in the repository.

---

**Last Updated**: January 2025
**Version**: 1.0.0
**Maintained by**: LumiMD Development Team
