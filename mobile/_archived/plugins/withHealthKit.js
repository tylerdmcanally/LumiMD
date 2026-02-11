/**
 * Expo Config Plugin: withHealthKit
 *
 * Configures iOS HealthKit entitlements + usage descriptions.
 */

const { withEntitlementsPlist, withInfoPlist } = require('@expo/config-plugins');

function withHealthKitEntitlements(config, { backgroundDelivery = false } = {}) {
  return withEntitlementsPlist(config, (modConfig) => {
    modConfig.modResults['com.apple.developer.healthkit'] = true;
    modConfig.modResults['com.apple.developer.healthkit.access'] = [];

    if (backgroundDelivery) {
      modConfig.modResults['com.apple.developer.healthkit.background-delivery'] = true;
    }

    return modConfig;
  });
}

function withHealthKitInfoPlist(config, { usageDescription, updateDescription } = {}) {
  return withInfoPlist(config, (modConfig) => {
    modConfig.modResults.NSHealthShareUsageDescription =
      usageDescription ||
      'LumiMD reads your Apple Health data to keep your health metrics up to date for you and your care team.';

    modConfig.modResults.NSHealthUpdateUsageDescription =
      updateDescription ||
      'LumiMD may write health observations when you explicitly choose to sync them.';

    return modConfig;
  });
}

function withHealthKit(config, options = {}) {
  const { usageDescription, updateDescription, backgroundDelivery = false } = options;

  config = withHealthKitEntitlements(config, { backgroundDelivery });
  config = withHealthKitInfoPlist(config, { usageDescription, updateDescription });

  return config;
}

module.exports = withHealthKit;
