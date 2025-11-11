# LumiMD Workspace

This repository contains the LumiMD mobile app, Firebase backend, and supporting documentation for the visit recording and AI summarization workflow.

## Project Structure

- `mobile/` – Expo React Native app (recording flow, dashboards, read-only action items/meds)
- `functions/` – Firebase Functions (Express API, async processing triggers, AI services)
- `web-portal/` – Next.js shell for the forthcoming management console
- `firebase-setup/` – Security rules and TTL configuration
- `docs/` – Documentation hub (guides, status reports, roadmaps, playbooks, references)
- `START-APP.sh` – Convenience script for launching the dev environment

## Documentation Hub

Key documents are grouped inside `docs/`:

- `docs/guides/` – Setup and onboarding guides (Quick Start, Firebase, mobile, app store)
- `docs/status/` – Current project health reports and executive summaries
- `docs/roadmaps/` – Resilience and robustness plans
- `docs/playbooks/` – Daily checklists and rapid response workflows
- `docs/reference/` – Architecture diagrams, implementation summaries, testing logs

Refer to `docs/status/PROJECT-STATUS.md` for the latest end-to-end status update.

## Common Commands

```bash
# Mobile app
cd mobile
npm install
npm run ios          # Launch iOS simulator via Expo

# Backend
cd functions
npm install
npm run build
firebase deploy --only functions

# Firebase project selection
firebase use lumimd-dev
```

## Housekeeping

- Keep environment variables in the respective `.env` files (`mobile/.env`, `web-portal/.env.local`)
- Avoid committing build artifacts or local tool installations (e.g., Google Cloud SDK)
- Update `docs/status/PROJECT-STATUS.md` as milestones land

Questions or new cleanup requests? Drop them in the backlog and we’ll keep iterating. 

