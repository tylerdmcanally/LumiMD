/**
 * Tests for location/constants.ts
 * Validates two-party consent state detection
 */

import {
  TWO_PARTY_CONSENT_STATES,
  requiresTwoPartyConsent,
  US_STATES,
  CONSENT_FLOW_VERSION,
} from '../../../lib/location/constants';

describe('TWO_PARTY_CONSENT_STATES', () => {
  it('contains expected two-party consent states', () => {
    const expectedStates = ['CA', 'CT', 'FL', 'IL', 'MD', 'MA', 'MI', 'MT', 'NH', 'OR', 'PA', 'WA'];
    expect(TWO_PARTY_CONSENT_STATES).toEqual(expectedStates);
  });

  it('has exactly 12 states', () => {
    expect(TWO_PARTY_CONSENT_STATES).toHaveLength(12);
  });
});

describe('requiresTwoPartyConsent', () => {
  describe('two-party consent states', () => {
    it.each([
      ['CA', 'California'],
      ['CT', 'Connecticut'],
      ['FL', 'Florida'],
      ['IL', 'Illinois'],
      ['MD', 'Maryland'],
      ['MA', 'Massachusetts'],
      ['MI', 'Michigan'],
      ['MT', 'Montana'],
      ['NH', 'New Hampshire'],
      ['OR', 'Oregon'],
      ['PA', 'Pennsylvania'],
      ['WA', 'Washington'],
    ])('returns true for %s (%s)', (stateCode) => {
      expect(requiresTwoPartyConsent(stateCode)).toBe(true);
    });

    it('handles lowercase state codes', () => {
      expect(requiresTwoPartyConsent('ca')).toBe(true);
      expect(requiresTwoPartyConsent('fl')).toBe(true);
    });

    it('handles mixed case state codes', () => {
      expect(requiresTwoPartyConsent('Ca')).toBe(true);
      expect(requiresTwoPartyConsent('fL')).toBe(true);
    });
  });

  describe('one-party consent states', () => {
    it.each([
      ['TX', 'Texas'],
      ['NY', 'New York'],
      ['AZ', 'Arizona'],
      ['CO', 'Colorado'],
      ['GA', 'Georgia'],
      ['NC', 'North Carolina'],
      ['OH', 'Ohio'],
      ['VA', 'Virginia'],
    ])('returns false for %s (%s)', (stateCode) => {
      expect(requiresTwoPartyConsent(stateCode)).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('returns true for null (defaults to strictest)', () => {
      expect(requiresTwoPartyConsent(null)).toBe(true);
    });

    it('returns false for invalid state code', () => {
      expect(requiresTwoPartyConsent('XX')).toBe(false);
      expect(requiresTwoPartyConsent('ZZ')).toBe(false);
    });

    it('returns true for empty string (defaults to strictest)', () => {
      // Empty string is treated as unknown, defaulting to strictest requirement
      expect(requiresTwoPartyConsent('')).toBe(true);
    });
  });
});

describe('US_STATES', () => {
  it('contains all 50 states plus DC', () => {
    expect(US_STATES).toHaveLength(51);
  });

  it('has correct structure for each state', () => {
    US_STATES.forEach((state) => {
      expect(state).toHaveProperty('code');
      expect(state).toHaveProperty('name');
      expect(state.code).toHaveLength(2);
      expect(typeof state.name).toBe('string');
    });
  });

  it('includes District of Columbia', () => {
    const dc = US_STATES.find((s) => s.code === 'DC');
    expect(dc).toBeDefined();
    expect(dc?.name).toBe('District of Columbia');
  });
});

describe('CONSENT_FLOW_VERSION', () => {
  it('has a valid version string', () => {
    expect(CONSENT_FLOW_VERSION).toBe('1.0');
  });
});
