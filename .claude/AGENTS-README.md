# LumiMD Claude Agents

Specialized AI agents for accelerating LumiMD development. Each agent is an expert in a specific domain of your codebase.

## 📁 Location

All agents are located in `.claude/commands/` as markdown files.

## 🚀 How to Use

Invoke an agent using slash commands:

```
/api-builder Create an endpoint for marking medications as favorites
/ui-component Generate a MedicationCard component for mobile
/security-specialist Audit the visits API for security vulnerabilities
/ux-expert Review the dashboard page for accessibility issues
/med-specialist Improve the fuzzy matching threshold logic
/test-builder Create unit tests for medication parsing
```

## 🤖 Available Agents

### 1. **API Endpoint Builder** (`/api-builder`)
**Purpose:** Generate type-safe Express API endpoints

**What it knows:**
- Express route patterns in `/functions/src/routes/`
- Zod validation schemas
- Firebase Auth middleware (`requireAuth`)
- Ownership verification patterns
- Timestamp serialization to ISO strings
- Structured error responses

**Example uses:**
```
/api-builder Create a PATCH endpoint to archive visits
/api-builder Add rate limiting to the retry visit endpoint
/api-builder Generate client-side API method for bulk medication update
```

**What it creates:**
- Full CRUD Express routes
- Zod validation schemas
- Auth middleware integration
- Client-side API methods

---

### 2. **UI Component Generator** (`/ui-component`)
**Purpose:** Create consistent UI components for web and mobile

