import * as Calendar from 'expo-calendar';
import { Platform, Alert } from 'react-native';
import dayjs from 'dayjs';

export interface ActionItem {
  id: string;
  description: string;
  dueAt?: string | null;
  notes?: string;
  visitId?: string | null;
}

/**
 * Request calendar permissions from the user
 */
const MERIDIEM_TIME_REGEX = /\b(?:at\s*)?(\d{1,2})(?::(\d{2}))?\s*(a\.m\.|p\.m\.|am|pm)\b/i;
const COMPACT_TIME_REGEX = /\b(?:at\s*)?(\d{3,4})\s*(a\.m\.|p\.m\.|am|pm)\b/i;

type ExplicitTime = { hour: number; minute: number };

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

export async function requestCalendarPermissions(): Promise<boolean> {
  try {
    const { status } = await Calendar.requestCalendarPermissionsAsync();
    
    if (status !== 'granted') {
      Alert.alert(
        'Calendar Permission Required',
        'LumiMD needs access to your calendar to add action items as events. Please enable calendar access in your device settings.',
        [{ text: 'OK' }]
      );
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('Error requesting calendar permissions:', error);
    return false;
  }
}

/**
 * Get the default calendar for the device
 */
export async function getDefaultCalendar(): Promise<string | null> {
  try {
    const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
    
    // Try to find the default calendar
    let defaultCalendar = calendars.find((cal) => cal.isPrimary);
    
    // If no primary calendar, use the first available calendar
    if (!defaultCalendar && calendars.length > 0) {
      defaultCalendar = calendars[0];
    }
    
    return defaultCalendar?.id ?? null;
  } catch (error) {
    console.error('Error getting default calendar:', error);
    return null;
  }
}

/**
 * Create a calendar for LumiMD if one doesn't exist (Android only)
 */
async function getOrCreateLumiMDCalendar(): Promise<string | null> {
  try {
    const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
    
    // Check if LumiMD calendar already exists
    const lumiCalendar = calendars.find((cal) => cal.title === 'LumiMD');
    if (lumiCalendar) {
      return lumiCalendar.id;
    }
    
    // Create new calendar (Android only)
    if (Platform.OS === 'android') {
      const defaultCalendarSource = calendars.find(
        (cal) => cal.source.name === 'Default' || cal.source.name === 'Local'
      )?.source;
      
      if (defaultCalendarSource) {
        const newCalendarId = await Calendar.createCalendarAsync({
          title: 'LumiMD',
          color: '#0a99a4',
          entityType: Calendar.EntityTypes.EVENT,
          sourceId: defaultCalendarSource.id,
          source: defaultCalendarSource,
          name: 'LumiMD',
          ownerAccount: 'personal',
          accessLevel: Calendar.CalendarAccessLevel.OWNER,
        });
        return newCalendarId;
      }
    }
    
    // For iOS or if Android calendar creation fails, use default calendar
    return await getDefaultCalendar();
  } catch (error) {
    console.error('Error creating/getting LumiMD calendar:', error);
    return await getDefaultCalendar();
  }
}

/**
 * Add an action item to the device calendar
 */
export async function addActionToCalendar(
  action: ActionItem
): Promise<{ success: boolean; eventId?: string; error?: string }> {
  try {
    // Check permissions first
    const hasPermission = await requestCalendarPermissions();
    if (!hasPermission) {
      return { success: false, error: 'Calendar permission denied' };
    }
    
    // Get calendar ID
    const calendarId = await getOrCreateLumiMDCalendar();
    if (!calendarId) {
      return { success: false, error: 'No calendar available' };
    }
    
    // Parse due date
    if (!action.dueAt) {
      return { success: false, error: 'No due date specified for this action item' };
    }
    
    const dueDate = dayjs(action.dueAt);
    if (!dueDate.isValid()) {
      return { success: false, error: 'Invalid due date' };
    }
    
    // Extract title from description (everything before the em dash)
    const title = action.description.split(/[-–—]/)[0].trim() || action.description;
    
    const explicitTime = parseExplicitTime(action.description);
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    let startDate: Date;
    let endDate: Date;
    let allDay = false;
    const alarms: Calendar.Alarm[] = [];

    if (explicitTime) {
      const start = dueDate
        .hour(explicitTime.hour)
        .minute(explicitTime.minute)
        .second(0);
      startDate = start.toDate();
      endDate = start.add(60, 'minute').toDate();
      // Keep two reminders: 24 hours before & at event start
      alarms.push({ relativeOffset: -24 * 60 });
      alarms.push({ relativeOffset: 0 });
    } else {
      allDay = true;
      startDate = dueDate.startOf('day').toDate();
      endDate = dueDate.add(1, 'day').startOf('day').toDate();
      // Reminder 1 day before
      alarms.push({ relativeOffset: -24 * 60 });
    }
    
    const eventId = await Calendar.createEventAsync(calendarId, {
      title: `📋 ${title}`,
      startDate,
      endDate,
      allDay,
      notes: action.notes || action.description,
      timeZone: allDay ? undefined : timeZone,
      alarms,
    });
    
    return { success: true, eventId };
  } catch (error) {
    console.error('Error adding action to calendar:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: errorMessage };
  }
}

/**
 * Add multiple action items to calendar at once
 */
export async function addMultipleActionsToCalendar(
  actions: ActionItem[]
): Promise<{ success: number; failed: number; results: Array<{ action: ActionItem; success: boolean; error?: string }> }> {
  const results: Array<{ action: ActionItem; success: boolean; error?: string }> = [];
  let successCount = 0;
  let failedCount = 0;
  
  for (const action of actions) {
    const result = await addActionToCalendar(action);
    
    if (result.success) {
      successCount++;
      results.push({ action, success: true });
    } else {
      failedCount++;
      results.push({ action, success: false, error: result.error });
    }
  }
  
  return { success: successCount, failed: failedCount, results };
}

/**
 * Check if calendar permissions are already granted
 */
export async function hasCalendarPermissions(): Promise<boolean> {
  try {
    const { status } = await Calendar.getCalendarPermissionsAsync();
    return status === 'granted';
  } catch (error) {
    console.error('Error checking calendar permissions:', error);
    return false;
  }
}

