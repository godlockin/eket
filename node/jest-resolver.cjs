/**
 * Custom Jest resolver to map .js imports to .ts source files
 * This handles the ES module pattern where TypeScript source uses .js extensions
 * but Jest needs to resolve to .ts files for transformation
 */

const path = require('path');
const fs = require('fs');

// Get project root (parent directory of this resolver file)
const projectRoot = path.dirname(__filename);

module.exports = function resolver(request, options) {
  const { basedir, defaultResolver } = options;

  // Let node_modules resolve normally
  if (!request.startsWith('.') && !request.startsWith('/') && !request.startsWith('@')) {
    return defaultResolver(request, options);
  }

  // Handle @/ alias - map to project root src/ directory
  if (request.startsWith('@/')) {
    const requestWithoutAlias = request.slice(2); // Remove @/
    const tsRequest = requestWithoutAlias.replace(/\.js$/, '.ts');

    // Build path from project root
    const absolutePath = path.join(projectRoot, 'src', tsRequest);

    if (fs.existsSync(absolutePath)) {
      return absolutePath;
    }

    // Fall back to default resolution (will fail with proper error)
    return defaultResolver(request, options);
  }

  // Handle .js -> .ts mapping for relative imports
  if (request.endsWith('.js')) {
    const tsRequest = request.replace(/\.js$/, '.ts');

    // Resolve relative to basedir
    const tsPath = path.resolve(basedir, tsRequest);

    if (fs.existsSync(tsPath)) {
      return tsPath;
    }

    // Also try resolving from project root for paths like ../../integration/
    // Calculate the absolute path by going up from basedir
    const normalized = path.normalize(tsRequest);
    const absolutePath = path.resolve(basedir, normalized);

    if (fs.existsSync(absolutePath)) {
      return absolutePath;
    }
  }

  // Fall back to default resolution
  return defaultResolver(request, options);
};
