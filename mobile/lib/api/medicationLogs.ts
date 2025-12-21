/**
 * Medication Logs API Client
 * 
 * Functions for logging medication compliance events
 */

import { getIdToken } from '../auth';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ||
    'https://us-central1-lumimd-dev.cloudfunctions.net/api';

export interface MedicationLogEntry {
    medicationId: string;
    medicationName: string;
    reminderId?: string;
    action: 'taken' | 'skipped' | 'snoozed';
    scheduledTime: string; // HH:MM format
}

export interface MedicationLog extends MedicationLogEntry {
    id: string;
    userId: string;
    loggedAt: string;
}

export interface ComplianceSummary {
    period: {
        days: number;
        startDate: string;
        endDate: string;
    };
    overall: {
        taken: number;
        skipped: number;
        snoozed: number;
        total: number;
        complianceRate: number;
    };
    byMedication: Array<{
        medicationId: string;
        medicationName: string;
        taken: number;
        skipped: number;
        snoozed: number;
        total: number;
        complianceRate: number;
    }>;
}

/**
 * Log a medication action (taken, skipped, snoozed)
 */
export async function logMedicationAction(entry: MedicationLogEntry): Promise<MedicationLog> {
    const token = await getIdToken();
    if (!token) {
        throw new Error('Not authenticated');
    }

    const response = await fetch(`${API_BASE_URL}/v1/medication-logs`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(entry),
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || `Request failed with status ${response.status}`);
    }

    return response.json();
}

/**
 * Get medication logs for the current user
 */
export async function getMedicationLogs(options?: {
    medicationId?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
}): Promise<MedicationLog[]> {
    const token = await getIdToken();
    if (!token) {
        throw new Error('Not authenticated');
    }

    const params = new URLSearchParams();
    if (options?.medicationId) params.append('medicationId', options.medicationId);
    if (options?.startDate) params.append('startDate', options.startDate);
    if (options?.endDate) params.append('endDate', options.endDate);
    if (options?.limit) params.append('limit', options.limit.toString());

    const queryString = params.toString();
    const url = `${API_BASE_URL}/v1/medication-logs${queryString ? `?${queryString}` : ''}`;

    const response = await fetch(url, {
        headers: {
            'Authorization': `Bearer ${token}`,
        },
    });

    if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
    }

    const data = await response.json();
    return data.logs;
}

/**
 * Get compliance summary for dashboard/reports
 */
export async function getComplianceSummary(days: number = 30): Promise<ComplianceSummary> {
    const token = await getIdToken();
    if (!token) {
        throw new Error('Not authenticated');
    }

    const response = await fetch(`${API_BASE_URL}/v1/medication-logs/summary?days=${days}`, {
        headers: {
            'Authorization': `Bearer ${token}`,
        },
    });

    if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
    }

    return response.json();
}
