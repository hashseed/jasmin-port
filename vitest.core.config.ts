import { defineConfig } from 'vitest/config';

// Unit tests for the interpreter core and the headless runner, in plain Node with
// no DOM, which also proves core/ does not depend on the browser. Component tests
// run separately through `ng test`.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/app/core/**/*.spec.ts', 'src/headless/**/*.spec.ts'],
  },
});
