import AsyncStorage from '@react-native-async-storage/async-storage';
import { LocationService, LocationCoordinates } from './LocationService';

export interface ConsentRequirements {
  isOnePartyState: boolean;
  stateName: string;
  requiresAdditionalConsent: boolean;
  consentMessage: string;
  legalNote: string;
}

export interface ConsentRecord {
  id: string;
  userId: string;
  visitDate: Date;
  location: LocationCoordinates;
  state: string;
  consentType: 'one_party' | 'two_party';
  userConsented: boolean;
  additionalPartyConsented?: boolean;
  consentTimestamp: Date;
  ipAddress?: string;
  deviceId: string;
}

export class ConsentService {
  // One-party consent states (where only one party needs to consent to recording)
  private static onePartyStates = new Set([
    'AL', 'AK', 'AZ', 'AR', 'CO', 'DC', 'GA', 'HI', 'ID', 'IN', 'IA', 'KS',
    'KY', 'LA', 'ME', 'MN', 'MS', 'MO', 'NE', 'NV', 'NJ', 'NM', 'NY', 'NC',
    'ND', 'OH', 'OK', 'OR', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA',
    'WV', 'WI', 'WY'
  ]);

  // Two-party consent states (where all parties must consent to recording)
  private static twoPartyStates = new Set([
    'CA', 'CT', 'DE', 'FL', 'IL', 'MD', 'MA', 'MI', 'MT', 'NH', 'PA', 'WA'
  ]);

  /**
   * Get consent requirements based on user's current location
   */
  static async getConsentRequirements(
    coordinates?: LocationCoordinates
  ): Promise<ConsentRequirements> {
    try {
      let currentLocation: LocationCoordinates | null | undefined = coordinates;

      // Get current location if not provided
      if (!currentLocation) {
        currentLocation = await LocationService.getCurrentLocation();
      }

      if (!currentLocation) {
        // Default to most restrictive (two-party) if location unavailable
        return this.getDefaultTwoPartyConsent();
      }

      // Get state from coordinates
      const locationInfo = await LocationService.reverseGeocode(currentLocation);

      if (!locationInfo?.state) {
        return this.getDefaultTwoPartyConsent();
      }

      const stateCode = this.getStateCode(locationInfo.state);
      const isOneParty = this.onePartyStates.has(stateCode);

      return {
        isOnePartyState: isOneParty,
        stateName: locationInfo.state,
        requiresAdditionalConsent: !isOneParty,
        consentMessage: this.getConsentMessage(isOneParty, locationInfo.state),
        legalNote: this.getLegalNote(isOneParty, stateCode)
      };

    } catch (error) {
      console.error('Error determining consent requirements:', error);
      return this.getDefaultTwoPartyConsent();
    }
  }

