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
- Tapping the calendar icon adds the action to your device calendar
- Creates an event at 9 AM on the due date with 1-hour duration
- Sets two reminders:
  - 1 day before at 9 AM
  - On the day at 9 AM
- Supports both iOS and Android native calendars
- Uses expo-calendar for calendar integration

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
- Start: 9:00 AM on due date
- End: 10:00 AM on due date
- Alarms: -24 hours, and at event time
- Notes: Full action description

**Web (ICS File):**
- Format: iCalendar (RFC 5545)
- Same timing as mobile
- Can be imported into any calendar application

## Troubleshooting

### "No Due Date" Error
**Cause:** The action item doesn't have a `dueAt` date set.
**Solution:** The AI should automatically extract dates from the transcript. If an action doesn't have a date, you can:
- Edit the action and manually set a due date
- Check that the AI prompt includes timing information

### Mobile Calendar Permission Denied
**Solution:** Go to device Settings → LumiMD → Permissions → Enable Calendar

### Web Download Not Working
**Solution:** Check that your browser allows downloads from LumiMD. The ICS file should download automatically and can be opened with your calendar app.

## Future Enhancements

Potential improvements:
- Automatic calendar sync (two-way sync)
- Custom reminder times
- Calendar selection (which calendar to add to)
- Bulk calendar export for multiple actions
- Push notifications for upcoming actions
- Integration with Apple Health/Google Fit