**What it knows:**
- LumiMD design tokens (#0A99A4, 4pt grid, premium soft design)
- shadcn/ui patterns for web
- React Native StyleSheet patterns for mobile
- Accessibility requirements (44px touch targets, ARIA labels)
- Loading/error/empty states
- Responsive breakpoints (mobile/tablet/desktop)

**Example uses:**
```
/ui-component Create a VisitTimelineView showing visit history chronologically
/ui-component Generate a MedicationCard for mobile with expandable details
/ui-component Build a FilterChip component that matches our design system
```

**What it creates:**
- TypeScript React/React Native components
- Responsive styles with proper breakpoints
- Accessibility features
- Loading, error, and empty states

---

### 3. **Security Specialist** (`/security-specialist`)
**Purpose:** Ensure HIPAA-compliant security and prevent vulnerabilities

**What it knows:**
- PHI protection rules (no PHI in logs!)
- Firestore security rules with `isOwner` and `isViewerOf` patterns
- Storage bucket rules
- API authentication/authorization
- Caregiver sharing security model
- OWASP Top 10 vulnerabilities

**Example uses:**
```
/security-specialist Audit all API endpoints for ownership verification
/security-specialist Review Firestore rules for the new favorites collection
/security-specialist Check for PHI leakage in error messages
/security-specialist Validate webhook signature implementation
```

**What it provides:**
- Vulnerability assessments with severity ratings
- Remediation steps with code examples
- HIPAA compliance checklist
- Security rule templates

---

### 4. **UI/UX Design Expert** (`/ux-expert`)
**Purpose:** Ensure exceptional, accessible user experience

**What it knows:**
- WCAG 2.1 AA accessibility standards
- Mobile/tablet/desktop UX patterns
- Information density optimization
- Visual hierarchy principles
- Healthcare UX (reducing anxiety, building trust)
- Micro-interactions and animations

**Example uses:**
```
/ux-expert Review the visit recording flow for friction points
/ux-expert Audit the entire app for WCAG accessibility violations
/ux-expert Optimize the medication list for tablet screens
/ux-expert Improve empty states across the dashboard
```

**What it provides:**
- Accessibility audit with fixes
- Responsive design recommendations
- User flow analysis
- Visual hierarchy improvements
- Loading/error/empty state enhancements

---

### 5. **Medication Logic Specialist** (`/med-specialist`)
**Purpose:** Handle complex medication fuzzy matching and parsing

**What it knows:**
- Levenshtein distance fuzzy matching algorithm
- Combo medication splitting ("Tylenol and Ibuprofen")
- Dose/frequency extraction from natural language
- Idempotent syncing from visit summaries
- Brand vs generic name mappings
- Warning flag logic for unverified meds

**Example uses:**
```
/med-specialist Add brand-to-generic name mapping for top 100 drugs
/med-specialist Improve combo medication parsing to handle "with" vs "and"
/med-specialist Adjust fuzzy matching threshold based on medication database
/med-specialist Create validation rules for unusual dose units
```

**What it creates:**
- Fuzzy matching improvements
- Medication parsing enhancements
- Sync logic optimizations
- Test cases for edge cases

---

### 6. **Test Suite Builder** (`/test-builder`)
**Purpose:** Generate comprehensive tests (you currently have none!)

**What it knows:**
- Jest/Vitest configuration for TypeScript
- React Testing Library patterns
- Firebase emulator testing
- API integration testing with supertest
- Test fixtures and mocking strategies
- Coverage reporting

**Example uses:**
```
/test-builder Create unit tests for the entire medication fuzzy matching module
/test-builder Generate integration tests for the visits API CRUD operations
/test-builder Build React component tests for VisitTable with all states
/test-builder Create test fixtures for realistic visit data
```

**What it creates:**
- Unit tests for business logic
- Integration tests for API endpoints
- Component tests for React UI
- Test fixtures with realistic data
- Firebase mocking helpers

---

## 🎯 Agent Combinations

Some tasks benefit from multiple agents working together:

### Example: Add New Feature
```
1. /api-builder Create API endpoint for feature
2. /security-specialist Audit the new endpoint
3. /ui-component Generate UI components
4. /ux-expert Review the UX flow
5. /test-builder Create comprehensive tests
```

### Example: Improve Existing Feature
```
1. /ux-expert Audit the medication list page
2. /ui-component Implement recommended improvements
3. /med-specialist Optimize the underlying logic
4. /test-builder Add missing test coverage
```

## 💡 Best Practices

### 1. **Be Specific**
❌ "Improve the visits page"
✅ "Review the visits page for accessibility violations and suggest specific fixes for color contrast and keyboard navigation"

### 2. **Provide Context**
Include relevant file paths, error messages, or screenshots when available

### 3. **One Agent at a Time**
Let each agent complete its task before invoking the next

### 4. **Review Agent Output**
Agents are experts but not infallible - review their recommendations

## 📊 Coverage Matrix

| Domain | Agent | Command | Status |
|--------|-------|---------|--------|
| Backend API | API Endpoint Builder | `/api-builder` | ✅ Created |
| UI Components | UI Component Generator | `/ui-component` | ✅ Created |
| Security | Security Specialist | `/security-specialist` | ✅ Created |
| UX/Accessibility | UI/UX Design Expert | `/ux-expert` | ✅ Created |
| Medications | Medication Logic Specialist | `/med-specialist` | ✅ Created |
| Testing | Test Suite Builder | `/test-builder` | ✅ Created |
| Firebase Rules | Firebase Security Rules Manager | `/firebase-rules` | ✅ Created |
| AI Prompts | AI Prompt Engineer | `/prompt-engineer` | ✅ Created |
| Data Migration | Data Migration Specialist | `/data-migration` | ✅ Created |
| State Management | State Management Architect | `/state-manager` | ✅ Created |
| Error Handling | Error Handling Enhancer | `/error-handler` | ✅ Created |
| Workflow Debugging | Visit Workflow Debugger | `/workflow-debugger` | ✅ Created |

## 🔧 Customizing Agents

Each agent is a markdown file in `.claude/commands/`. You can:
1. Edit existing agents to refine their knowledge
2. Add project-specific examples
3. Update design tokens or patterns
4. Create new agents for your specific needs

## 📝 Creating New Agents

To create a new agent:

1. Create a new markdown file in `.claude/commands/`
2. Name it with a descriptive slug (e.g., `my-agent.md`)
3. Write a clear prompt describing the agent's expertise
4. Include code examples and patterns
5. Invoke with `/my-agent <task description>`

## 🆘 Getting Help

If an agent isn't performing well:
1. Check if you provided enough context
2. Review the agent's markdown file for scope
3. Try breaking down the task into smaller pieces
4. Edit the agent's prompt to include more examples

## 🎓 Learning from Agents

Agents are not just tools - they're also documentation!
- Read their markdown files to learn LumiMD patterns
- Review their code examples for best practices
- Use them as onboarding material for new developers

---

**Last Updated:** January 2025
**Agent Count:** 6 active, 6 planned
**Coverage:** API, UI, Security, UX, Medications, Testing
