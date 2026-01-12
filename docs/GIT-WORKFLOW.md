# LumiMD Git Workflow Guide

## Quick Start

### Starting New Work

```bash
# 1. Update your local main
git checkout main
git pull origin main

# 2. Create a feature branch
git checkout -b feature/your-feature-name

# 3. Make changes, commit, push
git add .
git commit -m "feat: your description"
git push -u origin feature/your-feature-name

# 4. Create PR on GitHub, test preview URL, then merge
```

### Branch Types

| Prefix | Use | Example |
|--------|-----|---------|
| `feature/` | New features | `feature/encrypted-storage` |
| `fix/` | Bug fixes | `fix/login-error` |
| `security/` | Security updates | `security/upgrade-deps` |
| `docs/` | Documentation | `docs/api-guide` |

## Deployment

| Component | How |
|-----------|-----|
| **Web Portal** | Merges to `main` auto-deploy via Vercel |
| **Mobile** | Manual: `eas build` → TestFlight |
| **Functions** | Manual: `firebase deploy --only functions` |

## Preview URLs

Every PR gets a Vercel preview URL automatically. Use it to test before merging!

## Setting Up Branch Protection

Go to GitHub → Settings → Branches → Add rule:
- Branch pattern: `main`
- ✅ Require pull request before merging
- Save

---

See [CONTRIBUTING.md](./CONTRIBUTING.md) for full details.
