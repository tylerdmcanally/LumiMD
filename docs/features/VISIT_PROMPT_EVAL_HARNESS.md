# Visit Prompt Eval Harness

## Purpose
Provide a repeatable scoring path for visit extraction quality over a gold fixture set.

## Included Assets
- Gold fixture sample: `scripts/fixtures/visit-extraction-gold.sample.json`
- Scoring script: `scripts/eval-visit-extraction.js`

## Required Input
A predictions JSON file containing one entry per case id with extracted output. Supported shape:

```json
{
  "cases": [
    {
      "id": "case_id",
      "predicted": {
        "diagnoses": [],
        "medications": {
          "started": [],
          "stopped": [],
          "changed": []
        },
        "followUps": []
      }
    }
  ]
}
```

The script also accepts an array of case objects at top-level.

## Run
```bash
node scripts/eval-visit-extraction.js <predictions.json> [gold.json]
```

Examples:
```bash
node scripts/eval-visit-extraction.js scripts/fixtures/visit-extraction-gold.sample.json
node scripts/eval-visit-extraction.js /tmp/predictions.json scripts/fixtures/visit-extraction-gold.sample.json
```

## Metrics Reported
- Per-field precision, recall, F1 for:
  - diagnoses
  - medications.started
  - medications.stopped
  - medications.changed
  - followUps
- Micro average precision/recall/F1 across all tracked fields
- Per-case micro F1

## Notes
- Matching is normalized (lowercase, punctuation stripped).
- Follow-up comparison uses `followUps[].task` when present, otherwise falls back to `nextSteps[]`.
- Medication comparison uses name-only matching for started/stopped/changed buckets.
