/**
 * Expo Config Plugin: Widget Version Sync
 *
 * Single source of truth: app config (app.json/app.config.js).
 * We set widget target build settings to the same version/build number so the
 * widget's Info.plist variables resolve identically to the parent app.
 */

const { withXcodeProject } = require('@expo/config-plugins');

const withWidgetVersionSync = (config) => {
    const appVersion = config.version || '1.0.0';
    const buildNumber = config.ios?.buildNumber || '1';

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

            buildConfig.buildSettings.CURRENT_PROJECT_VERSION = String(buildNumber);
            buildConfig.buildSettings.MARKETING_VERSION = appVersion;
        }

        console.log(`[withWidgetVersionSync] Widget target set to ${appVersion} (${buildNumber})`);
        return config;
    });

    return config;
};

module.exports = withWidgetVersionSync;
