import * as Location from 'expo-location';
import { Alert } from 'react-native';

export interface LocationCoordinates {
  latitude: number;
  longitude: number;
}

export interface LocationInfo {
  coordinates: LocationCoordinates;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
}

export class LocationService {
  private static googleApiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
  private static backendUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

  /**
   * Get user's current location with permission handling
   */
  static async getCurrentLocation(): Promise<LocationCoordinates | null> {
    try {
      // Request permission
      const { status } = await Location.requestForegroundPermissionsAsync();

      if (status !== 'granted') {
        Alert.alert(
          'Location Permission',
          'Please enable location services to find nearby healthcare providers.'
        );
        return null;
      }

      // Get current location
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      return {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      };
    } catch (error) {
      console.error('Error getting location:', error);
      Alert.alert(
        'Location Error',
        'Unable to get your current location. Please enter your ZIP code manually.'
      );
      return null;
    }
  }

  /**
   * Convert coordinates to address using Google Geocoding API (via backend proxy)
   */
  static async reverseGeocode(coordinates: LocationCoordinates): Promise<LocationInfo | null> {
    try {
      const { latitude, longitude } = coordinates;
      const response = await fetch(
        `${this.backendUrl}/api/places/reverse-geocode?latitude=${latitude}&longitude=${longitude}`
      );

      if (!response.ok) {
        throw new Error(`Geocoding API error: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.status !== 'OK' || !data.results.length) {
        throw new Error(`Geocoding failed: ${data.status}`);
      }

      const result = data.results[0];
      const addressComponents = result.address_components;

      const locationInfo: LocationInfo = {
        coordinates,
        address: result.formatted_address,
        city: this.extractAddressComponent(addressComponents, 'locality') || '',
        state: this.extractAddressComponent(addressComponents, 'administrative_area_level_1') || '',
        zipCode: this.extractAddressComponent(addressComponents, 'postal_code') || '',
        country: this.extractAddressComponent(addressComponents, 'country') || '',
      };

      return locationInfo;
    } catch (error) {
      console.warn('Reverse geocoding unavailable:', error);
      return null;
    }
  }

  /**
   * Convert address/ZIP code to coordinates
   */
  static async geocodeAddress(address: string): Promise<LocationCoordinates | null> {
    try {
      const encodedAddress = encodeURIComponent(address);
      const response = await fetch(
        `${this.backendUrl}/api/places/geocode?address=${encodedAddress}`
      );

      if (!response.ok) {
        throw new Error(`Geocoding API error: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.status !== 'OK' || !data.results.length) {
        throw new Error(`Geocoding failed: ${data.status}`);
      }

      const result = data.results[0];
      const { lat, lng } = result.geometry.location;

      return {
        latitude: lat,
        longitude: lng,
      };
    } catch (error) {
      console.error('Geocoding error:', error);
      return null;
    }
  }

  /**
   * Calculate distance between two points using Haversine formula
   */
  static calculateDistance(
    point1: LocationCoordinates,
    point2: LocationCoordinates,
    unit: 'miles' | 'kilometers' = 'miles'
  ): number {
    const R = unit === 'miles' ? 3959 : 6371; // Earth's radius
    const dLat = this.toRadians(point2.latitude - point1.latitude);
    const dLon = this.toRadians(point2.longitude - point1.longitude);

    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(point1.latitude)) *
      Math.cos(this.toRadians(point2.latitude)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * Get ZIP code from current location
   */
  static async getCurrentZipCode(): Promise<string | null> {
    try {
      const coordinates = await this.getCurrentLocation();
      if (!coordinates) return null;

      const locationInfo = await this.reverseGeocode(coordinates);
      return locationInfo?.zipCode || null;
    } catch (error) {
      console.error('Error getting current ZIP code:', error);
      return null;
    }
  }

  /**
   * Check if location services are available
   */
  static async isLocationServicesEnabled(): Promise<boolean> {
    try {
      return await Location.hasServicesEnabledAsync();
    } catch (error) {
      console.error('Error checking location services:', error);
      return false;
    }
  }

  /**
   * Get location permissions status
   */
  static async getLocationPermissionStatus(): Promise<'granted' | 'denied' | 'undetermined'> {
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      return status;
    } catch (error) {
      console.error('Error getting location permission status:', error);
      return 'undetermined';
    }
  }

  /**
   * Format distance for display
   */
  static formatDistance(distance: number, unit: 'miles' | 'kilometers' = 'miles'): string {
    const unitLabel = unit === 'miles' ? 'mi' : 'km';

    if (distance < 0.1) {
      return `<0.1 ${unitLabel}`;
    }

    if (distance < 10) {
      return `${distance.toFixed(1)} ${unitLabel}`;
    }

    return `${Math.round(distance)} ${unitLabel}`;
  }

  // Private helper methods
  private static toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  private static extractAddressComponent(
    components: any[],
    type: string
  ): string | null {
    const component = components.find(comp => comp.types.includes(type));
    return component ? component.long_name : null;
  }

  /**
   * Get nearby places using Google Places API (if needed for enhanced provider search)
   */
  static async getNearbyHealthcareFacilities(
    coordinates: LocationCoordinates,
    radius: number = 25000, // 25km default
    type: 'hospital' | 'doctor' | 'pharmacy' | 'health' | 'urgent_care' | 'clinic' | 'walk_in_clinic' = 'health'
  ): Promise<any[] | null> {
    try {
      console.log(`LocationService: Searching for nearby ${type} facilities`);
      console.log(`LocationService: Coordinates: ${coordinates.latitude}, ${coordinates.longitude}`);
      console.log(`LocationService: Radius: ${radius} meters`);

      const { latitude, longitude } = coordinates;

      // Map urgent care types to Google Places search terms
      let searchType = type;
      if (type === 'urgent_care' || type === 'walk_in_clinic') {
        searchType = 'doctor'; // Google doesn't have specific urgent_care type
      }

      const url = `${this.backendUrl}/api/places/nearby?latitude=${latitude}&longitude=${longitude}&radius=${radius}&type=${searchType}`;
      console.log(`LocationService: Making API call to backend: ${url}`);

      const response = await fetch(url);

      if (!response.ok) {
        console.error(`LocationService: HTTP error: ${response.status} ${response.statusText}`);
        throw new Error(`Places API error: ${response.statusText}`);
      }

      const data = await response.json();
      console.log(`LocationService: API response status: ${data.status}`);

      if (data.status === 'ZERO_RESULTS') {
        console.log('LocationService: No results found in this area');
        return [];
      }

      if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
        console.error(`LocationService: Places API failed with status: ${data.status}`);
        if (data.error || data.message) {
          console.error(`LocationService: Error message: ${data.error || data.message}`);
        }
        throw new Error(`Places API failed: ${data.status}`);
      }

      const results = data.results || [];
      console.log(`LocationService: Found ${results.length} results`);

      // Log first result for debugging
      if (results.length > 0) {
        console.log('LocationService: First result sample:', {
          name: results[0].name,
          vicinity: results[0].vicinity,
          types: results[0].types,
          rating: results[0].rating
        });
      }

      return results;
    } catch (error) {
      console.error('LocationService: Places API error:', error);
      return null;
    }
  }

