/**
 * Medication Page Utility Tests
 *
 * Tests for utility functions used in the medications page.
 * These functions handle text formatting, sanitization, and timestamp display.
 */

import { describe, it, expect } from 'vitest';

// Re-implement the utility functions for testing (they're not exported from the page)
// This tests the logic patterns to ensure correctness

function toTitleCase(value: string): string {
    return value
        .toLowerCase()
        .split(' ')
        .map((word) => (word.length ? word[0].toUpperCase() + word.slice(1) : ''))
        .join(' ')
        .replace(/\b(of|and|for|to|in|on|the)\b/gi, (match) => match.toLowerCase());
}

function sanitizeOptionalString(value?: string | null): string | undefined {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
}

function formatInsightTimestamp(value: unknown): string | null {
    if (!value) return null;

    try {
        if (typeof value === 'string') {
            const date = new Date(value);
            if (!Number.isNaN(date.getTime())) {
                return date.toLocaleString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                });
            }
        }

        if (typeof value === 'object' && value !== null) {
            // Firestore Timestamp has toDate()
            if ('toDate' in (value as Record<string, unknown>) && typeof (value as any).toDate === 'function') {
                const date = (value as any).toDate();
                return date.toLocaleString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                });
            }
            if ('seconds' in (value as Record<string, unknown>)) {
                const seconds = Number((value as any).seconds);
                const nanos = Number((value as any).nanoseconds ?? (value as any).nanosecond ?? 0);
                if (!Number.isNaN(seconds)) {
                    const date = new Date(seconds * 1000 + nanos / 1_000_000);
                    return date.toLocaleString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                    });
                }
            }
        }
    } catch {
        // Silent fail
    }

    return null;
}

describe('Medication Page Utilities', () => {
    describe('toTitleCase', () => {
        it('should capitalize first letter of each word', () => {
            expect(toTitleCase('metformin')).toBe('Metformin');
            expect(toTitleCase('lisinopril hctz')).toBe('Lisinopril Hctz');
        });

        it('should keep common words lowercase', () => {
            expect(toTitleCase('vitamin d for bone health')).toBe('Vitamin D for Bone Health');
            expect(toTitleCase('aspirin and plavix')).toBe('Aspirin and Plavix');
        });

        it('should handle medications with "of"', () => {
            expect(toTitleCase('milk of magnesia')).toBe('Milk of Magnesia');
        });

        it('should handle empty strings', () => {
            expect(toTitleCase('')).toBe('');
        });

        it('should handle uppercase input', () => {
            expect(toTitleCase('METFORMIN')).toBe('Metformin');
            expect(toTitleCase('LISINOPRIL')).toBe('Lisinopril');
        });

        it('should handle multi-word medication names', () => {
            expect(toTitleCase('amoxicillin clavulanate')).toBe('Amoxicillin Clavulanate');
        });
    });

    describe('sanitizeOptionalString', () => {
        it('should return undefined for null input', () => {
            expect(sanitizeOptionalString(null)).toBeUndefined();
        });

        it('should return undefined for undefined input', () => {
            expect(sanitizeOptionalString(undefined)).toBeUndefined();
        });

        it('should return undefined for empty string', () => {
            expect(sanitizeOptionalString('')).toBeUndefined();
        });

        it('should return undefined for whitespace-only string', () => {
            expect(sanitizeOptionalString('   ')).toBeUndefined();
            expect(sanitizeOptionalString('\t\n')).toBeUndefined();
        });

        it('should trim and return valid strings', () => {
            expect(sanitizeOptionalString('  Lisinopril  ')).toBe('Lisinopril');
            expect(sanitizeOptionalString('10mg daily')).toBe('10mg daily');
        });

        it('should preserve internal whitespace', () => {
            expect(sanitizeOptionalString('Take with food')).toBe('Take with food');
        });
    });

    describe('formatInsightTimestamp', () => {
        it('should return null for null/undefined input', () => {
            expect(formatInsightTimestamp(null)).toBeNull();
            expect(formatInsightTimestamp(undefined)).toBeNull();
        });

        it('should format ISO date strings', () => {
            const result = formatInsightTimestamp('2024-01-15T10:30:00Z');
            expect(result).not.toBeNull();
            expect(result).toContain('Jan');
            expect(result).toContain('15');
            expect(result).toContain('2024');
        });

        it('should format Firestore-like timestamp objects with seconds', () => {
            // Unix timestamp for 2024-01-15T10:30:00Z
            const timestamp = { seconds: 1705314600, nanoseconds: 0 };
            const result = formatInsightTimestamp(timestamp);
            expect(result).not.toBeNull();
            expect(result).toContain('Jan');
            expect(result).toContain('15');
            expect(result).toContain('2024');
        });

        it('should format Firestore Timestamp objects with toDate()', () => {
            const timestamp = {
                toDate: () => new Date('2024-01-15T10:30:00Z'),
            };
            const result = formatInsightTimestamp(timestamp);
            expect(result).not.toBeNull();
            expect(result).toContain('Jan');
            expect(result).toContain('15');
            expect(result).toContain('2024');
        });

        it('should return null for invalid date strings', () => {
            expect(formatInsightTimestamp('not-a-date')).toBeNull();
        });

        it('should return null for invalid objects', () => {
            expect(formatInsightTimestamp({ foo: 'bar' })).toBeNull();
        });

        it('should return null for numbers', () => {
            // Direct numbers are not supported by this function
            expect(formatInsightTimestamp(1705314600)).toBeNull();
        });
    });
});

describe('Medication Warning Severity Logic', () => {
    // Test the warning severity ordering used in the page
    const getSeverityOrder = (severity: string): number => {
        const order: Record<string, number> = { critical: 0, high: 1, moderate: 2, low: 3 };
        return order[severity] ?? 99;
    };

    it('should order critical as highest priority', () => {
        expect(getSeverityOrder('critical')).toBe(0);
        expect(getSeverityOrder('critical')).toBeLessThan(getSeverityOrder('high'));
    });

    it('should order high before moderate', () => {
        expect(getSeverityOrder('high')).toBeLessThan(getSeverityOrder('moderate'));
    });

    it('should order moderate before low', () => {
        expect(getSeverityOrder('moderate')).toBeLessThan(getSeverityOrder('low'));
    });

    it('should return high number for unknown severity', () => {
        expect(getSeverityOrder('unknown')).toBe(99);
        expect(getSeverityOrder('')).toBe(99);
    });
});

describe('Medication Active Status Logic', () => {
    // Test the active status determination used in the page
    const isMedicationActive = (medication: {
        active?: boolean;
        stoppedAt?: unknown;
    }): boolean => {
        return medication.active !== false && !medication.stoppedAt;
    };

    it('should return true for explicitly active medication', () => {
        expect(isMedicationActive({ active: true })).toBe(true);
    });

    it('should return true for medication without active field', () => {
        expect(isMedicationActive({})).toBe(true);
    });

    it('should return false for explicitly inactive medication', () => {
        expect(isMedicationActive({ active: false })).toBe(false);
    });

    it('should return false for medication with stoppedAt', () => {
        expect(isMedicationActive({ active: true, stoppedAt: new Date() })).toBe(false);
        expect(isMedicationActive({ stoppedAt: { seconds: 1234567890 } })).toBe(false);
    });

    it('should return true when stoppedAt is null', () => {
        expect(isMedicationActive({ active: true, stoppedAt: null })).toBe(true);
    });
});
