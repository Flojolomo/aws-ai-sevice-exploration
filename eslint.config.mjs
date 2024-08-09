import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  eslintConfigPrettier,
  {
    languageOptions: {
      parserOptions: {
        project: true
      },
    },
  },
  { 
    "ignores": ["cdk.out", "node_modules", "demo-data", "**/*.d.ts"],
    files: [
        "**/*.ts",
        "**/*.cts",
        "**.*.mts"
    ],
    "rules": {
      "no-unused-vars": [2, {"vars": "all", "args": "after-used"}],
      "@typescript-eslint/no-unused-vars": "off"
    }
  }
);