// Cloud Functions の ESLint 設定（firebase deploy の predeploy で `npm run lint` が実行される）
module.exports = {
  root: true,
  env: {
    es6: true,
    node: true,
  },
  extends: [
    'eslint:recommended',
    'plugin:import/errors',
    'plugin:import/warnings',
    'plugin:import/typescript',
    'google',
    'plugin:@typescript-eslint/recommended',
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: ['tsconfig.json'],
    sourceType: 'module',
    tsconfigRootDir: __dirname,
  },
  ignorePatterns: [
    '/lib/**/*', // ビルド結果
    '/test/**/*', // node:test のテスト（tsconfig の対象外）
    '.eslintrc.js',
  ],
  plugins: ['@typescript-eslint', 'import'],
  rules: {
    'quotes': ['error', 'single'],
    // Windows では git の autocrlf で CRLF になるため、改行コードは検査しない
    'linebreak-style': 0,
    // 型は TypeScript で書くので、JSDoc の @param / @return は必須にしない（valid-jsdoc は ESLint で非推奨）
    'valid-jsdoc': 0,
    'require-jsdoc': 0,
    'import/no-unresolved': 0,
    'indent': ['error', 2],
    'max-len': ['error', { code: 120 }],
    'object-curly-spacing': ['error', 'always'],
  },
};
