/**
 * Single Jest project covering engine unit tests, fast-check property tests,
 * golden persona fixtures, and Supertest integration tests.
 *
 * Integration tests hit a dedicated SQLite file (prisma/test.db) that is
 * recreated by the `pretest` npm script before this config ever runs, so
 * `runInBand` avoids concurrent writers against the same SQLite file.
 */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testEnvironment: 'node',
  testRegex: '(test/(unit|golden|integration)/.*|src/.*)\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  collectCoverageFrom: ['src/**/*.(t|j)s', '!src/main.ts'],
  coverageDirectory: './coverage',
  testTimeout: 30000,
  maxWorkers: 1,
};
