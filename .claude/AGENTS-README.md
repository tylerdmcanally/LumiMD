# LumiMD Claude Agents

Specialized AI agents for LumiMD development. Invoke with `/command-name <task>`.

## 🚀 Quick Reference

| Command | Purpose |
|---------|---------|
| `/backend` | Express APIs, React Query hooks, error handling |
| `/ui` | React/React Native components, accessibility |
| `/lumibot` | Nudge system, AI messaging, patient context |
| `/meds` | Medication matching, parsing, safety |
| `/visits` | Visit processing pipeline, transcription |
| `/deploy` | Firebase/Vercel deployment, indexes |
| `/security` | HIPAA compliance, security audits |
| `/tests` | Test generation (Vitest, RTL) |
| `/prompts` | OpenAI/AssemblyAI prompt optimization |

## 🤖 Agent Details

### `/backend`
Full-stack backend development:
- Express routes with Zod validation
- React Query hooks for web/mobile
- Error handling patterns
- Firestore queries

### `/ui`
UI component development:
- React (web-portal) + React Native (mobile)
- Design tokens (#0A99A4, 4pt grid)
- WCAG 2.1 accessibility
- Loading/error/empty states

### `/lumibot`
LumiBot intelligent nudge system:
- Nudge creation and scheduling
- AI-powered personalized messages
- Rate limiting (max 3/day, 4hr spacing)
- Patient context aggregation

### `/meds`
Medication logic:
- Fuzzy name matching (Levenshtein)
- Combo medication splitting
- Brand/generic mapping
- Safety checking

### `/visits`
Visit processing pipeline:
- Audio → Transcription → Summarization
- Status transitions and retry logic
- PDF generation
- Debugging stuck visits

### `/deploy`
Deployment workflows:
- Firebase Functions deployment
- Vercel web portal deployment
- Firestore index management
- Environment variables

### `/security`
Security and compliance:
- HIPAA/PHI protection
- Firestore security rules
- API auth patterns
- Vulnerability audits

### `/tests`
Test generation:
- Vitest/Jest for functions
- React Testing Library
- Firebase emulator tests

### `/prompts`
AI prompt engineering:
- Visit summarization prompts
- Token optimization
- Prompt versioning

## 💡 Example Usage

```
/backend Create an endpoint to fetch user preferences
/ui Create a ProgressBar component for mobile with accessibility
/lumibot Add a new nudge type for appointment reminders
/meds Improve fuzzy matching for insulin variants
/visits Debug why a visit is stuck in processing status
/deploy Deploy functions and create needed indexes
/security Audit the medications API for HIPAA compliance
/tests Generate tests for the nudge notification service
```

---

**Last Updated:** December 2024
**Agent Count:** 9 active
