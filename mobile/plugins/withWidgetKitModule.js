/**
 * Expo Config Plugin: WidgetKit Native Module
 * 
 * Adds a native module to call WidgetKit.reloadAllTimelines() from React Native.
 * This allows the app to instantly refresh the iOS widget when medication data changes.
 */

const { withDangerousMod, withXcodeProject } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

// Swift module code (added to AppDelegate.swift or standalone file)
const SWIFT_MODULE_CODE = `
// MARK: - WidgetKit Native Module
import WidgetKit

@objc(LumiWidgetKit)
class LumiWidgetKitModule: NSObject, RCTBridgeModule {
  static func moduleName() -> String! {
    "LumiWidgetKit"
  }

  static func requiresMainQueueSetup() -> Bool {
    false
  }

  @objc func reloadAllTimelines() {
    if #available(iOS 14.0, *) {
      WidgetCenter.shared.reloadAllTimelines()
    }
  }
}
`;

// Objective-C bridge file content
const OBJC_BRIDGE_CODE = `//
//  LumiWidgetKitModule.m
//  LumiMD
//
//  Expo config plugin generated file.
//  Bridges Swift WidgetKit module to React Native.
//

#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(LumiWidgetKit, NSObject)

RCT_EXTERN_METHOD(reloadAllTimelines)

@end
`;

/**
 * Add WidgetKit import and module to AppDelegate.swift
 */
function modifyAppDelegate(appDelegatePath) {
  let contents = fs.readFileSync(appDelegatePath, 'utf-8');

  // Check if already modified
  if (contents.includes('LumiWidgetKitModule')) {
    console.log('[withWidgetKitModule] AppDelegate already contains WidgetKit module');
    return;
  }

  // Add WidgetKit import if not present
  if (!contents.includes('import WidgetKit')) {
    contents = contents.replace(
      'import Expo',
      'import Expo\nimport WidgetKit'
    );
  }

  // Add module at the end of the file
  contents = contents.trimEnd() + '\n' + SWIFT_MODULE_CODE;

  fs.writeFileSync(appDelegatePath, contents);
  console.log('[withWidgetKitModule] Added WidgetKit module to AppDelegate.swift');
}

/**
 * Create the Objective-C bridge file
 */
function createObjCBridge(iosPath, projectName) {
  const bridgeFilePath = path.join(iosPath, projectName, 'LumiWidgetKitModule.m');

  // Write the bridge file
  fs.writeFileSync(bridgeFilePath, OBJC_BRIDGE_CODE);
  console.log('[withWidgetKitModule] Created LumiWidgetKitModule.m');

  return bridgeFilePath;
}

/**
 * Add file to Xcode project
 */
const withWidgetKitXcodeProject = (config) => {
  return withXcodeProject(config, async (config) => {
    const xcodeProject = config.modResults;
    const projectName = config.modRequest.projectName;

    const bridgeFileName = 'LumiWidgetKitModule.m';
    const bridgeFilePath = `${projectName}/${bridgeFileName}`;

    // Check if file already in sources build phase
    const sourcesPhase = xcodeProject.pbxSourcesBuildPhaseObj();
    if (sourcesPhase) {
      const files = sourcesPhase.files || [];
      const alreadyAdded = files.some(f =>
        f.comment && f.comment.includes(bridgeFileName)
      );
      if (alreadyAdded) {
        console.log('[withWidgetKitModule] File already in Xcode project');
        return config;
      }
    }

    // Get the main group (project root group)
    const mainGroup = xcodeProject.getFirstProject().firstProject.mainGroup;

    // Find or create the app group
    const groups = xcodeProject.hash.project.objects['PBXGroup'];
    let appGroupKey = null;

    for (const key in groups) {
      if (key.endsWith('_comment')) continue;
      const group = groups[key];
      if (group.name === projectName || group.path === projectName) {
        appGroupKey = key;
        break;
      }
    }

    // Add the file to the project using a simpler method
    // that doesn't rely on variant groups
    const target = xcodeProject.getFirstTarget();
    if (target) {
      try {
        // Use addFile which is more robust
        const file = xcodeProject.addFile(bridgeFilePath, appGroupKey, {
          target: target.uuid,
          lastKnownFileType: 'sourcecode.c.objc'
        });

        if (file) {
          console.log('[withWidgetKitModule] Added LumiWidgetKitModule.m to Xcode project');
        }
      } catch (err) {
        // If addFile fails, try adding directly to sources build phase
        console.log('[withWidgetKitModule] Fallback: Adding file reference manually');
        const fileRef = xcodeProject.generateUuid();
        const buildFile = xcodeProject.generateUuid();

        // Add file reference
        xcodeProject.addToPbxFileReferenceSection({
          uuid: fileRef,
          fileRef: fileRef,
          basename: bridgeFileName,
          lastKnownFileType: 'sourcecode.c.objc',
          path: bridgeFilePath,
          sourceTree: '"<group>"'
        });

        // Add to build phase
        xcodeProject.addToPbxBuildFileSection({
          uuid: buildFile,
          fileRef: fileRef,
          basename: bridgeFileName
        });

        // Add to sources build phase
        xcodeProject.addToPbxSourcesBuildPhase({
          uuid: buildFile,
          target: target.uuid,
          basename: bridgeFileName
        });

        console.log('[withWidgetKitModule] Added LumiWidgetKitModule.m via fallback method');
      }
    }

    return config;
  });
};

/**
 * Main plugin: modify native files
 */
const withWidgetKitModule = (config) => {
  // Step 1: Add Swift code and create Obj-C bridge file
  config = withDangerousMod(config, [
    'ios',
    async (config) => {
      const iosPath = path.join(config.modRequest.projectRoot, 'ios');
      const projectName = config.modRequest.projectName;
      const appDelegatePath = path.join(iosPath, projectName, 'AppDelegate.swift');

      // Modify AppDelegate to include the Swift module
      if (fs.existsSync(appDelegatePath)) {
        modifyAppDelegate(appDelegatePath);
      } else {
        console.warn('[withWidgetKitModule] AppDelegate.swift not found');
      }

      // Create the Objective-C bridge file
      createObjCBridge(iosPath, projectName);

      return config;
    },
  ]);

  // Step 2: Add the Obj-C file to Xcode project build phases
  config = withWidgetKitXcodeProject(config);

  return config;
};

module.exports = withWidgetKitModule;