  /**
   * Get detailed information for a specific place using Google Places Details API
   */
  static async getPlaceDetails(placeId: string): Promise<any | null> {
    try {
      const response = await fetch(
        `${this.backendUrl}/api/places/details/${placeId}`
      );

      if (!response.ok) {
        throw new Error(`Places Details API error: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.status !== 'OK') {
        console.log(`Places Details API failed for ${placeId}: ${data.status}`);
        return null;
      }

      return data.result || null;
    } catch (error) {
      console.error('Places Details API error:', error);
      return null;
    }
  }

  /**
   * Get directions between two points (for future navigation features)
   */
  static async getDirections(
    origin: LocationCoordinates,
    destination: LocationCoordinates,
    mode: 'driving' | 'walking' | 'transit' = 'driving'
  ): Promise<any | null> {
    try {
      if (!this.googleApiKey) {
        console.warn('Google API key not configured');
        return null;
      }

      const originStr = `${origin.latitude},${origin.longitude}`;
      const destinationStr = `${destination.latitude},${destination.longitude}`;

      const response = await fetch(
        `https://maps.googleapis.com/maps/api/directions/json?origin=${originStr}&destination=${destinationStr}&mode=${mode}&key=${this.googleApiKey}`
      );

      if (!response.ok) {
        throw new Error(`Directions API error: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.status !== 'OK') {
        throw new Error(`Directions API failed: ${data.status}`);
      }

      return data;
    } catch (error) {
      console.error('Directions API error:', error);
      return null;
    }
  }
}
