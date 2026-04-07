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
    const result = defaultResolver(request, options);
    if (typeof result === 'string' && result.includes('/src/')) {
      process.stderr.write(`[RESOLVER DEBUG] bare "${request}" from "${basedir}" → "${result}"\n`);
    }
    return result;
  }

  // Log ALL resolutions to help debug
  let _result;
  try {
    _result = _resolveInner(request, options, basedir, defaultResolver);
  } catch(e) {
    process.stderr.write(`[RESOLVER ERROR] "${request}" from "${basedir}" threw: ${e.message}\n`);
    throw e;
  }
  if (typeof _result === 'string' && _result.includes('constants')) {
    process.stderr.write(`[RESOLVER DEBUG] "${request}" from "${basedir}" → "${_result}"\n`);
  }
  return _result;
};

function _resolveInner(request, options, basedir, defaultResolver) {

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

  // Handle extension-less relative imports (e.g. '../core/circuit-breaker') -> try .ts
  if (!path.extname(request) && (request.startsWith('./') || request.startsWith('../'))) {
    // First: resolve relative to basedir (works for same-level imports)
    const tsPath = path.resolve(basedir, request + '.ts');
    if (fs.existsSync(tsPath)) {
      return tsPath;
    }
    // Second: ONLY for '../'-prefixed imports from tests/ dir:
    // '../core/X' from tests/ = src/core/X.ts
    // Do NOT apply this to './' imports - those should stay within their own package
    if (request.startsWith('../')) {
      const srcRelative = request.replace(/^\.\.\//, '');
      const srcPath = path.join(projectRoot, 'src', srcRelative + '.ts');
      if (fs.existsSync(srcPath)) {
        return srcPath;
      }
    }
    // Also try index.ts for directory imports
    const indexPath = path.resolve(basedir, request, 'index.ts');
    if (fs.existsSync(indexPath)) {
      return indexPath;
    }
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
}
