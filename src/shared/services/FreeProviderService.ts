import { Provider, Location } from '@/shared/types';

export class FreeProviderService {
  // CMS NPI Registry API - Completely Free
  private static NPI_BASE_URL = 'https://npiregistry.cms.hhs.gov/api';

  // NIH Clinical Tables API - Free alternative
  private static NIH_BASE_URL = 'https://clinicaltables.nlm.nih.gov/api/npi_org/v3/search';

  // CMS Marketplace API - Free with registration
  private static CMS_MARKETPLACE_URL = 'https://marketplace.api.healthcare.gov/api/v1';

  /**
   * Search for healthcare providers using free CMS NPI Registry
   */
  static async searchProviders(
    specialty: string,
    zipCode: string,
    radius: number = 25,
    limit: number = 20
  ): Promise<{ success: boolean; providers?: Provider[]; error?: string }> {
    try {
      // Build search parameters
      const params = new URLSearchParams({
        version: '2.1',
        limit: limit.toString(),
        skip: '0',
        pretty: 'true',
        use_first_line_business_address: 'true',
      });

      // Add location filter
      if (zipCode) {
        params.append('postal_code', zipCode);
      }

      // Add specialty filter using taxonomy codes
      const taxonomyCode = this.getTaxonomyCode(specialty);
      if (taxonomyCode) {
        params.append('taxonomy_description', specialty);
      }

      const response = await fetch(`${this.NPI_BASE_URL}/?${params.toString()}`);

      if (!response.ok) {
        throw new Error(`NPI API error: ${response.statusText}`);
      }

      const data = await response.json();
      const providers = this.transformNPIResults(data.results || []);

      return { success: true, providers };
    } catch (error) {
      console.error('Provider search error:', error);
      return {
        success: false,
        error: 'Provider search temporarily unavailable. Please try again later.'
      };
    }
  }

  /**
   * Enhanced provider search using NIH Clinical Tables API
   */
  static async searchProvidersEnhanced(
    searchTerm: string,
    maxResults: number = 20
  ): Promise<{ success: boolean; providers?: Provider[]; error?: string }> {
    try {
      const params = new URLSearchParams({
        terms: searchTerm,
        maxList: maxResults.toString(),
        ef: 'word_synonyms,npi,addresses'
      });

      const response = await fetch(`${this.NIH_BASE_URL}?${params.toString()}`);

      if (!response.ok) {
        throw new Error(`NIH API error: ${response.statusText}`);
      }

      const data = await response.json();
      const providers = this.transformNIHResults(data);

      return { success: true, providers };
    } catch (error) {
      console.error('Enhanced provider search error:', error);
      return {
        success: false,
        error: 'Enhanced search temporarily unavailable.'
      };
    }
  }

