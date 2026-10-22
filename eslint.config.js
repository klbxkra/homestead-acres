import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist/', 'node_modules/', 'dev-dist/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.browser },
    },
  },
  {
    // Node-side config files and build scripts
    files: ['*.config.{js,ts}', 'scripts/**/*.mjs'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    // PLAN.md principle 3: the simulation must be deterministic and platform-free.
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        { object: 'Date', property: 'now', message: 'core/ must take `now` as a parameter.' },
        { object: 'Math', property: 'random', message: 'core/ must use the seeded RNG in rng.ts.' },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'window', message: 'core/ must not touch the DOM.' },
        { name: 'document', message: 'core/ must not touch the DOM.' },
        { name: 'localStorage', message: 'Storage belongs in persistence/.' },
        { name: 'indexedDB', message: 'Storage belongs in persistence/.' },
        { name: 'navigator', message: 'Platform APIs belong in platform/.' },
        { name: 'setTimeout', message: 'core/ has no timers; time is passed in.' },
        { name: 'setInterval', message: 'core/ has no timers; time is passed in.' },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['phaser', 'preact', 'preact/*'], message: 'core/ must not depend on rendering or UI.' },
            { group: ['**/game/**', '**/ui/**', '**/persistence/**', '**/platform/**', '**/net/**'], message: 'core/ must not import outer layers.' },
          ],
        },
      ],
    },
  },
  {
    // PLAN.md principle 7: browser storage only inside persistence/.
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/persistence/**', 'src/core/**'],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'localStorage', message: 'Use a SaveStore from persistence/.' },
        { name: 'sessionStorage', message: 'Use a SaveStore from persistence/.' },
        { name: 'indexedDB', message: 'Use a SaveStore from persistence/.' },
      ],
    },
  },
);
