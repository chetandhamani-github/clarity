const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Tree-shake @expo/vector-icons:
// Redirect '@expo/vector-icons' to our lightweight shim that only imports MaterialIcons,
// preventing Metro from bundling 17 unused .ttf font families (~4MB).
const originalResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === '@expo/vector-icons') {
    return {
      filePath: path.resolve(__dirname, 'src/utils/vector-icons.ts'),
      type: 'sourceFile',
    };
  }
  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

// Optimization: Strip console.log, console.info, console.debug in production release builds.
// Preserves console.warn and console.error for critical runtime alerts.
config.transformer.minifierConfig = {
  ...config.transformer.minifierConfig,
  compress: {
    ...config.transformer.minifierConfig?.compress,
    pure_funcs: ['console.log', 'console.info', 'console.debug'],
  },
};

module.exports = config;

