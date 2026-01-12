# Contributing to LumiMD

This document outlines our Git workflow and contribution guidelines.

## Branch Strategy: GitHub Flow

We use **GitHub Flow** - a simple, branch-based workflow that supports continuous deployment.

```
main (protected - production ready)
  ├── feature/xyz     (new features)
  ├── fix/abc         (bug fixes)
  ├── security/xyz    (security updates)
  └── hotfix/critical (emergency only)
```

## Branch Naming Convention

| Prefix | Use Case | Example |
|--------|----------|---------|
| `feature/` | New features or enhancements | `feature/encrypted-storage` |
| `fix/` | Bug fixes | `fix/medication-reminder` |
| `security/` | Security patches | `security/upgrade-nextjs` |
| `hotfix/` | Critical production fixes | `hotfix/auth-bypass` |
| `docs/` | Documentation only | `docs/api-reference` |

## Development Workflow

### 1. Create a Feature Branch

```bash
# Always start from latest main
git checkout main
git pull origin main

# Create your branch
git checkout -b feature/your-feature-name
```

### 2. Make Your Changes

```bash
# Work on your changes
git add .
git commit -m "feat: description of changes"
```

**Commit Message Format:**
- `feat:` - New feature
- `fix:` - Bug fix
- `security:` - Security fix (triggers extra review)
- `docs:` - Documentation only
- `refactor:` - Code refactoring
- `test:` - Adding tests
- `chore:` - Maintenance tasks

### 3. Push and Create Pull Request

```bash
git push -u origin feature/your-feature-name
```

Then on GitHub:
1. Click "Create Pull Request"
2. Add description of changes
3. Wait for Vercel preview deployment
4. Test on preview URL
5. Request review (if team)

### 4. Review and Merge

- ✅ Verify Vercel preview works correctly
- ✅ Check for any test failures
- ✅ Merge via "Squash and Merge" for clean history
- ✅ Delete the feature branch after merge

---

## Deployment Workflow

### Web Portal (Vercel)

| Branch | Deployment |
|--------|------------|
| `main` | Production (portal.lumimd.app) |
| Feature branches | Preview URL (auto-generated) |

**Preview URLs** are automatically created for each PR. Use these to test changes before merging.

### Mobile App (Expo/EAS)

Mobile deployments are **manual** and independent of Git branches:

```bash
# Development build
eas build --platform ios --profile development

# Production build
eas build --platform ios --profile production

# Submit to TestFlight
eas submit --platform ios
```

### Firebase Functions

Functions are deployed **manually** after merging to main:

```bash
cd functions
npm run build
firebase deploy --only functions
```

---

## Branch Protection Rules (GitHub Settings)

To enable branch protection on `main`:

1. Go to **Settings → Branches → Add rule**
2. Branch name pattern: `main`
3. Enable:
   - ✅ Require a pull request before merging
   - ✅ Require status checks to pass (when CI is added)
   - ✅ Do not allow bypassing the above settings
4. Click "Create"

---

## Security Considerations

### For Security-Related Changes

1. Use `security/` branch prefix
2. Add `[SECURITY]` to PR title
3. Do NOT include vulnerability details in public commits
4. Test thoroughly on preview before merge

### Secrets

- Never commit secrets to Git
- Use `.env` files (gitignored)
- Use Firebase secrets for production: `firebase functions:secrets:set KEY`

---

## Quick Reference

```bash
# Start new feature
git checkout main && git pull
git checkout -b feature/my-feature

# Save work
git add . && git commit -m "feat: description"

# Push for PR
git push -u origin feature/my-feature

# After PR merged, clean up
git checkout main && git pull
git branch -d feature/my-feature
```
