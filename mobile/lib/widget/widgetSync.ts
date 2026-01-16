/**
 * Widget Data Sync Utility
 * 
 * Syncs medication schedule data to App Groups shared storage
 * so the iOS widget can display current medications.
 */

import { Platform, NativeModules } from 'react-native';
import SharedGroupPreferences from 'react-native-shared-group-preferences';
import type { MedicationScheduleResponse } from '../api/hooks';

// App Group identifier - must match widget and app entitlements
const APP_GROUP_ID = 'group.com.lumimd.app';

// Key used in App Groups UserDefaults
const MEDICATION_SCHEDULE_KEY = 'medicationSchedule';

/**
 * Shared medication structure for widget consumption
 */
export interface SharedMedication {
    id: string;
    name: string;
    dose: string;
    time: string;
    status: 'pending' | 'taken' | 'skipped' | 'overdue';
}

/**
 * Widget data structure with metadata
 */
interface WidgetData {
    medications: SharedMedication[];
    lastSyncedAt: string; // ISO timestamp
}

/**
 * Convert API schedule data to widget-friendly format and sync to App Groups
 */
export async function syncMedicationScheduleToWidget(
    schedule: MedicationScheduleResponse | undefined
): Promise<void> {
    // Only supported on iOS
    if (Platform.OS !== 'ios') return;

    try {
        const now = new Date().toISOString();
        
        if (!schedule?.scheduledDoses) {
            // Clear widget data if no schedule
            const emptyData: WidgetData = {
                medications: [],
                lastSyncedAt: now,
            };
            await SharedGroupPreferences.setItem(
                MEDICATION_SCHEDULE_KEY,
                JSON.stringify(emptyData),
                APP_GROUP_ID
            );
            reloadWidgetTimelines();
            return;
        }

        // Transform to widget format
        const sharedMeds: SharedMedication[] = schedule.scheduledDoses
            .filter(dose => dose.status === 'pending' || dose.status === 'taken' || dose.status === 'skipped' || dose.status === 'overdue')
            .map(dose => ({
                id: `${dose.medicationId}_${dose.scheduledTime}`,
                name: dose.name,
                dose: dose.dose,
                time: formatTime(dose.scheduledTime),
                status: dose.status,
            }));

        // Sort: pending first, then by time
        sharedMeds.sort((a, b) => {
            const aActive = a.status === 'pending' || a.status === 'overdue';
            const bActive = b.status === 'pending' || b.status === 'overdue';
            if (aActive && !bActive) return -1;
            if (!aActive && bActive) return 1;
            return a.time.localeCompare(b.time);
        });

        // Write to App Groups with metadata
        const widgetData: WidgetData = {
            medications: sharedMeds,
            lastSyncedAt: now,
        };
        
        await SharedGroupPreferences.setItem(
            MEDICATION_SCHEDULE_KEY,
            JSON.stringify(widgetData),
            APP_GROUP_ID
        );

        // Trigger widget refresh
        reloadWidgetTimelines();
        console.log(`[WidgetSync] Synced ${sharedMeds.length} medications to widget at ${now}`);
    } catch (error) {
        console.warn('[WidgetSync] Failed to sync:', error);
    }
}

/**
 * Format 24h time string (HH:mm) to 12h format (h:mm AM/PM)
 */
function formatTime(time: string): string {
    if (!time || !time.includes(':')) return time;

    const [hours, minutes] = time.split(':').map(Number);
    const period = hours >= 12 ? 'PM' : 'AM';
    const hour12 = hours % 12 || 12;

    return `${hour12}:${minutes.toString().padStart(2, '0')} ${period}`;
}

/**
 * Request iOS to reload all widget timelines
 */
function reloadWidgetTimelines() {
    try {
        // Use WidgetKit native module if available
        const { WidgetKit } = NativeModules;
        if (WidgetKit?.reloadAllTimelines) {
            WidgetKit.reloadAllTimelines();
        }
    } catch (e) {
        // WidgetKit module may not be available
        console.log('[WidgetSync] WidgetKit reload not available');
    }
}