  /**
   * Record user consent for visit recording
   */
  static async recordConsent(
    userId: string,
    visitLocation: LocationCoordinates,
    userConsented: boolean,
    additionalPartyConsented?: boolean
  ): Promise<ConsentRecord> {
    const consentRequirements = await this.getConsentRequirements(visitLocation);

    const consentRecord: ConsentRecord = {
      id: `consent_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId,
      visitDate: new Date(),
      location: visitLocation,
      state: consentRequirements.stateName,
      consentType: consentRequirements.isOnePartyState ? 'one_party' : 'two_party',
      userConsented,
      additionalPartyConsented,
      consentTimestamp: new Date(),
      deviceId: this.generateDeviceId()
    };

    // In production, this would be stored in encrypted database
    await this.storeConsentRecord(consentRecord);

    return consentRecord;
  }

  /**
   * Validate if recording is legally permitted
   */
  static validateRecordingPermission(consentRecord: ConsentRecord): boolean {
    // User must always consent
    if (!consentRecord.userConsented) {
      return false;
    }

    // For two-party states, additional party must also consent
    if (consentRecord.consentType === 'two_party') {
      return consentRecord.additionalPartyConsented === true;
    }

    // One-party states only require user consent
    return true;
  }

  /**
   * Get appropriate consent message based on state laws
   */
  private static getConsentMessage(isOneParty: boolean, stateName: string): string {
    if (isOneParty) {
      return `You are located in ${stateName}, which allows one-party consent recording. By proceeding, you consent to recording this medical visit for your personal health records. The recording will be encrypted and stored securely.`;
    } else {
      return `You are located in ${stateName}, which requires all parties to consent to recording. Before starting the recording, please inform your healthcare provider and obtain their verbal consent to record this visit for your personal health records.`;
    }
  }

  /**
   * Get legal disclaimer based on state
   */
  private static getLegalNote(isOneParty: boolean, stateCode: string): string {
    const baseNote = "This recording is for your personal health records only. Do not share without proper authorization.";

    if (isOneParty) {
      return `${baseNote} Recording laws in ${stateCode} permit one-party consent recording for personal use.`;
    } else {
      return `${baseNote} Recording laws in ${stateCode} require consent from all parties. Ensure you have obtained proper consent before recording.`;
    }
  }

  /**
   * Default to most restrictive consent requirements
   */
  private static getDefaultTwoPartyConsent(): ConsentRequirements {
    return {
      isOnePartyState: false,
      stateName: 'Unknown Location',
      requiresAdditionalConsent: true,
      consentMessage: 'Location could not be determined. For legal compliance, please obtain consent from all parties before recording this medical visit.',
      legalNote: 'When in doubt, always obtain consent from all parties before recording. This ensures compliance with all state recording laws.'
    };
  }

  /**
   * Convert state name to standard two-letter code
   */
  private static getStateCode(stateName: string): string {
    const stateMap: { [key: string]: string } = {
      'Alabama': 'AL', 'Alaska': 'AK', 'Arizona': 'AZ', 'Arkansas': 'AR',
      'California': 'CA', 'Colorado': 'CO', 'Connecticut': 'CT', 'Delaware': 'DE',
      'Florida': 'FL', 'Georgia': 'GA', 'Hawaii': 'HI', 'Idaho': 'ID',
      'Illinois': 'IL', 'Indiana': 'IN', 'Iowa': 'IA', 'Kansas': 'KS',
      'Kentucky': 'KY', 'Louisiana': 'LA', 'Maine': 'ME', 'Maryland': 'MD',
      'Massachusetts': 'MA', 'Michigan': 'MI', 'Minnesota': 'MN', 'Mississippi': 'MS',
      'Missouri': 'MO', 'Montana': 'MT', 'Nebraska': 'NE', 'Nevada': 'NV',
      'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY',
      'North Carolina': 'NC', 'North Dakota': 'ND', 'Ohio': 'OH', 'Oklahoma': 'OK',
      'Oregon': 'OR', 'Pennsylvania': 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC',
      'South Dakota': 'SD', 'Tennessee': 'TN', 'Texas': 'TX', 'Utah': 'UT',
      'Vermont': 'VT', 'Virginia': 'VA', 'Washington': 'WA', 'West Virginia': 'WV',
      'Wisconsin': 'WI', 'Wyoming': 'WY', 'District of Columbia': 'DC'
    };

    return stateMap[stateName] || stateName.toUpperCase().substring(0, 2);
  }

  /**
   * Generate unique device identifier
   */
  private static generateDeviceId(): string {
    return `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Store consent record (in production, this would be encrypted database storage)
   */
  private static async storeConsentRecord(record: ConsentRecord): Promise<void> {
    try {
      const existingRecords = await this.getStoredConsentRecords();
      const updatedRecords = [...existingRecords, record];
      await AsyncStorage.setItem('lumimd_consent_records', JSON.stringify(updatedRecords));
      console.log('Consent record stored:', record.id);
    } catch (error) {
      console.error('Error storing consent record:', error);
    }
  }

  /**
   * Retrieve stored consent records
   */
  static async getStoredConsentRecords(): Promise<ConsentRecord[]> {
    try {
      const stored = await AsyncStorage.getItem('lumimd_consent_records');
      return stored ? (JSON.parse(stored) as ConsentRecord[]) : [];
    } catch (error) {
      console.error('Error retrieving consent records:', error);
      return [];
    }
  }

  /**
   * Get consent history for a user
   */
  static async getUserConsentHistory(userId: string): Promise<ConsentRecord[]> {
    const allRecords = await this.getStoredConsentRecords();
    return allRecords.filter((record) => record.userId === userId);
  }
}
