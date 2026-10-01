import { defineConfig } from 'vitest/config';

// Unit tests for the interpreter core, the I/O device models and the headless runner,
// in plain Node with no DOM, which also proves core/ and devices/ do not depend on the
// browser. Component tests
// run separately through `ng test`.
export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'src/app/core/**/*.spec.ts',
      'src/app/devices/**/*.spec.ts',
      'src/headless/**/*.spec.ts',
    ],
  },
});
