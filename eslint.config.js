import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    { ignores: ['dist/', '**/dist/', 'node_modules/'] },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        files: ['scripts/**/*.mjs', 'eslint.config.js'],
        languageOptions: { globals: { process: 'readonly', console: 'readonly' } },
    },
    prettier,
);
