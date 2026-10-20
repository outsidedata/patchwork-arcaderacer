import js from '@eslint/js'
import { defineConfig } from 'eslint/config'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'

// The editor is a React app: its own code, its extensions and their backend routes.
export default defineConfig([
  { ignores: ['dist/**', 'node_modules/**', '.claude/**'] },
  {
    files: ['editor/**/*.{ts,tsx}', 'extensions/**/*.{ts,tsx}', '**/*.extension.tsx', '**/*.route.ts'],
    extends: [js.configs.recommended, tseslint.configs.recommended, reactHooks.configs.flat['recommended-latest']],
    languageOptions: { ecmaVersion: 2022, globals: { ...globals.browser, ...globals.node } },
  },
])
