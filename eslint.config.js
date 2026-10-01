// @ts-check
const eslint = require('@eslint/js');
const { defineConfig } = require('eslint/config');
const tseslint = require('typescript-eslint');
const angular = require('angular-eslint');

module.exports = defineConfig([
  {
    files: ['**/*.ts'],
    extends: [
      eslint.configs.recommended,
      tseslint.configs.recommended,
      tseslint.configs.stylistic,
      angular.configs.tsRecommended,
    ],
    processor: angular.processInlineTemplates,
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@angular-eslint/directive-selector': [
        'error',
        {
          type: 'attribute',
          prefix: 'app',
          style: 'camelCase',
        },
      ],
      '@angular-eslint/component-selector': [
        'error',
        {
          type: 'element',
          prefix: 'app',
          style: 'kebab-case',
        },
      ],
    },
  },
  {
    // The interpreter core runs in the browser and under Node (spec 01 §2, 08 §4):
    // no Angular, RxJS, Node or browser APIs. The device models (devices/) follow the
    // same rules so they are unit-tested in plain Node; their canvases live in ui/devices.
    files: ['src/app/core/**/*.ts', 'src/app/devices/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@angular/*', 'rxjs', 'rxjs/*'],
              message: 'core/ and devices/ must not depend on Angular or RxJS.',
            },
            {
              group: ['node:*', 'fs', 'path'],
              message: 'core/ and devices/ must not depend on Node APIs.',
            },
            {
              group: ['**/ui/**', '**/services/**'],
              message: 'core/ and devices/ must not import UI code.',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        ...[
          'window',
          'document',
          'navigator',
          'localStorage',
          'sessionStorage',
          'location',
          'requestAnimationFrame',
          'process',
          'Buffer',
        ].map((name) => ({
          name,
          message: 'core/ and devices/ must not use browser or Node globals.',
        })),
      ],
    },
  },
  {
    files: ['src/headless/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@angular/*', 'rxjs', 'rxjs/*', '**/ui/**', '**/services/**'],
              message: 'The headless runner imports core/ only.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['**/*.html'],
    extends: [angular.configs.templateRecommended, angular.configs.templateAccessibility],
    rules: {},
  },
]);