  /**
   * Get provider details by NPI number
   */
  static async getProviderDetails(npiNumber: string): Promise<Provider | null> {
    try {
      const params = new URLSearchParams({
        version: '2.1',
        number: npiNumber,
      });

      const response = await fetch(`${this.NPI_BASE_URL}/?${params.toString()}`);

      if (!response.ok) {
        throw new Error(`NPI API error: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.results && data.results.length > 0) {
        return this.transformNPIResults(data.results)[0];
      }

      return null;
    } catch (error) {
      console.error('Error fetching provider details:', error);
      return null;
    }
  }

  /**
   * Search for insurance plans using marketplace data
   * Note: Requires CMS Marketplace API key
   */
  static async searchInsurancePlans(
    zipCode: string,
    year: number = new Date().getFullYear()
  ): Promise<{ success: boolean; plans?: any[]; error?: string }> {
    try {
      // This would use the CMS Marketplace API
      // For now, return mock data structure
      const mockPlans = this.getMockInsurancePlans(zipCode);

      return { success: true, plans: mockPlans };
    } catch (error) {
      console.error('Insurance plan search error:', error);
      return {
        success: false,
        error: 'Insurance plan search temporarily unavailable.'
      };
    }
  }

  /**
   * Calculate distance between two points (Haversine formula)
   */
  static calculateDistance(
    lat1: number, lon1: number,
    lat2: number, lon2: number
  ): number {
    const R = 3959; // Earth's radius in miles
    const dLat = this.toRadians(lat2 - lat1);
    const dLon = this.toRadians(lon2 - lon1);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(lat1)) * Math.cos(this.toRadians(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private static toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  /**
   * Transform NPI API results to our Provider format
   */
  private static transformNPIResults(results: any[]): Provider[] {
    return results.map((result) => {
      const basic = result.basic;
      const addresses = result.addresses || [];
      const practiceAddress = addresses.find((addr: any) => addr.address_purpose === 'LOCATION') || addresses[0];
      const mailingAddress = addresses.find((addr: any) => addr.address_purpose === 'MAILING') || addresses[0];

      return {
        id: result.number,
        name: this.formatProviderName(basic),
        specialty: this.extractSpecialty(result.taxonomies),
        credentials: this.extractCredentials(basic),
        rating: 0, // Not available in NPI data
        reviewCount: 0,
        location: {
          address: `${practiceAddress?.address_1 || ''} ${practiceAddress?.address_2 || ''}`.trim(),
          city: practiceAddress?.city || '',
          state: practiceAddress?.state || '',
          zipCode: practiceAddress?.postal_code || '',
          coordinates: {
            latitude: 0, // Would need geocoding service
            longitude: 0,
          },
        },
        contact: {
          phone: practiceAddress?.telephone_number || mailingAddress?.telephone_number || '',
          fax: practiceAddress?.fax_number || mailingAddress?.fax_number || '',
        },
        availability: [], // Would need integration with scheduling systems
        acceptedInsurance: [], // Not available in NPI data
        languages: [], // Limited in NPI data
        isInNetwork: false, // Would need cross-reference with insurance data
      };
    });
  }

  private static transformNIHResults(data: any): Provider[] {
    if (!data || !data[3]) return [];

    return data[3].map((result: any, index: number) => ({
      id: result.npi || `nih_${index}`,
      name: data[1][index] || 'Unknown Provider',
      specialty: 'General Practice',
      credentials: [],
      rating: 0,
      reviewCount: 0,
      location: this.parseNIHAddress(result.addresses?.[0]),
      contact: {
        phone: '',
      },
      availability: [],
      acceptedInsurance: [],
      languages: [],
      isInNetwork: false,
    }));
  }

  private static formatProviderName(basic: any): string {
    if (basic.organization_name) {
      return basic.organization_name;
    }

    const parts = [
      basic.first_name,
      basic.middle_name,
      basic.last_name,
      basic.suffix
    ].filter(Boolean);

    return parts.join(' ') || 'Unknown Provider';
  }

  private static extractSpecialty(taxonomies: any[]): string {
    if (!taxonomies || taxonomies.length === 0) {
      return 'General Practice';
    }

    const primary = taxonomies.find(t => t.primary) || taxonomies[0];
    return primary.desc || 'General Practice';
  }

  private static extractCredentials(basic: any): string[] {
    const credentials = [];
    if (basic.credential) {
      credentials.push(basic.credential);
    }
    return credentials;
  }

  private static parseNIHAddress(address: any): Location {
    if (!address) {
      return {
        address: '',
        city: '',
        state: '',
        zipCode: '',
        coordinates: { latitude: 0, longitude: 0 },
      };
    }

    return {
      address: address.address_1 || '',
      city: address.city || '',
      state: address.state || '',
      zipCode: address.postal_code || '',
      coordinates: { latitude: 0, longitude: 0 },
    };
  }

  /**
   * Get taxonomy code for specialty (for more precise searches)
   */
  private static getTaxonomyCode(specialty: string): string | null {
    const taxonomyMap: { [key: string]: string } = {
      'Family Medicine': '207Q00000X',
      'Internal Medicine': '207R00000X',
      'Pediatrics': '208000000X',
      'Emergency Medicine': '207P00000X',
      'Cardiology': '207RC0000X',
      'Dermatology': '207N00000X',
      'Orthopedic Surgery': '207X00000X',
      'General Surgery': '208600000X',
      'Psychiatry': '2084P0800X',
      'Radiology': '2085R0202X',
    };

    return taxonomyMap[specialty] || null;
  }

  /**
   * Mock insurance plans for development
   */
  private static getMockInsurancePlans(zipCode: string): any[] {
    return [
      {
        id: 'plan_1',
        name: 'HealthPlus Silver',
        type: 'PPO',
        monthlyPremium: 350,
        deductible: 2500,
        copayPrimaryCare: 25,
        copaySpecialist: 50,
        copayUrgentCare: 75,
        copayER: 500,
        network: 'Large Network',
        coverage: zipCode,
      },
      {
        id: 'plan_2',
        name: 'Community Health Bronze',
        type: 'HMO',
        monthlyPremium: 280,
        deductible: 5000,
        copayPrimaryCare: 20,
        copaySpecialist: 60,
        copayUrgentCare: 100,
        copayER: 750,
        network: 'Regional Network',
        coverage: zipCode,
      }
    ];
  }
}
