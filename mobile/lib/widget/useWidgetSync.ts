/**
 * Hook to sync medication schedule to widget
 * 
 * Automatically syncs whenever medication schedule data changes.
 */

import { useEffect } from 'react';
import { Platform } from 'react-native';
import type { MedicationScheduleResponse } from '../api/hooks';
import { syncMedicationScheduleToWidget } from './widgetSync';

/**
 * Syncs medication schedule data to the iOS widget via App Groups.
 * Call this hook in any component that displays or modifies medication schedule.
 */
export function useWidgetSync(scheduleData: MedicationScheduleResponse | undefined) {
    useEffect(() => {
        // Only sync on iOS
        if (Platform.OS !== 'ios') return;

        // Sync whenever schedule data changes
        syncMedicationScheduleToWidget(scheduleData).catch(err => {
            console.warn('[WidgetSync] Failed to sync:', err);
        });
    }, [scheduleData]);
}
