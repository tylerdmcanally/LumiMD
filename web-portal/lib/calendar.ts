/**
 * Calendar integration utilities for web portal
 * Generates ICS (iCalendar) files that can be imported into any calendar app
 */

const MERIDIEM_TIME_REGEX = /\b(?:at\s*)?(\d{1,2})(?::(\d{2}))?\s*(a\.m\.|p\.m\.|am|pm)\b/i;
const COMPACT_TIME_REGEX = /\b(?:at\s*)?(\d{3,4})\s*(a\.m\.|p\.m\.|am|pm)\b/i;

type ExplicitTime = { hour: number; minute: number };

export interface ActionItem {
  id: string;
  description: string;
  dueAt?: string | null;
  notes?: string;
  visitId?: string | null;
}

/**
 * Format a date for ICS format (YYYYMMDDTHHMMSSZ)
 */
function formatICSDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  const seconds = String(date.getUTCSeconds()).padStart(2, '0');
  
  return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
}

function formatICSSimpleDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

/**
 * Escape special characters for ICS format
 */
function escapeICSText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

/**
 * Extract title from action description (everything before the em dash)
 */
function getActionTitle(description: string): string {
  const title = description.split(/[-–—]/)[0].trim();
  return title || description;
}

function parseExplicitTime(description?: string | null): ExplicitTime | null {
  if (!description) return null;
  const normalized = description.replace(/\s+/g, ' ').trim();

  const meridiemMatch = normalized.match(MERIDIEM_TIME_REGEX);
  if (meridiemMatch) {
    const hour = parseInt(meridiemMatch[1], 10);
    const minute = meridiemMatch[2] ? parseInt(meridiemMatch[2], 10) : 0;
    const meridiem = meridiemMatch[3].toLowerCase();
    return convertTo24Hour(hour, minute, meridiem);
  }

  const compactMatch = normalized.match(COMPACT_TIME_REGEX);
  if (compactMatch) {
    const digits = compactMatch[1];
    const meridiem = compactMatch[2].toLowerCase();
    const hourDigits = digits.length === 3 ? digits.slice(0, 1) : digits.slice(0, 2);
    const minuteDigits = digits.slice(-2);
    const hour = parseInt(hourDigits, 10);
    const minute = parseInt(minuteDigits, 10);
    return convertTo24Hour(hour, minute, meridiem);
  }

  return null;
}

function convertTo24Hour(hour: number, minute: number, meridiem: string): ExplicitTime | null {
  if (Number.isNaN(hour) || Number.isNaN(minute)) {
    return null;
  }

  let adjustedHour = hour % 12;
  if (meridiem.startsWith('p')) {
    adjustedHour += 12;
  }

  return {
    hour: adjustedHour,
    minute: minute % 60,
  };
}

/**
 * Generate an ICS file content for an action item
 */
export function generateICS(action: ActionItem): string {
  if (!action.dueAt) {
    throw new Error('Action item must have a due date to create a calendar event');
  }
  
  const dueDate = new Date(action.dueAt);
  if (isNaN(dueDate.getTime())) {
    throw new Error('Invalid due date');
  }

  const explicitTime = parseExplicitTime(action.description);
  let dtStartLine = '';
  let dtEndLine = '';
  let startDate: Date;
  let endDate: Date;

  if (explicitTime) {
    startDate = new Date(dueDate);
    startDate.setHours(explicitTime.hour, explicitTime.minute, 0, 0);
    endDate = new Date(startDate);
    endDate.setHours(startDate.getHours() + 1);
    dtStartLine = `DTSTART:${formatICSDate(startDate)}`;
    dtEndLine = `DTEND:${formatICSDate(endDate)}`;
  } else {
    startDate = new Date(dueDate);
    startDate.setHours(0, 0, 0, 0);
    endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 1);
    dtStartLine = `DTSTART;VALUE=DATE:${formatICSSimpleDate(startDate)}`;
    dtEndLine = `DTEND;VALUE=DATE:${formatICSSimpleDate(endDate)}`;
  }

  const title = getActionTitle(action.description);
  const description = action.notes || action.description;
  
  const now = new Date();
  const uid = `lumimd-action-${action.id}@lumimd.app`;
  
  const icsContent = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//LumiMD//Action Items//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:LumiMD Action Items',
    'X-WR-TIMEZONE:UTC',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${formatICSDate(now)}`,
    dtStartLine,
    dtEndLine,
    `SUMMARY:📋 ${escapeICSText(title)}`,
    `DESCRIPTION:${escapeICSText(description)}`,
    'STATUS:CONFIRMED',
    'SEQUENCE:0',
    'BEGIN:VALARM',
    'TRIGGER:-P1D',
    'ACTION:DISPLAY',
    `DESCRIPTION:Reminder: ${escapeICSText(title)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
  
  return icsContent;
}

