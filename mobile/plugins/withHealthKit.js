/**
 * Expo Config Plugin: withHealthKit
 * 
 * This plugin configures the iOS project for HealthKit access:
 * 1. Adds HealthKit capability to entitlements
 * 2. Adds required usage description to Info.plist
 * 3. Enables HealthKit in background modes (if requested)
 */

const { withEntitlementsPlist, withInfoPlist } = require('@expo/config-plugins');

/**
 * Add HealthKit capability to iOS entitlements
 */
function withHealthKitEntitlements(config, { backgroundDelivery = false } = {}) {
  return withEntitlementsPlist(config, (config) => {
    // Enable HealthKit
    config.modResults['com.apple.developer.healthkit'] = true;

    // Set HealthKit access types
    // This enables clinical health records access if needed
    config.modResults['com.apple.developer.healthkit.access'] = [];

    // Enable background delivery if requested
    if (backgroundDelivery) {
      config.modResults['com.apple.developer.healthkit.background-delivery'] = true;
    }

    return config;
  });
}

/**
 * Add HealthKit usage descriptions to Info.plist
 */
function withHealthKitInfoPlist(config, { usageDescription, updateDescription } = {}) {
  return withInfoPlist(config, (config) => {
    // Required: Why you need to read health data
    config.modResults.NSHealthShareUsageDescription =
      usageDescription ||
      'LumiMD reads your health data to provide a comprehensive view of your health alongside your medical visits and medications.';

    // Optional: Why you need to write health data (we don't write, but good to have)
    config.modResults.NSHealthUpdateUsageDescription =
      updateDescription ||
      'LumiMD may record health observations from your medical visits.';

    // Add HealthKit to UIRequiredDeviceCapabilities if needed
    // Note: This would require HealthKit to be available, which excludes some iPads
    // We'll leave this optional and check at runtime instead

    return config;
  });
}

/**
 * Main plugin entry point
 * 
 * Options:
 * - usageDescription: Custom description for reading health data
 * - updateDescription: Custom description for writing health data
 * - backgroundDelivery: Enable background health data delivery (default: false)
 */
function withHealthKit(config, options = {}) {
  const {
    usageDescription,
    updateDescription,
    backgroundDelivery = false,
  } = options;

  // Add entitlements
  config = withHealthKitEntitlements(config, { backgroundDelivery });

  // Add Info.plist entries
  config = withHealthKitInfoPlist(config, { usageDescription, updateDescription });

  return config;
}

module.exports = withHealthKit;
