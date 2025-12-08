// Learn more https://docs.expo.dev/guides/customizing-metro
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

const workspaceRoot = path.resolve(__dirname, '..');
const sdkPath = path.resolve(workspaceRoot, 'packages/sdk');

// Watch only the necessary folders to reduce Watchman load
config.watchFolders = [
  __dirname, // mobile/
  sdkPath,   // packages/sdk/
];

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
