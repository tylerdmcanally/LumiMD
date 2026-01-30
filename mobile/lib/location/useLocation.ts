/**
 * useLocation Hook
 * Manages device location services and state detection
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getStateFromCoordinates, GeocodingResult } from './geocoding';
import { StateSource } from './constants';

const LOCATION_CACHE_KEY = 'lumimd:userLocation';
const LOCATION_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const FOREGROUND_REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

interface CachedLocation {
  stateCode: string | null;
  stateSource: StateSource;
  timestamp: number;
  isUSLocation: boolean;
}

export interface UseLocationResult {
  // State
  stateCode: string | null;
  stateSource: StateSource | null;
  isUSLocation: boolean | null;
  isLoading: boolean;
  error: string | null;

  // Permission
  hasPermission: boolean | null;
  permissionStatus: Location.PermissionStatus | null;

  // Actions
  requestPermission: () => Promise<boolean>;
  refreshLocation: () => Promise<void>;
  setManualState: (stateCode: string) => Promise<void>;
  clearManualState: () => Promise<void>;
}

export function useLocation(): UseLocationResult {
  const [stateCode, setStateCode] = useState<string | null>(null);
  const [stateSource, setStateSource] = useState<StateSource | null>(null);
  const [isUSLocation, setIsUSLocation] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [permissionStatus, setPermissionStatus] =
    useState<Location.PermissionStatus | null>(null);
  const lastRefreshTime = useRef<number>(0);
  const stateSourceRef = useRef<StateSource | null>(null);

  // Keep ref in sync with state for use in callbacks
  useEffect(() => {
    stateSourceRef.current = stateSource;
  }, [stateSource]);

  // Load cached location and check permissions on mount
  useEffect(() => {
    initializeLocation();
  }, []);

  // Refresh location when app comes to foreground (if using device location)
  useEffect(() => {
    const handleAppStateChange = async (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        const timeSinceLastRefresh = Date.now() - lastRefreshTime.current;
        const shouldRefresh = 
          stateSourceRef.current === 'location' && 
          timeSinceLastRefresh > FOREGROUND_REFRESH_INTERVAL_MS;

        if (shouldRefresh) {
          console.log('[Location] App foregrounded, refreshing location...');
          await refreshLocationInternal();
        }
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, []);

  const initializeLocation = async () => {
    try {
      // First, check current permission status
      const { status } = await Location.getForegroundPermissionsAsync();
      const permitted = status === Location.PermissionStatus.GRANTED;
      setHasPermission(permitted);
      setPermissionStatus(status);
      console.log('[Location] Permission status on mount:', status);

      // Then load cached location
      const cached = await AsyncStorage.getItem(LOCATION_CACHE_KEY);
      if (cached) {
        const data: CachedLocation = JSON.parse(cached);
        const isExpired = Date.now() - data.timestamp > LOCATION_CACHE_TTL_MS;

        // Always use manual state
        if (data.stateSource === 'manual') {
          setStateCode(data.stateCode);
          setStateSource(data.stateSource);
          setIsUSLocation(data.isUSLocation);
          lastRefreshTime.current = data.timestamp;
          console.log('[Location] Loaded manual state:', data.stateCode);
        }
        // Only use location-based cache if permission is still granted and not expired
        else if (permitted && !isExpired) {
          setStateCode(data.stateCode);
          setStateSource(data.stateSource);
          setIsUSLocation(data.isUSLocation);
          lastRefreshTime.current = data.timestamp;
          console.log('[Location] Loaded cached location state:', data.stateCode);
        }
        // Permission denied but had location-based cache - clear it
        else if (!permitted && data.stateSource === 'location') {
          console.log('[Location] Permission denied, clearing location cache');
          await AsyncStorage.removeItem(LOCATION_CACHE_KEY);
          setStateCode(null);
          setStateSource(null);
          setIsUSLocation(null);
        }
      }
    } catch (err) {
      console.error('[Location] Error initializing:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const saveLocationCache = async (
    code: string | null,
    source: StateSource,
    isUS: boolean
  ) => {
    try {
      const data: CachedLocation = {
        stateCode: code,
        stateSource: source,
        timestamp: Date.now(),
        isUSLocation: isUS,
      };
      await AsyncStorage.setItem(LOCATION_CACHE_KEY, JSON.stringify(data));
    } catch (err) {
      console.error('[Location] Error saving cache:', err);
    }
  };

  const checkPermission = async (): Promise<boolean> => {
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      const granted = status === Location.PermissionStatus.GRANTED;
      setHasPermission(granted);
      setPermissionStatus(status);
      return granted;
    } catch (err) {
      console.error('[Location] Permission check error:', err);
      setHasPermission(false);
      return false;
    }
  };

  const requestPermission = useCallback(async (): Promise<boolean> => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      const granted = status === Location.PermissionStatus.GRANTED;
      setHasPermission(granted);
      setPermissionStatus(status);

      if (granted) {
        // Automatically fetch location after permission granted
        await refreshLocation();
      }

      return granted;
    } catch (err) {
      console.error('[Location] Permission request error:', err);
      setHasPermission(false);
      return false;
    }
  }, []);

  const refreshLocationInternal = async (): Promise<void> => {
    // Don't override manual selection
    if (stateSourceRef.current === 'manual') {
      console.log('[Location] Skipping refresh - manual state set');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const permitted = await checkPermission();
      if (!permitted) {
        setError('Location permission not granted');
        setIsLoading(false);
        return;
      }

      console.log('[Location] Fetching current position...');
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Low, // Coarse location is sufficient
      });

      const result: GeocodingResult = await getStateFromCoordinates(
        position.coords.latitude,
        position.coords.longitude
      );

      setStateCode(result.stateCode);
      setStateSource('location');
      setIsUSLocation(result.isUSLocation);
      lastRefreshTime.current = Date.now();

      await saveLocationCache(result.stateCode, 'location', result.isUSLocation);

      console.log('[Location] Updated state:', result.stateCode);
    } catch (err: any) {
      console.error('[Location] Refresh error:', err);
      setError(err.message || 'Failed to get location');
    } finally {
      setIsLoading(false);
    }
  };

  const refreshLocation = useCallback(async (): Promise<void> => {
    await refreshLocationInternal();
  }, []);

  const setManualState = useCallback(async (code: string): Promise<void> => {
    const upperCode = code.toUpperCase();
    setStateCode(upperCode);
    setStateSource('manual');
    setIsUSLocation(true); // Manual selection assumes US
    await saveLocationCache(upperCode, 'manual', true);
    console.log('[Location] Manual state set:', upperCode);
  }, []);

  const clearManualState = useCallback(async (): Promise<void> => {
    // Update both state and ref immediately
    setStateSource(null);
    stateSourceRef.current = null;
    await AsyncStorage.removeItem(LOCATION_CACHE_KEY);
    // Refresh from device location
    await refreshLocationInternal();
  }, []);

  return {
    stateCode,
    stateSource,
    isUSLocation,
    isLoading,
    error,
    hasPermission,
    permissionStatus,
    requestPermission,
    refreshLocation,
    setManualState,
    clearManualState,
  };
}