/**
 * Download an ICS file for an action item
 */
export function downloadActionAsICS(action: ActionItem): void {
  try {
    const icsContent = generateICS(action);
    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `lumimd-action-${action.id}.ics`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // Clean up the URL object
    setTimeout(() => URL.revokeObjectURL(url), 100);
  } catch (error) {
    console.error('Error generating ICS file:', error);
    throw error;
  }
}

/**
 * Generate ICS content for multiple action items
 */
export function generateMultipleICS(actions: ActionItem[]): string {
  const now = new Date();
  
  const events = actions
    .filter((action) => action.dueAt)
    .map((action) => {
      const dueDate = new Date(action.dueAt!);
      if (isNaN(dueDate.getTime())) {
        return null;
      }
      
      const explicitTime = parseExplicitTime(action.description);
      let dtStartLine = '';
      let dtEndLine = '';
      let startDate: Date;
      let endDate: Date;

      if (explicitTime) {
        startDate = new Date(dueDate);
        startDate.setHours(explicitTime.hour, explicitTime.minute, 0, 0);
        endDate = new Date(startDate);
        endDate.setHours(startDate.getHours() + 1);
        dtStartLine = `DTSTART:${formatICSDate(startDate)}`;
        dtEndLine = `DTEND:${formatICSDate(endDate)}`;
      } else {
        startDate = new Date(dueDate);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + 1);
        dtStartLine = `DTSTART;VALUE=DATE:${formatICSSimpleDate(startDate)}`;
        dtEndLine = `DTEND;VALUE=DATE:${formatICSSimpleDate(endDate)}`;
      }
      
      const title = getActionTitle(action.description);
      const description = action.notes || action.description;
      const uid = `lumimd-action-${action.id}@lumimd.app`;
      
      return [
        'BEGIN:VEVENT',
        `UID:${uid}`,
        `DTSTAMP:${formatICSDate(now)}`,
        dtStartLine,
        dtEndLine,
        `SUMMARY:📋 ${escapeICSText(title)}`,
        `DESCRIPTION:${escapeICSText(description)}`,
        'STATUS:CONFIRMED',
        'SEQUENCE:0',
        'BEGIN:VALARM',
        'TRIGGER:-P1D',
        'ACTION:DISPLAY',
        `DESCRIPTION:Reminder: ${escapeICSText(title)}`,
        'END:VALARM',
        'END:VEVENT',
      ].join('\r\n');
    })
    .filter(Boolean);
  
  if (events.length === 0) {
    throw new Error('No valid action items with due dates to export');
  }
  
  const icsContent = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//LumiMD//Action Items//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:LumiMD Action Items',
    'X-WR-TIMEZONE:UTC',
    ...events,
    'END:VCALENDAR',
  ].join('\r\n');
  
  return icsContent;
}

/**
 * Download ICS file for multiple action items
 */
export function downloadMultipleActionsAsICS(actions: ActionItem[]): void {
  try {
    const icsContent = generateMultipleICS(actions);
    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `lumimd-actions-${new Date().toISOString().split('T')[0]}.ics`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    setTimeout(() => URL.revokeObjectURL(url), 100);
  } catch (error) {
    console.error('Error generating ICS file:', error);
    throw error;
  }
}

