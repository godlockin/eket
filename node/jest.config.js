/** @type {import('ts-jest').JestConfigWithTsJest} */
export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.ts'],
  testPathIgnorePatterns: [
    '/node_modules/',
    'i18n-integration\\.test\\.ts', // 使用自定义测试框架，非 Jest 测试
    'master-election\\.test\\.ts',  // pre-existing: sqlite-async-client uses import.meta.url, incompatible with Jest transform
  ],
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
