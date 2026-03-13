# Key Exposure Remediation Plan (2026-02-07)

## Scope

This plan covers potential credential exposure after temporarily making the repository public.

## Confirmed Exposure Summary

1. Confirmed leaked secret in git history:
   - `RESEND_API_KEY` value was committed in historical commit `ce04d1b`.
   - It was replaced with a placeholder in `fcd02bc`, but remains recoverable from history.
2. Public client key currently tracked:
   - Firebase iOS API key is present in `mobile/GoogleService-Info.plist`.
   - Firebase API keys are not server secrets, but should still be restricted and monitored.
3. No confirmed live AssemblyAI/OpenAI secrets in tracked files or history:
   - Only placeholder/example values were found.

## Immediate Actions (same day)

1. Rotate Resend key:
   - Revoke the exposed Resend API key in Resend dashboard.
   - Create a new key with least privilege.
   - Update runtime secret store (Vercel/Firebase/CI) and redeploy affected services.
2. Audit provider logs:
   - Check Resend usage logs for unknown sends.
   - Alert on unusual volume, unknown recipients, or unknown source IPs.
3. Restrict Firebase API keys:
   - Apply API restrictions to only required Firebase/Google APIs.
   - Apply application restrictions (iOS bundle ID and web referrers as applicable).

## Short-Term Actions (1-3 days)

1. Remove key-shaped placeholders from docs/examples:
   - Completed in this repository update.
2. Confirm secret inventory:
   - Ensure real secrets exist only in secret managers, not `.env.example` or docs.
3. Enable automated secret scanning:
   - Turn on GitHub secret scanning + push protection (if not already enabled).
   - Add a pre-commit or CI scanner (for example, gitleaks) to block future leaks.

## History Cleanup Decision

If you want public-alert cleanup and defense in depth, rewrite git history to purge the leaked Resend key and force-push:

1. Create a backup clone.
2. Rewrite history with a tool like `git filter-repo` using replace-text rules.
3. Force-push rewritten branches and tags.
4. Ask collaborators to re-clone.

Note: Rotation is mandatory. History rewrite is optional but recommended for public repositories.

## Validation Checklist

1. `git grep` finds no live secrets in current HEAD.
2. Resend old key is revoked and new key is active.
3. Runtime deployments use new secret values.
4. Firebase API key restrictions are enabled and tested.
5. Secret scanning is enabled and passing on PRs.
