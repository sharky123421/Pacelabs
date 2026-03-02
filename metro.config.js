// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Single worker to avoid watcher/worker deadlocks when Watchman is off
config.maxWorkers = 1;

module.exports = config;
