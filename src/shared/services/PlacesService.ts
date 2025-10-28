import axios from 'axios';
import * as Location from 'expo-location';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

export interface HealthcareFacility {
  place_id: string;
  name: string;
  vicinity?: string;
  formatted_address?: string;
  geometry: {
    location: {
      lat: number;
      lng: number;
    };
  };
  rating?: number;
  user_ratings_total?: number;
  opening_hours?: {
    open_now?: boolean;
  };
  formatted_phone_number?: string;
  website?: string;
  distance?: number; // in meters
  types?: string[];
}

export type FacilityType = 'emergency' | 'urgent_care' | 'primary_care' | 'hospital';

export interface PlacesSearchResult {
  results: HealthcareFacility[];
  status: string;
  facilityType?: string;
  searchRadius?: number;
}

export class PlacesService {
  /**
   * Get user's current location
   */
  static async getCurrentLocation(): Promise<{ latitude: number; longitude: number } | null> {
    try {
      // Request location permissions
      const { status } = await Location.requestForegroundPermissionsAsync();

      if (status !== 'granted') {
        console.error('Location permission denied');
        return null;
      }

      // Get current position
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced
      });

      return {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude
      };
    } catch (error) {
      console.error('Error getting location:', error);
      return null;
    }
  }

  /**
   * Search for nearby healthcare facilities of a specific type
   */
  static async searchNearbyFacilities(
    facilityType: FacilityType,
    userLocation?: { latitude: number; longitude: number }
  ): Promise<PlacesSearchResult> {
    try {
      // Get location if not provided
      let location = userLocation;
      if (!location) {
        location = await this.getCurrentLocation();
        if (!location) {
          throw new Error('Unable to get user location');
        }
      }

      console.log(`PlacesService: Searching for ${facilityType} near ${location.latitude},${location.longitude}`);

      // Call backend API
      const response = await axios.get(`${API_BASE_URL}/api/places/nearby`, {
        params: {
          latitude: location.latitude,
          longitude: location.longitude,
          facilityType: facilityType
        },
        timeout: 10000 // 10 second timeout
      });

      console.log(`PlacesService: Found ${response.data.results.length} facilities`);

      return response.data;
    } catch (error) {
      console.error('Error searching facilities:', error);
      throw error;
    }
  }

  /**
   * Get detailed information about a specific facility
   */
  static async getFacilityDetails(placeId: string): Promise<HealthcareFacility> {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/places/details/${placeId}`, {
        timeout: 10000
      });

      return response.data.result;
    } catch (error) {
      console.error('Error getting facility details:', error);
      throw error;
    }
  }

  /**
   * Get directions to a facility
   */
  static async getDirections(
    origin: { latitude: number; longitude: number },
    destination: { latitude: number; longitude: number },
    mode: 'driving' | 'walking' | 'transit' = 'driving'
  ) {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/places/directions`, {
        params: {
          origin: `${origin.latitude},${origin.longitude}`,
          destination: `${destination.latitude},${destination.longitude}`,
          mode: mode
        },
        timeout: 10000
      });

      return response.data;
    } catch (error) {
      console.error('Error getting directions:', error);
      throw error;
    }
  }

  /**
   * Format distance for display in miles
   */
  static formatDistance(meters: number): string {
    const miles = meters / 1609.34; // Convert meters to miles

    if (miles < 0.1) {
      return `${Math.round(meters * 3.281)}ft`; // Show feet for very short distances
    } else if (miles < 10) {
      return `${miles.toFixed(1)} mi`;
    } else {
      return `${Math.round(miles)} mi`;
    }
  }

  /**
   * Map triage level to facility type
   */
  static triageLevelToFacilityType(triageLevel: string): FacilityType {
    switch (triageLevel.toLowerCase()) {
      case 'emergency':
        return 'emergency';
      case 'urgent_care':
        return 'urgent_care';
      case 'primary_care':
      case 'telehealth':
      case 'self_care':
      default:
        return 'primary_care';
    }
  }

  /**
   * Open phone dialer with facility phone number
   */
  static callFacility(phoneNumber: string) {
    const cleanNumber = phoneNumber.replace(/[^\d+]/g, '');
    const url = `tel:${cleanNumber}`;
    // In React Native, you would use Linking.openURL(url)
    console.log('Opening phone dialer:', url);
  }

  /**
   * Open maps app with directions
   */
  static openDirections(facility: HealthcareFacility) {
    const lat = facility.geometry.location.lat;
    const lng = facility.geometry.location.lng;
    const label = encodeURIComponent(facility.name);

    // Universal maps URL that works on both iOS and Android
    const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&destination_place_id=${facility.place_id}`;

    console.log('Opening maps:', url);
    // In React Native, you would use Linking.openURL(url)
  }
}
