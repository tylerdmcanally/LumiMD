/**
 * Expo Config Plugin: Widget Version Sync
 *
 * Ensures the widget extension's CURRENT_PROJECT_VERSION and MARKETING_VERSION
 * build settings match the parent app's. This is required for iOS app extensions.
 *
 * This plugin modifies the Xcode project to:
 * 1. Read the parent app's version settings
 * 2. Apply the same values to the widget target
 * 
 * Note: This runs during `expo prebuild`. For EAS Build with autoIncrement,
 * a separate sync happens via the Xcode Run Script phase.
 */

const { withXcodeProject, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

// Shell script that syncs versions at Xcode build time (for EAS Build autoIncrement)
const VERSION_SYNC_SCRIPT = `
# Sync widget version with parent app at build time
# This handles EAS Build's autoIncrement which sets versions after prebuild

PARENT_PLIST="\${SRCROOT}/LumiMD/Info.plist"

if [ -f "$PARENT_PLIST" ]; then
    PARENT_BUILD=$(/usr/libexec/PlistBuddy -c "Print CFBundleVersion" "$PARENT_PLIST" 2>/dev/null)
    PARENT_VERSION=$(/usr/libexec/PlistBuddy -c "Print CFBundleShortVersionString" "$PARENT_PLIST" 2>/dev/null)
    
    if [ -n "$PARENT_BUILD" ] && [ -n "$PARENT_VERSION" ]; then
        echo "Widget version sync: $PARENT_VERSION (build $PARENT_BUILD)"
        
        # Export for the build system
        export CURRENT_PROJECT_VERSION="$PARENT_BUILD"
        export MARKETING_VERSION="$PARENT_VERSION"
        
        # Update the widget's Info.plist directly
        WIDGET_PLIST="\${SRCROOT}/../targets/widget/Info.plist"
        if [ -f "$WIDGET_PLIST" ]; then
            /usr/libexec/PlistBuddy -c "Delete :CFBundleVersion" "$WIDGET_PLIST" 2>/dev/null || true
            /usr/libexec/PlistBuddy -c "Add :CFBundleVersion string $PARENT_BUILD" "$WIDGET_PLIST"
            /usr/libexec/PlistBuddy -c "Delete :CFBundleShortVersionString" "$WIDGET_PLIST" 2>/dev/null || true
            /usr/libexec/PlistBuddy -c "Add :CFBundleShortVersionString string $PARENT_VERSION" "$WIDGET_PLIST"
            echo "Updated widget Info.plist with version $PARENT_VERSION ($PARENT_BUILD)"
        fi
    fi
fi
`;

const withWidgetVersionSync = (config) => {
    // First pass: Add run script to widget target
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

        // Add run script build phase for version sync
        const buildPhases = xcodeProject.pbxNativeTargetSection()[widgetTargetKey].buildPhases || [];
        const hasVersionSync = buildPhases.some(phase => {
            const phaseSection = xcodeProject.hash.project.objects['PBXShellScriptBuildPhase'];
            if (phaseSection && phaseSection[phase.value]) {
                const phaseObj = phaseSection[phase.value];
                return phaseObj.name && phaseObj.name.includes('Sync Version');
            }
            return false;
        });

        if (!hasVersionSync) {
            console.log('[withWidgetVersionSync] Adding version sync run script');
            
            // Escape the script for Xcode pbxproj format
            const escapedScript = VERSION_SYNC_SCRIPT
                .replace(/\\/g, '\\\\')
                .replace(/"/g, '\\"')
                .replace(/\n/g, '\\n');
            
            xcodeProject.addBuildPhase(
                [],
                'PBXShellScriptBuildPhase',
                '[Widget] Sync Version',
                widgetTargetKey,
                {
                    shellPath: '/bin/sh',
                    shellScript: escapedScript,
                }
            );
        }

        return config;
    });

    // Second pass: Sync versions in pbxproj directly (for non-EAS builds)
    config = withDangerousMod(config, ['ios', async (config) => {
        const projectRoot = config.modRequest.projectRoot;
        const pbxprojPath = path.join(projectRoot, 'ios', 'LumiMD.xcodeproj', 'project.pbxproj');

        if (!fs.existsSync(pbxprojPath)) {
            return config;
        }

        let content = fs.readFileSync(pbxprojPath, 'utf-8');
        
        // Get app version from config
        const appVersion = config.version || '1.0.0';
        const buildNumber = config.ios?.buildNumber || '1';

        console.log(`[withWidgetVersionSync] Syncing widget to version ${appVersion} (${buildNumber})`);

        // Find parent app's actual CURRENT_PROJECT_VERSION in pbxproj
        let parentBuild = buildNumber;
        const parentBuildMatch = content.match(/\/\* LumiMD \*\/.*?CURRENT_PROJECT_VERSION = (\d+);/s);
        if (parentBuildMatch) {
            parentBuild = parentBuildMatch[1];
        }

        // Update widget build settings
        // Match widget build configurations and update their version settings
        const widgetConfigPattern = /(\/\*.*widget.*\*\/[\s\S]*?buildSettings = \{[\s\S]*?)(CURRENT_PROJECT_VERSION = )\d+(;[\s\S]*?MARKETING_VERSION = )[^;]+(;)/g;
        
        let updated = false;
        content = content.replace(widgetConfigPattern, (match, prefix, cpvKey, midPart, mvKey, suffix) => {
            updated = true;
            return `${prefix}${cpvKey}${parentBuild}${midPart}${appVersion}${suffix}`;
        });

        // Alternative pattern for widget configs
        const buildSettingsPattern = /buildSettings = \{([^}]*INFOPLIST_FILE = [^}]*targets\/widget[^}]*)\}/g;
        content = content.replace(buildSettingsPattern, (match, inner) => {
            let newInner = inner;
            
            // Update CURRENT_PROJECT_VERSION
            if (newInner.includes('CURRENT_PROJECT_VERSION')) {
                newInner = newInner.replace(/CURRENT_PROJECT_VERSION = \d+;/g, `CURRENT_PROJECT_VERSION = ${parentBuild};`);
                updated = true;
            }
            
            // Update MARKETING_VERSION  
            if (newInner.includes('MARKETING_VERSION')) {
                newInner = newInner.replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${appVersion};`);
                updated = true;
            }
            
            return `buildSettings = {${newInner}}`;
        });

        if (updated) {
            fs.writeFileSync(pbxprojPath, content);
            console.log('[withWidgetVersionSync] Updated widget build settings');
        }

        return config;
    }]);

    return config;
};

module.exports = withWidgetVersionSync;
