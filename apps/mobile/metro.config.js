// Metro has to be told about the workspace, twice.
//
// The decoder and the collector are sibling packages rather than published
// dependencies, so Metro is pointed at the repository root to watch them, and at
// both node_modules directories to resolve them. Without this the app builds
// against nothing and fails at the first import.

const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
