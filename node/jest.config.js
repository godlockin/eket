/** @type {import('ts-jest').JestConfigWithTsJest} */
export default {
  preset: 'ts-jest/presets/default',
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.ts'],
  rootDir: '.',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  moduleDirectories: ['node_modules', 'src'],
  resolver: '<rootDir>/jest-resolver.cjs',
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: false,
      },
    ],
  },
};
