import { parseActionDueDate, resolveActionDueDate, resolveVisitReferenceDate } from '../actionDueDate';

describe('actionDueDate utilities', () => {
  it('parseActionDueDate should parse free-text date descriptions', () => {
    const referenceDate = new Date('2026-01-01T12:00:00.000Z');
    const dueDate = parseActionDueDate('Clinic follow up — on March 10, 2026', referenceDate);
    expect(dueDate).not.toBeNull();
    expect(dueDate?.toISOString().slice(0, 10)).toBe('2026-03-10');
  });

  it('resolveActionDueDate should prioritize explicit model dueAt', () => {
    const referenceDate = new Date('2026-01-01T12:00:00.000Z');
    const dueDate = resolveActionDueDate({
      description: 'Clinic follow up — in 3 months',
      timeframe: 'in 3 months',
      dueAt: '2026-02-15',
      referenceDate,
    });

    expect(dueDate).not.toBeNull();
    expect(dueDate?.toISOString().slice(0, 10)).toBe('2026-02-15');
    expect(dueDate?.getHours()).toBe(12);
  });

  it('resolveActionDueDate should use timeframe when dueAt is unavailable', () => {
    const referenceDate = new Date('2026-01-01T12:00:00.000Z');
    const dueDate = resolveActionDueDate({
      description: 'Clinic follow up',
      timeframe: 'on March 15, 2026',
      referenceDate,
    });

    expect(dueDate).not.toBeNull();
    expect(dueDate?.toISOString().slice(0, 10)).toBe('2026-03-15');
  });

  it('resolveActionDueDate should fallback to description parsing', () => {
    const referenceDate = new Date('2026-01-01T12:00:00.000Z');
    const dueDate = resolveActionDueDate({
      description: 'Nurse visit — next Friday',
      referenceDate,
    });

    expect(dueDate).not.toBeNull();
  });

  it('resolveVisitReferenceDate should prioritize visitDate then createdAt', () => {
    const fallback = new Date('2026-02-01T12:00:00.000Z');
    const visitDate = new Date('2026-01-15T08:00:00.000Z');
    const createdAt = new Date('2026-01-10T08:00:00.000Z');

    const result = resolveVisitReferenceDate(
      {
        visitDate,
        createdAt,
      },
      fallback,
    );

    expect(result.toISOString().slice(0, 10)).toBe('2026-01-15');
    expect(result.getHours()).toBe(12);
  });
});
