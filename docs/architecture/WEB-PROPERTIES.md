# LumiMD Web Properties Structure

> How the marketing site, web portal, and legal pages are organized and deployed.

**Last Updated:** January 9, 2026

---

## Overview

LumiMD has **two separate web deployments**:

| Property | URL | Source | Purpose |
|----------|-----|--------|---------|
| **Marketing Site** | `lumimd.app` (root) | `marketing-site/` | Public-facing landing page, features, pricing |
| **Web Portal** | `lumimd.app/*` (routes) | `web-portal/` | User dashboard, visits, settings, legal pages |

Both are deployed to Vercel from the same domain but are **separate projects**.

---

## Directory Structure

```
├── marketing-site/          # Vite static site
│   ├── index.html           # Homepage (lumimd.app)
│   ├── get-started.html     # Get started page
│   ├── public/              # Static assets (images, favicon)
│   └── vercel.json          # Vercel config
│
├── web-portal/              # Next.js App Router
│   ├── app/
│   │   ├── (protected)/     # Authenticated routes (dashboard, visits)
│   │   ├── privacy/         # Privacy Policy page
│   │   ├── terms/           # Terms of Service page
│   │   ├── sign-in/         # Login page
│   │   ├── sign-up/         # Registration page
│   │   ├── shared/          # Caregiver view (read-only)
│   │   └── api/             # API routes (email, auth)
│   └── components/          # React components
```

---

## URL Routing

### Marketing Site (`marketing-site/`)
| URL | File | Notes |
|-----|------|-------|
| `lumimd.app/` | `index.html` | Main landing page |
| `lumimd.app/get-started` | `get-started.html` | Onboarding/download |

### Web Portal (`web-portal/`)
| URL | Source | Notes |
|-----|--------|-------|
| `lumimd.app/privacy` | `app/privacy/page.tsx` | **Privacy Policy** |
| `lumimd.app/terms` | `app/terms/page.tsx` | **Terms of Service** |
| `lumimd.app/sign-in` | `app/sign-in/page.tsx` | Login |
| `lumimd.app/sign-up` | `app/sign-up/page.tsx` | Registration |
| `lumimd.app/dashboard` | `app/(protected)/dashboard/page.tsx` | User dashboard |
| `lumimd.app/visits` | `app/(protected)/visits/page.tsx` | Visit list |
| `lumimd.app/visits/[id]` | `app/(protected)/visits/[id]/page.tsx` | Visit detail |
| `lumimd.app/medications` | `app/(protected)/medications/page.tsx` | Medication list |
| `lumimd.app/shared` | `app/shared/page.tsx` | Caregiver read-only view |

---

## Legal Pages

### Privacy Policy
- **Live URL:** `lumimd.app/privacy`
- **Source:** `web-portal/app/privacy/page.tsx`
- **Markdown Copy:** `PRIVACY_POLICY.md` (repo root - for reference, not served)

### Terms of Service
- **Live URL:** `lumimd.app/terms`
- **Source:** `web-portal/app/terms/page.tsx`
- **Markdown Copy:** `TERMS_OF_SERVICE.md` (repo root - for reference, not served)

> **Important:** The `.md` files in the repo root are for reference/version control.
> The **actual live pages** are the TSX files in `web-portal/app/`. 
> When updating legal content, you must update **both** files.

---

## Deployment

### Marketing Site
- **Platform:** Vercel
- **Project:** `lumimd-marketing` (or similar)
- **Auto-deploy:** On push to `main`, changes in `marketing-site/`

### Web Portal
- **Platform:** Vercel
- **Project:** `lumimd-portal` (or similar)  
- **Auto-deploy:** On push to `main`, changes in `web-portal/`

---

## Important Notes

1. **Privacy/Terms are in web-portal**, not marketing-site
   - The marketing site footer links to `lumimd.app/privacy` which is served by web-portal

2. **Two sources of truth for legal docs**
   - `PRIVACY_POLICY.md` - Markdown version for reference
   - `web-portal/app/privacy/page.tsx` - Actual live page
   - Keep both in sync!

3. **Beta Notice Location**
   - Added to both files with `TODO: REMOVE THIS BETA SECTION BEFORE PUBLIC LAUNCH` comments

4. **App Store Links**
   - App Store Connect privacy URL should point to `https://lumimd.app/privacy`
   - Terms URL should point to `https://lumimd.app/terms`
