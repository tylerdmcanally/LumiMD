# LumiMD Workspace

This repository contains the LumiMD mobile app, Firebase backend, and supporting documentation for the visit recording and AI summarization workflow.

## Project Structure

- `mobile/` – Expo React Native app (recording flow, dashboards, read-only action items/meds)
- `functions/` – Firebase Functions (Express API, async processing triggers, AI services)
- `web-portal/` – Next.js shell for the forthcoming management console
- `firebase-setup/` – Security rules and TTL configuration
- `docs/` – Documentation hub (guides, active references, current status reports)
- `START-APP.sh` – Convenience script for launching the dev environment

## Documentation Hub

Key documents are grouped inside `docs/`:

- `docs/README.md` – Documentation index and quick links
- `docs/EXTERNAL-DEV-OVERVIEW.md` – Onboarding guide for outside reviewers
- `docs/guides/` – Setup and onboarding guides (Quick Start, Firebase, mobile, app store)
- `docs/architecture/` – Active system design docs
- `docs/reference/` – Schema, implementation summaries, testing results
- `docs/reports/` – Current operational reports
- `docs/archive/` – Historical snapshots and superseded plans

Refer to `docs/reports/SYSTEM-HEALTH-REPORT.md` for the latest system status.

## Installing Dependencies

Because the repo mixes Expo (React Native) and Next.js (React 19), install from the workspace root with legacy peer resolution:

```bash
cd /path/to/LumiMD/Codebase
npm install --legacy-peer-deps
```

This keeps Expo on the SDK 54 toolchain while allowing the web app to use React 19 in its own workspace.

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
- Update `docs/reports/SYSTEM-HEALTH-REPORT.md` as milestones land

Questions or new cleanup requests? Drop them in the backlog and we’ll keep iterating. 
