import { resolveReminderTimes } from '../frequencyTimes';

describe('resolveReminderTimes', () => {
  describe('frequencyCode (primary path)', () => {
    it('QD → single morning dose', () => {
      expect(resolveReminderTimes(null, 'QD')).toEqual(['08:00']);
    });

    it('BID → morning + evening', () => {
      expect(resolveReminderTimes(null, 'BID')).toEqual(['08:00', '20:00']);
    });

    it('TID → three times', () => {
      expect(resolveReminderTimes(null, 'TID')).toEqual(['08:00', '14:00', '20:00']);
    });

    it('QID → four times', () => {
      expect(resolveReminderTimes(null, 'QID')).toEqual(['08:00', '12:00', '16:00', '20:00']);
    });

    it('QHS → bedtime', () => {
      expect(resolveReminderTimes(null, 'QHS')).toEqual(['21:00']);
    });

    it('PRN → null (no reminder)', () => {
      expect(resolveReminderTimes(null, 'PRN')).toBeNull();
    });

    it('WEEKLY → single morning', () => {
      expect(resolveReminderTimes(null, 'WEEKLY')).toEqual(['08:00']);
    });

    it('MONTHLY → single morning', () => {
      expect(resolveReminderTimes(null, 'MONTHLY')).toEqual(['08:00']);
    });

    it('is case-insensitive', () => {
      expect(resolveReminderTimes(null, 'bid')).toEqual(['08:00', '20:00']);
      expect(resolveReminderTimes(null, 'Bid')).toEqual(['08:00', '20:00']);
    });

    it('OTHER falls through to free-text', () => {
      expect(resolveReminderTimes('twice daily', 'OTHER')).toEqual(['08:00', '20:00']);
    });

    it('frequencyCode takes priority over conflicting free-text', () => {
      // GPT says BID but free-text says "daily" — code wins
      expect(resolveReminderTimes('daily', 'BID')).toEqual(['08:00', '20:00']);
    });
  });

  describe('free-text fallback (no frequencyCode)', () => {
    it('no frequency → default morning', () => {
      expect(resolveReminderTimes(null)).toEqual(['08:00']);
      expect(resolveReminderTimes(undefined)).toEqual(['08:00']);
      expect(resolveReminderTimes('')).toEqual(['08:00']);
    });

    it('"twice daily" → BID times', () => {
      expect(resolveReminderTimes('twice daily')).toEqual(['08:00', '20:00']);
    });

    it('"three times daily" → TID times', () => {
      expect(resolveReminderTimes('three times daily')).toEqual(['08:00', '14:00', '20:00']);
    });

    it('"daily" → once daily morning', () => {
      expect(resolveReminderTimes('daily')).toEqual(['08:00']);
    });

    it('"once daily" → morning', () => {
      expect(resolveReminderTimes('once daily')).toEqual(['08:00']);
    });

    it('"daily at bedtime" → bedtime', () => {
      expect(resolveReminderTimes('daily at bedtime')).toEqual(['21:00']);
    });

    it('"as needed" → null', () => {
      expect(resolveReminderTimes('as needed')).toBeNull();
    });

    it('"PRN" in free-text → null', () => {
      expect(resolveReminderTimes('prn')).toBeNull();
    });

    it('"BID" in free-text → twice daily', () => {
      expect(resolveReminderTimes('bid')).toEqual(['08:00', '20:00']);
    });

    it('"every 12 hours" → twice daily', () => {
      expect(resolveReminderTimes('every 12 hours')).toEqual(['08:00', '20:00']);
    });

    it('"with meals" → three mealtimes', () => {
      expect(resolveReminderTimes('with meals')).toEqual(['08:00', '12:00', '18:00']);
    });

    it('"at bedtime" → 21:00', () => {
      expect(resolveReminderTimes('at bedtime')).toEqual(['21:00']);
    });

    it('"weekly" → morning', () => {
      expect(resolveReminderTimes('weekly')).toEqual(['08:00']);
    });

    // Regression: "twice daily" must NOT match "daily" first
    it('"twice daily" does not match as once-daily', () => {
      const times = resolveReminderTimes('twice daily');
      expect(times).toHaveLength(2);
      expect(times).toEqual(['08:00', '20:00']);
    });

    it('"three times daily" does not match as once-daily', () => {
      const times = resolveReminderTimes('three times daily');
      expect(times).toHaveLength(3);
    });

    it('"2 times a day" → BID', () => {
      expect(resolveReminderTimes('2 times a day')).toEqual(['08:00', '20:00']);
    });

    it('"b.i.d" → BID', () => {
      expect(resolveReminderTimes('b.i.d')).toEqual(['08:00', '20:00']);
    });
  });
});
