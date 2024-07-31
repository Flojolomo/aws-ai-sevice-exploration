const { setup } = require("bs-logger");

module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/lib'],
  testMatch: ['**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': 'ts-jest'
  },
  setupFiles: [
      "<rootDir>/setEnvVars.js"
    ]
};
