/**
 * Expo Config Plugin: Widget Version Sync
 *
 * Reliable EAS approach:
 * - Keep widget Info.plist using $(CURRENT_PROJECT_VERSION) / $(MARKETING_VERSION)
 * - Remove widget target overrides so it inherits the app/project build settings
 *
 * This avoids race conditions with EAS autoIncrement (remote) because the
 * widget target simply inherits the same build settings Xcode uses for the app.
 */

const { withXcodeProject } = require('@expo/config-plugins');

const withWidgetVersionSync = (config) => {
    config = withXcodeProject(config, async (config) => {
        const xcodeProject = config.modResults;

        // Find the widget target
        const targets = xcodeProject.pbxNativeTargetSection();
        let widgetTargetKey = null;

        for (const [key, target] of Object.entries(targets)) {
            if (target && typeof target === 'object' && target.name === 'widget') {
                widgetTargetKey = key;
                break;
            }
        }

        if (!widgetTargetKey) {
            console.log('[withWidgetVersionSync] Widget target not found');
            return config;
        }

        const target = targets[widgetTargetKey];
        const configListKey = target.buildConfigurationList;
        const configList = xcodeProject.pbxXCConfigurationList()[configListKey];
        const buildConfigs = xcodeProject.pbxXCBuildConfigurationSection();

        if (!configList || !configList.buildConfigurations) {
            console.log('[withWidgetVersionSync] Widget build configurations not found');
            return config;
        }

        for (const configRef of configList.buildConfigurations) {
            const configKey = configRef.value;
            const buildConfig = buildConfigs[configKey];
            if (!buildConfig || !buildConfig.buildSettings) {
                continue;
            }

            // Remove overrides so the widget inherits project/app build settings
            if (Object.prototype.hasOwnProperty.call(buildConfig.buildSettings, 'CURRENT_PROJECT_VERSION')) {
                delete buildConfig.buildSettings.CURRENT_PROJECT_VERSION;
            }
            if (Object.prototype.hasOwnProperty.call(buildConfig.buildSettings, 'MARKETING_VERSION')) {
                delete buildConfig.buildSettings.MARKETING_VERSION;
            }
        }

        console.log('[withWidgetVersionSync] Widget target now inherits app build settings');
        return config;
    });

    return config;
};

module.exports = withWidgetVersionSync;
