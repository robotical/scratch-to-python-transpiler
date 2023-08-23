module.exports = {
  setupFiles: ["jest-localstorage-mock"],
  roots: ['<rootDir>'],
  testMatch: [
    "**/__tests__/**/?(*.)+test.+(ts|tsx|js)",
    "**/__tests__/**/?(*.)+(spec|test).+(ts|tsx|js)"
  ],
  transform: {
    "^.+\\.(ts|tsx)$": "ts-jest"
  },
}
