/** @type {import('ts-jest').JestConfigWithTsJest} */
export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.ts'],
  rootDir: '.',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  moduleDirectories: ['node_modules'],
  resolver: '<rootDir>/jest-resolver.cjs',
  extensionsToTreatAsEsm: ['.ts'],
  transformIgnorePatterns: [],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: true,
      },
    ],
  },
};
