// Learn more https://docs.expo.dev/guides/customizing-metro
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

const workspaceRoot = path.resolve(__dirname, '..');
const sdkPath = path.resolve(workspaceRoot, 'packages/sdk');

// Include Expo defaults and add the workspace SDK for monorepo support
const defaultWatchFolders = config.watchFolders || [];
config.watchFolders = Array.from(new Set([
  ...defaultWatchFolders,
  sdkPath, // packages/sdk/
]));

// Only use local node_modules - hoisted packages will be found via symlinks
config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// Ignore unnecessary directories to reduce watch overhead
config.resolver.blockList = [
  /functions\/.*/,
  /web-portal\/.*/,
  /bash\/.*/,
  /docs\/.*/,
  /\.git\/.*/,
];

module.exports = config;
