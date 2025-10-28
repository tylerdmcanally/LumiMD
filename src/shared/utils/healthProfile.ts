import AsyncStorage from '@react-native-async-storage/async-storage';

const HEALTH_PROFILE_KEY = '@healthProfile';
const HEALTH_REMINDER_DISMISS_KEY = '@healthReminderDismissCount';

export interface HealthItem {
  id: string;
  value: string;
  notes?: string;
}

export interface HealthProfileData {
  medications: HealthItem[];
  conditions: HealthItem[];
  allergies: HealthItem[];
}

export const getHealthProfile = async (): Promise<HealthProfileData> => {
  try {
    const stored = await AsyncStorage.getItem(HEALTH_PROFILE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (err) {
    console.error('Failed to load health profile', err);
  }
  return { medications: [], conditions: [], allergies: [] };
};

export const getHealthProfileCompletionPercent = async (): Promise<number> => {
  const data = await getHealthProfile();
  
  // Check if each section has been addressed (either with items or explicit "none")
  const hasMedications = data.medications.length > 0;
  const hasConditions = data.conditions.length > 0;
  const hasAllergies = data.allergies.length > 0;
  
  // Count completed sections (out of 3)
  const completedSections = [hasMedications, hasConditions, hasAllergies].filter(Boolean).length;
  
  // Calculate percentage based on completed sections (33.33% per section)
  return Math.round((completedSections / 3) * 100);
};

export const shouldShowHealthReminder = async (): Promise<boolean> => {
  try {
    const completion = await getHealthProfileCompletionPercent();
    if (completion >= 100) return false;

    const dismissCount = await AsyncStorage.getItem(HEALTH_REMINDER_DISMISS_KEY);
    const count = dismissCount ? parseInt(dismissCount, 10) : 0;

    // Show max 2 times
    return count < 2;
  } catch (err) {
    console.error('Failed to check health reminder', err);
    return false;
  }
};

export const dismissHealthReminder = async (): Promise<void> => {
  try {
    const dismissCount = await AsyncStorage.getItem(HEALTH_REMINDER_DISMISS_KEY);
    const count = dismissCount ? parseInt(dismissCount, 10) : 0;
    await AsyncStorage.setItem(HEALTH_REMINDER_DISMISS_KEY, String(count + 1));
  } catch (err) {
    console.error('Failed to dismiss health reminder', err);
  }
};

// Format health profile for AI context
export const formatHealthProfileForAI = (data: HealthProfileData): string => {
  const parts: string[] = [];

  if (data.medications.length > 0) {
    parts.push(`Current Medications: ${data.medications.map(m => m.value).join(', ')}`);
  }

  if (data.conditions.length > 0) {
    parts.push(`Medical History: ${data.conditions.map(c => c.value).join(', ')}`);
  }

  if (data.allergies.length > 0) {
    parts.push(`Allergies: ${data.allergies.map(a => a.value).join(', ')}`);
  }

  return parts.join('\n');
};
