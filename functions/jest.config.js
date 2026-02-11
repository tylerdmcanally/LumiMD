/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: [
    '**/__tests__/**/*.test.ts',
    '**/*.test.ts'
  ],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/index.ts',
    '!src/**/__tests__/**'
  ],
  coverageThreshold: {
    global: {
      statements: 5,
      branches: 5,
      lines: 5,
      functions: 5,
    },
  },
  coverageReporters: ['text', 'lcov', 'html'],
  verbose: true,
  // Mock Firebase Admin SDK by default
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.ts'],
  // Handle module resolution
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1'
  },
  // Ignore compiled output
  testPathIgnorePatterns: ['/node_modules/', '/lib/'],
  // Faster transforms
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: 'tsconfig.json'
    }]
  }
};
