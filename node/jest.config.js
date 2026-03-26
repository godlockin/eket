/** @type {import('ts-jest').JestConfigWithTsJest} */
export default {
  preset: 'ts-jest/presets/default',
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.ts'],
  rootDir: '.',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  moduleDirectories: ['node_modules', 'src'],
  moduleNameMapper: {
    // Map imports from tests (../core/*, ../types/*) to src directory
    '^\\.\\./core/(.+)\\.js$': '<rootDir>/src/core/$1.ts',
    '^\\.\\./core/(.+)$': '<rootDir>/src/core/$1.ts',
    '^\\.\\./types/(.+)\\.js$': '<rootDir>/src/types/$1.ts',
    '^\\.\\./types/(.+)$': '<rootDir>/src/types/$1.ts',
    // Map same-directory imports within src/core
    '^\\./(redis-client|sqlite-client|message-queue|circuit-breaker|communication-protocol|file-queue-manager|cache-layer|master-election|connection-manager)\\.js$': '<rootDir>/src/core/$1.ts',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: {
          module: 'commonjs',
          moduleResolution: 'node',
          esModuleInterop: true,
          allowSyntheticDefaultImports: true,
        },
      },
    ],
  },
};
