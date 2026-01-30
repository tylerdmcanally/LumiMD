/**
 * Recording Consent Constants
 * Two-party consent states and related types
 */

/**
 * US states that require all-party (two-party) consent for recording.
 * Recording in these states without consent from all parties is illegal.
 */
export const TWO_PARTY_CONSENT_STATES = [
  'CA', // California
  'CT', // Connecticut
  'FL', // Florida
  'IL', // Illinois
  'MD', // Maryland
  'MA', // Massachusetts
  'MI', // Michigan
  'MT', // Montana
  'NH', // New Hampshire
  'OR', // Oregon
  'PA', // Pennsylvania
  'WA', // Washington
] as const;

export type TwoPartyConsentState = (typeof TWO_PARTY_CONSENT_STATES)[number];

export type StateSource = 'location' | 'manual';

export interface ConsentSettings {
  stateCode: string | null;
  stateSource: StateSource | null;
  stateUpdatedAt: Date | null;
  skipOnePartyReminder: boolean;
}

export interface ConsentRecord {
  consentAcknowledged: boolean;
  consentAcknowledgedAt: Date | null;
  recordingStateCode: string | null;
  twoPartyConsentRequired: boolean;
  consentFlowVersion: string;
}

/**
 * Check if a state requires two-party consent for recording.
 */
export function requiresTwoPartyConsent(stateCode: string | null): boolean {
  if (!stateCode) return true; // Default to strictest requirement if unknown
  return TWO_PARTY_CONSENT_STATES.includes(
    stateCode.toUpperCase() as TwoPartyConsentState
  );
}

/**
 * US State codes and names for manual selection
 */
export const US_STATES = [
  { code: 'AL', name: 'Alabama' },
  { code: 'AK', name: 'Alaska' },
  { code: 'AZ', name: 'Arizona' },
  { code: 'AR', name: 'Arkansas' },
  { code: 'CA', name: 'California' },
  { code: 'CO', name: 'Colorado' },
  { code: 'CT', name: 'Connecticut' },
  { code: 'DE', name: 'Delaware' },
  { code: 'FL', name: 'Florida' },
  { code: 'GA', name: 'Georgia' },
  { code: 'HI', name: 'Hawaii' },
  { code: 'ID', name: 'Idaho' },
  { code: 'IL', name: 'Illinois' },
  { code: 'IN', name: 'Indiana' },
  { code: 'IA', name: 'Iowa' },
  { code: 'KS', name: 'Kansas' },
  { code: 'KY', name: 'Kentucky' },
  { code: 'LA', name: 'Louisiana' },
  { code: 'ME', name: 'Maine' },
  { code: 'MD', name: 'Maryland' },
  { code: 'MA', name: 'Massachusetts' },
  { code: 'MI', name: 'Michigan' },
  { code: 'MN', name: 'Minnesota' },
  { code: 'MS', name: 'Mississippi' },
  { code: 'MO', name: 'Missouri' },
  { code: 'MT', name: 'Montana' },
  { code: 'NE', name: 'Nebraska' },
  { code: 'NV', name: 'Nevada' },
  { code: 'NH', name: 'New Hampshire' },
  { code: 'NJ', name: 'New Jersey' },
  { code: 'NM', name: 'New Mexico' },
  { code: 'NY', name: 'New York' },
  { code: 'NC', name: 'North Carolina' },
  { code: 'ND', name: 'North Dakota' },
  { code: 'OH', name: 'Ohio' },
  { code: 'OK', name: 'Oklahoma' },
  { code: 'OR', name: 'Oregon' },
  { code: 'PA', name: 'Pennsylvania' },
  { code: 'RI', name: 'Rhode Island' },
  { code: 'SC', name: 'South Carolina' },
  { code: 'SD', name: 'South Dakota' },
  { code: 'TN', name: 'Tennessee' },
  { code: 'TX', name: 'Texas' },
  { code: 'UT', name: 'Utah' },
  { code: 'VT', name: 'Vermont' },
  { code: 'VA', name: 'Virginia' },
  { code: 'WA', name: 'Washington' },
  { code: 'WV', name: 'West Virginia' },
  { code: 'WI', name: 'Wisconsin' },
  { code: 'WY', name: 'Wyoming' },
  { code: 'DC', name: 'District of Columbia' },
] as const;

export const CONSENT_FLOW_VERSION = '1.0';
