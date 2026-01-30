/**
 * Location Module
 * Exports for location services and consent constants
 */

export {
  TWO_PARTY_CONSENT_STATES,
  US_STATES,
  CONSENT_FLOW_VERSION,
  requiresTwoPartyConsent,
  type TwoPartyConsentState,
  type StateSource,
  type ConsentSettings,
  type ConsentRecord,
} from './constants';

export { useLocation, type UseLocationResult } from './useLocation';

export {
  getStateFromCoordinates,
  type GeocodingResult,
} from './geocoding';
