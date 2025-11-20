# Calendar Integration Guide

## Overview

Action items with due dates can now be added to your device calendar! This feature helps you stay on top of follow-ups, appointments, and medical tasks by integrating them with your existing calendar workflow.

## How It Works

### Backend Date Parsing

When a visit is processed, the AI generates action items with natural language date references like:
- "Blood pressure check — follow up in 3 months"
- "Lab draw — within 7 days"
- "Clinic follow up — in 2 weeks"

The backend automatically:
1. Extracts the date from the natural language text using `chrono-node`
2. Calculates the actual due date based on the visit date
3. Stores the due date in the `dueAt` field of the action item

**Files involved:**
- `functions/src/utils/actionDueDate.ts` - Date parsing logic
- `functions/src/services/visitProcessor.ts` - Action item creation
- `functions/src/services/openai.ts` - AI prompt includes timing instructions

### Mobile App (React Native)

**Features:**
- Calendar icon button appears on pending action items that have a due date
- Tapping the icon toggles calendar sync:
  - **No explicit time in the description:** creates an all-day event (midnight–midnight) with a reminder 24 hours ahead.
  - **Explicit time included (“at 9:45 am”, “945am”, etc.):** creates a 1-hour event at that time with two reminders (24 hours before, and at start time).
- Calendar event metadata (event ID, calendar ID, timestamps) is stored on the action so we can keep the device calendar in sync.
- Tapping the icon again removes the event from the device calendar and clears the stored metadata.
- Supports both iOS and Android native calendars via `expo-calendar`.

**Files:**
- `mobile/lib/calendar.ts` - Calendar integration utilities
- `mobile/app/actions.tsx` - UI with calendar button

**Permissions:**
The app will request calendar permissions the first time you try to add an action to your calendar.

### Web Portal (Next.js)

**Features:**
- "Add to Calendar" button appears on pending action items with due dates
- Downloads an ICS (iCalendar) file that works with:
  - Google Calendar
  - Apple Calendar
  - Outlook
  - Any calendar app that supports ICS files
- Double-click the downloaded file to add to your default calendar app

**Files:**
- `web-portal/lib/calendar.ts` - ICS file generation
- `web-portal/app/(protected)/actions/page.tsx` - UI with download button

## Testing

To test the calendar integration:

1. **Create a test visit** with action items that include timing:
   - Example transcript: "Patient should return for a follow-up blood pressure check in 3 months. We'll order labs in 2 weeks."

2. **Process the visit** - The AI will create action items with due dates

3. **Mobile:** Open the Actions screen and tap the calendar icon on an action item

4. **Web:** Open the Actions page and click "Add to Calendar" on an action item

## Technical Details

### Date Parsing

The `chrono-node` library is used to parse natural language dates:

```typescript
import { parseDate } from 'chrono-node';

const parsed = parseDate("in 3 months", referenceDate, {
  forwardDate: true,
});
```

This handles various formats:
- Relative: "in 3 months", "within 2 weeks"
- About: "in about three months"
- Specific: "on January 15th"

### Reference Date

The reference date for calculating due dates is determined in this order:
1. `visitDate` - When the visit occurred (if set)
2. `createdAt` - When the visit record was created
3. `processedAt` - When the AI processing completed
4. Current date (fallback)

This ensures that "follow up in 3 months" is calculated from the visit date, not the processing date.

### Calendar Event Format

**Mobile (Native Calendar):**
- Title: "📋 [Action Title]"
- All-day by default; falls back to timed events only when a specific time is present in the action description.
- Timed events are 60 minutes long and include two reminders (24 hours before, and at start).
- Notes contain the full action description for context.
- Stored metadata lets us later remove/update the event when the action changes.

**Web (ICS File):**
- Format: iCalendar (RFC 5545)
- Mirrors the same logic:
  - All-day events when no time is present
  - Timed events when the description includes an explicit time
- Downloaded `.ics` files can be imported into any calendar app (Google, Apple, Outlook, etc.).

## Troubleshooting

### "No Due Date" Error
**Cause:** The action item doesn't have a `dueAt` date set.
**Solution:** The AI should automatically extract dates from the transcript. If an action doesn't have a date, you can:
- Edit the action and manually set a due date
- Check that the AI prompt includes timing information

### Mobile Calendar Permission Denied
**Solution:** Go to device Settings → LumiMD → Permissions → Enable Calendar

### Calendar Events Not Removed
**Cause:** (Mobile) Removing the action without removing the calendar link first, or deleting the action from another device.
**Solution:** Use the in-app calendar toggle before deleting the action. The current implementation can only remove events from the device that added them. If an action is deleted elsewhere, you'll need to remove that calendar event manually (until we add background sync).

### Web Download Not Working
**Solution:** Check that your browser allows downloads from LumiMD. The ICS file should download automatically and can be opened with your calendar app.

## Future Enhancements

Potential improvements:
- Automatic two-way sync (e.g., remove events if the action is deleted elsewhere)
- Custom reminder times
- Calendar selection (which calendar to add to)
- Bulk calendar export for multiple actions
- Push notifications for upcoming actions
- Integration with Apple Health/Google Fit

