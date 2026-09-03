/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: { esModuleInterop: true, module: 'commonjs' } }],
  },
  testMatch: ['<rootDir>/__tests__/**/*.test.ts'],
};
