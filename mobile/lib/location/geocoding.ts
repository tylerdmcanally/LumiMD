/**
 * Reverse Geocoding Utility
 * Converts coordinates to US state code
 */

import * as Location from 'expo-location';

export interface GeocodingResult {
  stateCode: string | null;
  stateName: string | null;
  country: string | null;
  isUSLocation: boolean;
}

/**
 * Get US state code from coordinates using reverse geocoding.
 * Returns null if location is outside the US or geocoding fails.
 */
export async function getStateFromCoordinates(
  latitude: number,
  longitude: number
): Promise<GeocodingResult> {
  try {
    const results = await Location.reverseGeocodeAsync({
      latitude,
      longitude,
    });

    if (!results || results.length === 0) {
      console.log('[Geocoding] No results found');
      return {
        stateCode: null,
        stateName: null,
        country: null,
        isUSLocation: false,
      };
    }

    const location = results[0];
    const country = location.country || location.isoCountryCode;
    const isUSLocation =
      country === 'United States' ||
      country === 'US' ||
      location.isoCountryCode === 'US';

    // expo-location returns region as the state
    const stateCode = location.region
      ? getStateCodeFromName(location.region)
      : null;

    console.log('[Geocoding] Result:', {
      region: location.region,
      stateCode,
      country,
      isUSLocation,
    });

    return {
      stateCode,
      stateName: location.region || null,
      country: country || null,
      isUSLocation,
    };
  } catch (error) {
    console.error('[Geocoding] Error:', error);
    return {
      stateCode: null,
      stateName: null,
      country: null,
      isUSLocation: false,
    };
  }
}

/**
 * Convert state name to two-letter state code.
 * Handles both full names ("California") and abbreviations ("CA").
 */
function getStateCodeFromName(input: string): string | null {
  if (!input) return null;

  const normalized = input.trim().toUpperCase();

  // Check if it's already a state code (2 letters)
  if (normalized.length === 2 && STATE_NAME_TO_CODE[normalized]) {
    return normalized;
  }

  // Look up by full name
  return STATE_NAME_TO_CODE[normalized] || null;
}

const STATE_NAME_TO_CODE: Record<string, string> = {
  ALABAMA: 'AL',
  AL: 'AL',
  ALASKA: 'AK',
  AK: 'AK',
  ARIZONA: 'AZ',
  AZ: 'AZ',
  ARKANSAS: 'AR',
  AR: 'AR',
  CALIFORNIA: 'CA',
  CA: 'CA',
  COLORADO: 'CO',
  CO: 'CO',
  CONNECTICUT: 'CT',
  CT: 'CT',
  DELAWARE: 'DE',
  DE: 'DE',
  FLORIDA: 'FL',
  FL: 'FL',
  GEORGIA: 'GA',
  GA: 'GA',
  HAWAII: 'HI',
  HI: 'HI',
  IDAHO: 'ID',
  ID: 'ID',
  ILLINOIS: 'IL',
  IL: 'IL',
  INDIANA: 'IN',
  IN: 'IN',
  IOWA: 'IA',
  IA: 'IA',
  KANSAS: 'KS',
  KS: 'KS',
  KENTUCKY: 'KY',
  KY: 'KY',
  LOUISIANA: 'LA',
  LA: 'LA',
  MAINE: 'ME',
  ME: 'ME',
  MARYLAND: 'MD',
  MD: 'MD',
  MASSACHUSETTS: 'MA',
  MA: 'MA',
  MICHIGAN: 'MI',
  MI: 'MI',
  MINNESOTA: 'MN',
  MN: 'MN',
  MISSISSIPPI: 'MS',
  MS: 'MS',
  MISSOURI: 'MO',
  MO: 'MO',
  MONTANA: 'MT',
  MT: 'MT',
  NEBRASKA: 'NE',
  NE: 'NE',
  NEVADA: 'NV',
  NV: 'NV',
  'NEW HAMPSHIRE': 'NH',
  NH: 'NH',
  'NEW JERSEY': 'NJ',
  NJ: 'NJ',
  'NEW MEXICO': 'NM',
  NM: 'NM',
  'NEW YORK': 'NY',
  NY: 'NY',
  'NORTH CAROLINA': 'NC',
  NC: 'NC',
  'NORTH DAKOTA': 'ND',
  ND: 'ND',
  OHIO: 'OH',
  OH: 'OH',
  OKLAHOMA: 'OK',
  OK: 'OK',
  OREGON: 'OR',
  OR: 'OR',
  PENNSYLVANIA: 'PA',
  PA: 'PA',
  'RHODE ISLAND': 'RI',
  RI: 'RI',
  'SOUTH CAROLINA': 'SC',
  SC: 'SC',
  'SOUTH DAKOTA': 'SD',
  SD: 'SD',
  TENNESSEE: 'TN',
  TN: 'TN',
  TEXAS: 'TX',
  TX: 'TX',
  UTAH: 'UT',
  UT: 'UT',
  VERMONT: 'VT',
  VT: 'VT',
  VIRGINIA: 'VA',
  VA: 'VA',
  WASHINGTON: 'WA',
  WA: 'WA',
  'WEST VIRGINIA': 'WV',
  WV: 'WV',
  WISCONSIN: 'WI',
  WI: 'WI',
  WYOMING: 'WY',
  WY: 'WY',
  'DISTRICT OF COLUMBIA': 'DC',
  DC: 'DC',
};
