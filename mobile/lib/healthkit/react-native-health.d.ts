/**
 * Type declarations for react-native-health
 * 
 * This library provides access to Apple HealthKit on iOS.
 * See: https://github.com/agencyenterprise/react-native-health
 */

declare module 'react-native-health' {
  export interface HealthKitPermissions {
    [key: string]: boolean;
  }

  export interface HealthInputOptions {
    permissions: {
      read: string[];
      write: string[];
    };
  }

  export interface QueryOptions {
    startDate: string;
    endDate: string;
    limit?: number;
    ascending?: boolean;
    includeManuallyAdded?: boolean;
  }

  export interface HealthValue {
    id?: string;
    value: number;
    startDate: string;
    endDate: string;
    sourceName?: string;
    sourceId?: string;
  }

  export interface BloodPressureValue {
    id?: string;
    bloodPressureSystolicValue: number;
    bloodPressureDiastolicValue: number;
    startDate: string;
    endDate: string;
    sourceName?: string;
    sourceId?: string;
  }

  export interface SleepValue {
    id?: string;
    value: string;
    startDate: string;
    endDate: string;
    sourceName?: string;
    sourceId?: string;
  }

  export type HealthCallback<T> = (err: string | null, result: T) => void;

  export interface AppleHealthKitModule {
    isAvailable: (callback: HealthCallback<boolean>) => void;
    initHealthKit: (options: HealthInputOptions, callback: HealthCallback<void>) => void;
    getAuthStatus: (
      options: HealthInputOptions,
      callback: HealthCallback<{ permissions: { read: string[] } }>
    ) => void;
    getWeightSamples: (options: QueryOptions, callback: HealthCallback<HealthValue[]>) => void;
    getHeartRateSamples: (options: QueryOptions, callback: HealthCallback<HealthValue[]>) => void;
    getBloodPressureSamples: (options: QueryOptions, callback: HealthCallback<BloodPressureValue[]>) => void;
    getBloodGlucoseSamples: (options: QueryOptions, callback: HealthCallback<HealthValue[]>) => void;
    getOxygenSaturationSamples: (options: QueryOptions, callback: HealthCallback<HealthValue[]>) => void;
    getBodyTemperatureSamples: (options: QueryOptions, callback: HealthCallback<HealthValue[]>) => void;
    getDailyStepCountSamples: (options: QueryOptions, callback: HealthCallback<HealthValue[]>) => void;
    getSleepSamples: (options: QueryOptions, callback: HealthCallback<SleepValue[]>) => void;
  }

  const AppleHealthKit: AppleHealthKitModule;
  export default AppleHealthKit;
  export const HealthKitPermissions: HealthKitPermissions;
}
