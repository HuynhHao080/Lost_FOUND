// Shim for server-only module - must be loaded before any other modules
const originalRequire = require;
require = function(mod) {
  if (mod === 'server-only') {
    return {};
  }
  return originalRequire(mod);
};