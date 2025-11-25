// Learn more https://docs.expo.dev/guides/customizing-metro
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

const workspaceRoot = path.resolve(__dirname, '..');

// Keep Expo's default watch folders + add the workspace root so Metro
// can resolve the hoisted packages without crawling arbitrary parents.
config.watchFolders = [...config.watchFolders, workspaceRoot];

config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// Prevent Metro from picking up duplicate React copies above the workspace.
// If Watchman ever complains about \"recrawl\", run:
//   watchman watch-del '/Users/tylermcanally/Desktop/LumiMD'
//   watchman watch-project '/Users/tylermcanally/Desktop/LumiMD'
config.resolver.disableHierarchicalLookup = true;
config.resolver.unstable_enableSymlinks = true;

module.exports = config;