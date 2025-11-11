# Firestore TTL (Time To Live) Setup

## What is TTL?
Firestore TTL automatically deletes documents after a specified timestamp. This is perfect for cleaning up temporary data like auth handoff codes without writing any cleanup code.

## Setup Instructions (One-Time)

### Step 1: Enable TTL for `auth_handoffs` collection

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select your project (do this for both **dev** and **prod**)
3. Navigate to **Firestore Database** in the left sidebar
4. Click the **Settings** tab (gear icon at top)
5. Scroll down to **Time-to-live (TTL)**
6. Click **Create TTL policy** or **+ Add TTL policy**
7. Fill in:
   - **Collection group ID:** `auth_handoffs`
   - **Timestamp field:** `expiresAt`
   - **Status:** Enabled
8. Click **Create** or **Save**

### Step 2: Verify it's working

After deployment, test the flow:

```bash
# Watch Firestore in real-time
# Create a handoff code from mobile
# Wait 5+ minutes
# Refresh Firestore console - the document should be auto-deleted
```

## How It Works

Our backend code creates documents like this:

```javascript
{
  userId: "abc123",
  code: "xyz789",
  createdAt: Timestamp(now),
  expiresAt: Timestamp(now + 5 minutes), // <-- TTL uses this
  used: false
}
```

Firestore's TTL service:
- Runs in the background
- Checks `expiresAt` timestamps
- Deletes documents shortly after expiration (usually within 72 hours, but often much faster)
- Requires no Cloud Function or manual cleanup

## Important Notes

1. **Deletion is eventual** - May take up to 72 hours (but usually minutes)
2. **No cost** - TTL deletions are free (don't count toward your delete quota)
3. **Per-project** - Set this up in both dev and prod environments
4. **Safe** - Won't delete documents without the `expiresAt` field

## Troubleshooting

**Problem:** Documents aren't being deleted

**Solution:**
- Verify TTL policy is **Enabled** in console
- Check field name is exactly `expiresAt` (case-sensitive)
- Ensure `expiresAt` is a Firestore Timestamp, not a number
- Wait 24-72 hours for first cleanup cycle

**Problem:** Need faster cleanup for testing

**Alternative:** Add a scheduled Cloud Function (runs every 5 minutes):

```typescript
// functions/src/jobs/cleanup-handoffs.ts
export const cleanupExpiredHandoffs = functions.pubsub
  .schedule('every 5 minutes')
  .onRun(async () => {
    const now = admin.firestore.Timestamp.now();
    const expired = await db
      .collection('auth_handoffs')
      .where('expiresAt', '<', now)
      .limit(500)
      .get();
    
    const batch = db.batch();
    expired.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
    
    console.log(`Cleaned up ${expired.size} expired handoffs`);
  });
```

But for MVP, **just use TTL** - it's simpler!


